-- ═══════════════════════════════════════════════════════════════════
-- CHIP! CHIP! 칩칩! — 사설 리그(Private Leagues) (2026-07-08)
-- 초대 코드 기반 소규모 리그 + 기간 이벤트(점심/술값 내기) + 승자 선언
--
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 실행.
--            반드시 리그 클라이언트(js/leagues.js) 배포 "전에" 실행할 것.
--            (RPC가 없으면 클라는 조용히 비활성 — 게임은 정상 동작)
--
-- 설계 원칙 (랭킹 v2 leaderboard_v2.sql 관례 그대로):
--  - 신원: 기존 players(id, secret) 익명 계정 재사용. 리그는 players.id로 엮음.
--  - 모든 쓰기/읽기는 SECURITY DEFINER RPC로만 (테이블 RLS on + 정책 없음).
--    anon 키는 공개 전제 → 각 RPC가 (p_id, p_secret)를 players로 검증 + 권한/캡.
--  - 점수 통합: 리그 순위는 기존 scores 테이블을 멤버십으로 필터한 "뷰"다.
--    별도 리그 점수 없음. 한 판 = scores 한 행 = 전역 랭킹 + 모든 소속 리그 동시 반영.
--  - 이벤트 승자 선언: 스케줄러 없이 lazy-freeze(읽기 RPC가 마감 이벤트를 동결).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────── [B-1] 증설 — 무중단, 지금 실행 ───────────────

-- 1) 리그 (초대 코드 = 공유 비밀)
create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  name        text not null,
  owner_id    uuid not null,               -- players.id (논리 FK; RPC에서 검증)
  member_cap  int  not null default 50,    -- 어뷰징 방지 상한
  created_at  timestamptz not null default now()
);
create unique index if not exists leagues_code_ux on public.leagues (upper(code));
create index if not exists leagues_owner_ix on public.leagues (owner_id);
alter table public.leagues enable row level security;   -- RLS on + 정책 없음 → RPC 전용

-- 2) 멤버십
create table if not exists public.league_members (
  league_id  uuid not null references public.leagues(id) on delete cascade,
  player_id  uuid not null,                -- players.id
  role       text not null default 'member',  -- 'owner' | 'member'
  joined_at  timestamptz not null default now(),
  primary key (league_id, player_id)
);
create index if not exists league_members_player_ix on public.league_members (player_id);
alter table public.league_members enable row level security;

-- 3) 이벤트 (리그당 동시 1개 라이브)
create table if not exists public.league_events (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references public.leagues(id) on delete cascade,
  title             text not null,
  created_at        timestamptz not null default now(),
  ends_at           timestamptz not null,
  frozen            boolean not null default false,
  winner_player_id  uuid,
  winner_nickname   text,
  winner_score      int
);
-- 라이브(미동결) 이벤트는 리그당 최대 1개
create unique index if not exists league_events_one_live_ux
  on public.league_events (league_id) where not frozen;
create index if not exists league_events_league_ix on public.league_events (league_id);
alter table public.league_events enable row level security;

-- ─────────────── 보조 함수 (내부 전용, anon grant 없음) ───────────────

-- 초대 코드 생성 — 혼동 문자(0/O/1/I/L) 제외 6자, DB 충돌 재시도
create or replace function public._gen_league_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31자, 0/O/1/I/L 제외
  n int := char_length(alphabet);
  v_code text;
  i int;
begin
  for attempt in 1..20 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, floor(random() * n)::int + 1, 1);
    end loop;
    if not exists (select 1 from public.leagues where upper(code) = v_code) then
      return v_code;
    end if;
  end loop;
  return v_code;  -- 극히 드문 폴백 — 호출부가 unique_violation으로 재시도
end $$;

