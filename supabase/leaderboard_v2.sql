-- ═══════════════════════════════════════════════════════════════════
-- CHIP! CHIP! 칩칩! — 랭킹 v2 (2026-07-05)
-- 익명 플레이어 정체성 + 닉네임 선점(글로벌 유니크) + 점수 제출 보안
--
-- 실행 방법: Supabase 대시보드 → SQL Editor → 아래 [A-1] 블록 전체 실행.
-- [A-2] 잠금은 새 클라이언트 배포 24~48시간 후에 별도 실행
-- (구버전 캐시 클라이언트가 직접 INSERT로 제출하는 기간 배려).
--
-- 설계:
--  - players: 클라이언트가 생성한 (id, secret) UUID 쌍 = 로그인 없는 익명 계정.
--    닉네임은 lower() 유니크 — 먼저 등록한 사람이 소유(선점제).
--  - 모든 쓰기는 SECURITY DEFINER RPC로만: secret 검증 + 서버측 점수 새너티.
--  - scores.player_id: 신규 제출은 정체성에 연결. 레거시 행(null)은
--    해당 닉네임을 선점한 첫 플레이어가 승계(기득권 인정).
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────── [A-1] 증설 — 무중단, 지금 실행 ───────────────

-- 1) 익명 플레이어 + 닉네임 소유권
create table if not exists public.players (
  id         uuid primary key,
  secret     uuid not null,
  nickname   text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists players_nickname_lower_ux
  on public.players (lower(nickname));

-- 직접 접근 차단: RLS on + 정책 없음 → anon은 RPC로만 접근 가능
alter table public.players enable row level security;

-- 2) scores에 플레이어 연결 (레거시 행은 null 유지)
alter table public.scores add column if not exists player_id uuid;
create index if not exists scores_player_id_ix on public.scores (player_id);

-- 3) 닉네임 선점/개명 — 'ok' | 'taken' | 'invalid'
create or replace function public.claim_nickname(p_id uuid, p_secret uuid, p_nickname text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := trim(p_nickname);
  v_row  public.players%rowtype;
begin
  if p_id is null or p_secret is null then return 'invalid'; end if;
  if v_nick is null or char_length(v_nick) < 2 or char_length(v_nick) > 12 then
    return 'invalid';
  end if;

  select * into v_row from public.players where lower(nickname) = lower(v_nick);
  if found then
    if v_row.id = p_id and v_row.secret = p_secret then
      return 'ok'; -- 이미 내 소유 (재확인/재접속)
    end if;
    return 'taken';
  end if;

  -- 내 정체성이 이미 다른 닉을 보유하면 개명, 아니면 신규 선점
  update public.players set nickname = v_nick
    where id = p_id and secret = p_secret;
  if not found then
    insert into public.players (id, secret, nickname) values (p_id, p_secret, v_nick);
  end if;

  -- 레거시 기득권 승계: 아직 주인 없는 같은 닉네임의 과거 기록을 연결
  update public.scores set player_id = p_id
    where lower(nickname) = lower(v_nick) and player_id is null;

  return 'ok';
exception when unique_violation then
  return 'taken'; -- 동시 선점 경합 — 늦은 쪽 거부
end $$;

-- 4) 점수 제출 — secret 검증 + 서버측 새너티 (위변조 차단)
create or replace function public.submit_score(p_id uuid, p_secret uuid, p_score int, p_height int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text;
begin
  select nickname into v_nick from public.players
    where id = p_id and secret = p_secret;
  if not found then return false; end if;

  -- 새너티: 칩당 최대 10+30×5콤보 = 160점, "점수 2배" 리워드 ×2 = 320점/칩
  if p_score is null or p_height is null
     or p_score <= 0 or p_height < 1 or p_height > 500
     or p_score > p_height * 320 then
    return false;
  end if;

  insert into public.scores (nickname, score, height, player_id)
    values (v_nick, p_score, p_height, p_id); -- 닉네임은 서버가 조회 — 위조 불가
  return true;
end $$;

-- 5) 랭킹 조회 교체 — 정체성당 최고점 1행, 개명 즉시 반영, player_id 반환(내 순위 매칭용)
--    반환 컬럼이 늘어나므로 기존 함수를 먼저 제거해야 한다.
drop function if exists public.get_leaderboard(timestamptz);
drop function if exists public.get_leaderboard(text);

create function public.get_leaderboard(since timestamptz)
returns table (nickname text, score int, height int, player_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(p.nickname, s.nickname) as nickname, -- 선점 유저는 현재 닉(개명 반영)
    s.score, s.height, s.player_id
  from (
    select distinct on (coalesce(player_id::text, 'legacy:' || lower(nickname)))
      nickname, score, height, player_id
    from public.scores
    where created_at >= since
    order by coalesce(player_id::text, 'legacy:' || lower(nickname)), score desc
  ) s
  left join public.players p on p.id = s.player_id
  order by s.score desc
  limit 100;
$$;

grant execute on function public.claim_nickname(uuid, uuid, text) to anon;
grant execute on function public.submit_score(uuid, uuid, int, int) to anon;
grant execute on function public.get_leaderboard(timestamptz) to anon;

-- ─────────────── [A-2] 잠금 — 새 클라이언트 배포 24~48h 후 실행 ───────────────
-- scores 직접 INSERT 정책을 전부 제거 → 이후 제출은 RPC(secret 검증)로만 가능.
-- 실행 전 현재 정책 확인: select policyname, cmd from pg_policies where tablename = 'scores';
/*
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'scores' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.scores', pol.policyname);
  end loop;
end $$;
*/