-- 마감 이벤트 동결 + 승자 선언 (스케줄러 없이 읽기 RPC가 호출). 멱등.
create or replace function public._freeze_due_events(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.league_events%rowtype;
  w  record;
begin
  for ev in
    select * from public.league_events
    where league_id = p_league_id and not frozen and ends_at <= now()
  loop
    -- 승자 = 이벤트 기간 내 멤버 최고점 (참가 이후 점수만: greatest(joined_at, created_at))
    select s.player_id as pid, coalesce(pl.nickname, s.nickname) as nick, s.score as sc
      into w
    from (
      select distinct on (sc.player_id) sc.player_id, sc.nickname, sc.score
      from public.scores sc
      join public.league_members m
        on m.player_id = sc.player_id and m.league_id = ev.league_id
      where sc.player_id is not null
        and sc.created_at >= greatest(m.joined_at, ev.created_at)
        and sc.created_at <= ev.ends_at
      order by sc.player_id, sc.score desc
    ) s
    left join public.players pl on pl.id = s.player_id
    order by s.score desc
    limit 1;

    update public.league_events
      set frozen = true,
          winner_player_id = w.pid,      -- 참가자/점수 없으면 null (무승부/공석)
          winner_nickname  = w.nick,
          winner_score     = w.sc
      where id = ev.id and not frozen;   -- 조건부 → 동시성 멱등
  end loop;
end $$;

-- ─────────────── RPC (anon grant, secret 검증) ───────────────

-- 리그 생성 → {status, id, code, name}
create or replace function public.create_league(p_id uuid, p_secret uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text;
  v_name text := trim(p_name);
  v_code text;
  v_id   uuid;
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 24 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if (select count(*) from public.leagues where owner_id = p_id) >= 5 then
    return jsonb_build_object('status', 'limit');
  end if;

  for attempt in 1..5 loop
    begin
      v_code := public._gen_league_code();
      insert into public.leagues (code, name, owner_id)
        values (v_code, v_name, p_id)
        returning id into v_id;
      insert into public.league_members (league_id, player_id, role)
        values (v_id, p_id, 'owner');
      return jsonb_build_object('status', 'ok', 'id', v_id, 'code', v_code, 'name', v_name);
    exception when unique_violation then
      -- 코드 충돌 — 재시도
    end;
  end loop;
  return jsonb_build_object('status', 'error');
end $$;

-- 코드로 참가 → {status: ok|already|full|notfound|limit|invalid, id, name}
create or replace function public.join_league(p_id uuid, p_secret uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick   text;
  v_code   text := upper(trim(p_code));
  v_league public.leagues%rowtype;
  v_count  int;
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return jsonb_build_object('status', 'invalid'); end if;
  if v_code is null or char_length(v_code) < 4 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_league from public.leagues where upper(code) = v_code;
  if not found then return jsonb_build_object('status', 'notfound'); end if;

  if exists (select 1 from public.league_members
             where league_id = v_league.id and player_id = p_id) then
    return jsonb_build_object('status', 'already', 'id', v_league.id, 'name', v_league.name);
  end if;

  select count(*) into v_count from public.league_members where league_id = v_league.id;
  if v_count >= v_league.member_cap then
    return jsonb_build_object('status', 'full');
  end if;

  if (select count(*) from public.league_members where player_id = p_id) >= 20 then
    return jsonb_build_object('status', 'limit');
  end if;

  insert into public.league_members (league_id, player_id, role)
    values (v_league.id, p_id, 'member')
    on conflict do nothing;

  return jsonb_build_object('status', 'ok', 'id', v_league.id, 'name', v_league.name);
end $$;

-- 리그 탈퇴 → ok | transferred | deleted | notfound
create or replace function public.leave_league(p_id uuid, p_secret uuid, p_league_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick      text;
  v_league    public.leagues%rowtype;
  v_new_owner uuid;
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return 'notfound'; end if;

  select * into v_league from public.leagues where id = p_league_id;
  if not found then return 'notfound'; end if;
  if not exists (select 1 from public.league_members
                 where league_id = p_league_id and player_id = p_id) then
    return 'notfound';
  end if;

  if v_league.owner_id = p_id then
    select player_id into v_new_owner
      from public.league_members
      where league_id = p_league_id and player_id <> p_id
      order by joined_at asc
      limit 1;
    if v_new_owner is null then
      delete from public.leagues where id = p_league_id;   -- cascade: 멤버/이벤트 삭제
      return 'deleted';
    end if;
    update public.leagues set owner_id = v_new_owner where id = p_league_id;
    update public.league_members set role = 'owner'
      where league_id = p_league_id and player_id = v_new_owner;
    delete from public.league_members where league_id = p_league_id and player_id = p_id;
    return 'transferred';
  else
    delete from public.league_members where league_id = p_league_id and player_id = p_id;
    return 'ok';
  end if;
end $$;

-- 내 리그 목록 (+ 멤버수, 내 순위, 이벤트 요약). 마감 이벤트 lazy-freeze.
create or replace function public.get_my_leagues(p_id uuid, p_secret uuid)
returns table (
  league_id uuid, code text, name text, is_owner boolean, member_count int,
  my_rank int, event_title text, event_ends_at timestamptz, event_frozen boolean,
  event_leader_nick text, event_leader_score int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick   text;
  r        record;
  v_ev     public.league_events%rowtype;
  v_has_ev boolean;
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return; end if;

  for r in
    select l.id as lid, l.code as lcode, l.name as lname, l.owner_id as lowner
    from public.leagues l
    join public.league_members m on m.league_id = l.id and m.player_id = p_id
    order by m.joined_at desc
  loop
    perform public._freeze_due_events(r.lid);

    league_id := r.lid;
    code      := r.lcode;
    name      := r.lname;
    is_owner  := (r.lowner = p_id);

    select count(*)::int into member_count
      from public.league_members where league_members.league_id = r.lid;

    -- 현재/최근 이벤트 (라이브 우선, 없으면 최근 종료)
    select * into v_ev from public.league_events e
      where e.league_id = r.lid
      order by e.frozen asc, e.ends_at desc
      limit 1;
    v_has_ev := found;

    event_title := null; event_ends_at := null; event_frozen := null;
    event_leader_nick := null; event_leader_score := null;
    my_rank := null;

    if v_has_ev then
      event_title   := v_ev.title;
      event_ends_at := v_ev.ends_at;
      event_frozen  := v_ev.frozen;
      if v_ev.frozen then
        event_leader_nick  := v_ev.winner_nickname;
        event_leader_score := v_ev.winner_score;
      else
        select coalesce(pl.nickname, s.nickname), s.score
          into event_leader_nick, event_leader_score
        from (
          select distinct on (sc.player_id) sc.player_id, sc.nickname, sc.score
          from public.scores sc
          join public.league_members mm
            on mm.player_id = sc.player_id and mm.league_id = r.lid
          where sc.player_id is not null
            and sc.created_at >= greatest(mm.joined_at, v_ev.created_at)
            and sc.created_at <= v_ev.ends_at
          order by sc.player_id, sc.score desc
        ) s
        left join public.players pl on pl.id = s.player_id
        order by s.score desc
        limit 1;
      end if;

      -- 내 순위 = 이벤트 기간 창
      select rnk into my_rank from (
        select s.player_id as pid, rank() over (order by s.score desc)::int as rnk
        from (
          select distinct on (sc.player_id) sc.player_id, sc.score
          from public.scores sc
          join public.league_members mm
            on mm.player_id = sc.player_id and mm.league_id = r.lid
          where sc.player_id is not null
            and sc.created_at >= greatest(mm.joined_at, v_ev.created_at)
            and sc.created_at <= v_ev.ends_at
          order by sc.player_id, sc.score desc
        ) s
      ) ranked where ranked.pid = p_id;
    else
      -- 내 순위 = 전체 기간
      select rnk into my_rank from (
        select s.player_id as pid, rank() over (order by s.score desc)::int as rnk
        from (
          select distinct on (sc.player_id) sc.player_id, sc.score
          from public.scores sc
          join public.league_members mm
            on mm.player_id = sc.player_id and mm.league_id = r.lid
          where sc.player_id is not null
          order by sc.player_id, sc.score desc
        ) s
      ) ranked where ranked.pid = p_id;
    end if;

    return next;
  end loop;
end $$;

-- 리그 순위판 — 멤버 검증 + 멤버 점수만. p_event=false: since 탭 / true: 이벤트 창.
create or replace function public.get_league_board(
  p_id uuid, p_secret uuid, p_league_id uuid,
  p_since timestamptz, p_event boolean default false
)
returns table (nickname text, score int, height int, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
-- OUT 파라미터(nickname/score/height/player_id)가 서브쿼리 컬럼과 이름이 겹치므로
-- 모호할 땐 컬럼을 우선 (return query는 위치 기반 매핑이라 안전)
#variable_conflict use_column
declare
  v_nick text;
  v_ev   public.league_events%rowtype;
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return; end if;
  if not exists (select 1 from public.league_members m
                 where m.league_id = p_league_id and m.player_id = p_id) then
    return;  -- 비멤버에겐 순위 미노출
  end if;

  perform public._freeze_due_events(p_league_id);

  if p_event then
    select * into v_ev from public.league_events e
      where e.league_id = p_league_id
      order by e.frozen asc, e.ends_at desc
      limit 1;
    if not found then return; end if;   -- 이벤트 없음 → 빈 순위

    return query
      select coalesce(pl.nickname, s.nickname), s.score, s.height, s.player_id
      from (
        select distinct on (sc.player_id) sc.player_id, sc.nickname, sc.score, sc.height
        from public.scores sc
        join public.league_members m
          on m.player_id = sc.player_id and m.league_id = p_league_id
        where sc.player_id is not null
          and sc.created_at >= greatest(m.joined_at, v_ev.created_at)
          and sc.created_at <= v_ev.ends_at
        order by sc.player_id, sc.score desc
      ) s
      left join public.players pl on pl.id = s.player_id
      order by s.score desc
      limit 100;
  else
    return query
      select coalesce(pl.nickname, s.nickname), s.score, s.height, s.player_id
      from (
        select distinct on (sc.player_id) sc.player_id, sc.nickname, sc.score, sc.height
        from public.scores sc
        join public.league_members m
          on m.player_id = sc.player_id and m.league_id = p_league_id
        where sc.player_id is not null
          and sc.created_at >= p_since
        order by sc.player_id, sc.score desc
      ) s
      left join public.players pl on pl.id = s.player_id
      order by s.score desc
      limit 100;
  end if;
end $$;

-- 이벤트 시작 (소유자 전용) → ok | exists | notowner | invalid
create or replace function public.start_event(
  p_id uuid, p_secret uuid, p_league_id uuid, p_title text, p_ends_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick   text;
  v_league public.leagues%rowtype;
  v_title  text := trim(p_title);
begin
  select nickname into v_nick from public.players where id = p_id and secret = p_secret;
  if not found then return 'invalid'; end if;

  select * into v_league from public.leagues where id = p_league_id;
  if not found then return 'notowner'; end if;
  if v_league.owner_id <> p_id then return 'notowner'; end if;

  if v_title is null or char_length(v_title) < 1 or char_length(v_title) > 40 then
    return 'invalid';
  end if;
  if p_ends_at is null
     or p_ends_at < now() + interval '1 minute'
     or p_ends_at > now() + interval '30 days' then
    return 'invalid';
  end if;

  perform public._freeze_due_events(p_league_id);  -- 마감 이벤트 먼저 동결 → 라이브 슬롯 확보

  begin
    insert into public.league_events (league_id, title, ends_at)
      values (p_league_id, v_title, p_ends_at);
  exception when unique_violation then
    return 'exists';  -- 이미 라이브 이벤트 진행 중
  end;
  return 'ok';
end $$;

-- 참가 미리보기 (신원 불요 — 코드 자체가 공유 비밀). 리그명·인원·이벤트만 노출.
create or replace function public.get_league_meta(p_code text)
returns table (name text, member_count int, has_event boolean,
               event_title text, event_ends_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues%rowtype;
  v_ev     public.league_events%rowtype;
begin
  select * into v_league from public.leagues where upper(code) = upper(trim(p_code));
  if not found then return; end if;

  perform public._freeze_due_events(v_league.id);

  name := v_league.name;
  select count(*)::int into member_count
    from public.league_members where league_id = v_league.id;

  select * into v_ev from public.league_events e
    where e.league_id = v_league.id and not e.frozen
    order by e.ends_at desc limit 1;
  if found then
    has_event := true; event_title := v_ev.title; event_ends_at := v_ev.ends_at;
  else
    has_event := false; event_title := null; event_ends_at := null;
  end if;
  return next;
end $$;

grant execute on function public.create_league(uuid, uuid, text)                        to anon;
grant execute on function public.join_league(uuid, uuid, text)                          to anon;
grant execute on function public.leave_league(uuid, uuid, uuid)                         to anon;
grant execute on function public.get_my_leagues(uuid, uuid)                             to anon;
grant execute on function public.get_league_board(uuid, uuid, uuid, timestamptz, boolean) to anon;
grant execute on function public.start_event(uuid, uuid, uuid, text, timestamptz)       to anon;
grant execute on function public.get_league_meta(text)                                  to anon;
