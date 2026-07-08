// leagues.js — 사설 리그 (Supabase REST fetch, SDK 없이). leaderboard.js 구조 미러.
// 설정값은 leaderboard.js와 동일한 공개 anon 키 — 권한은 SECURITY DEFINER RPC가 제한.
// LEAGUES_LIVE=false면 기능 전체가 숨겨짐(?leagues 로 사전 활성화 가능).

const SUPABASE_URL = 'https://tmuywafzvytcpyqotyjt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtdXl3YWZ6dnl0Y3B5cW90eWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMzYwMzEsImV4cCI6MjA5ODcxMjAzMX0.HhO0yDksItfE4tH709-OgjPyfRtj-pzwdyb-Lp9cvpk';

// ── 런칭 스위치 ──────────────────────────────────────────────
// 승인/검증 후 true 로 바꾸면 타이틀에 '🏘️ 리그' 버튼 노출.
// 그 전에도 ?leagues 파라미터로 미리 켤 수 있음(QA/사전검증).
const LEAGUES_LIVE = false;

const CACHE_MS = 30_000;
const RANGES = {
  all:  () => '1970-01-01T00:00:00Z',
  day:  () => new Date(Date.now() - 24 * 3600_000).toISOString(),   // 최근 24시간
  week: () => new Date(Date.now() - 7 * 24 * 3600_000).toISOString(), // 최근 7일
};

const headers = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

// 공통 RPC 호출 — 실패해도 예외를 던지지 않고 null 반환(게임 흐름 보호)
async function rpc(fn, body) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export const Leagues = {
  get enabled() {
    if (!(SUPABASE_URL && SUPABASE_ANON_KEY)) return false;
    return LEAGUES_LIVE || new URLSearchParams(location.search).has('leagues');
  },

  rangeSince(range) { return (RANGES[range] || RANGES.all)(); },

  _cache: {}, // key → {at, val}
  _get(key) {
    const hit = this._cache[key];
    return (hit && performance.now() - hit.at < CACHE_MS) ? hit.val : undefined;
  },
  _put(key, val) { this._cache[key] = { at: performance.now(), val }; return val; },
  _flush() { this._cache = {}; },

  /** 리그 생성 → {status, id, code, name} | {status:'error'} */
  async create(playerId, secret, name) {
    if (!this.enabled || !playerId || !secret) return { status: 'error' };
    const out = await rpc('create_league', { p_id: playerId, p_secret: secret, p_name: name });
    this._flush();
    return out || { status: 'error' };
  },

  /** 코드로 참가 → {status, id?, name?} (ok|already|full|notfound|limit|invalid|error) */
  async joinByCode(playerId, secret, code) {
    if (!this.enabled || !playerId || !secret) return { status: 'error' };
    const out = await rpc('join_league', { p_id: playerId, p_secret: secret, p_code: code });
    this._flush();
    return out || { status: 'error' };
  },

  /** 리그 탈퇴 → 'ok'|'transferred'|'deleted'|'notfound'|'error' */
  async leave(playerId, secret, leagueId) {
    if (!this.enabled || !playerId || !secret) return 'error';
    const out = await rpc('leave_league', { p_id: playerId, p_secret: secret, p_league_id: leagueId });
    this._flush();
    return typeof out === 'string' ? out : 'error';
  },

  /** 내 리그 목록 → [{league_id, code, name, is_owner, member_count, my_rank, event_*}] | null */
  async myLeagues(playerId, secret) {
    if (!this.enabled || !playerId || !secret) return null;
    const cached = this._get('mine');
    if (cached !== undefined) return cached;
    const out = await rpc('get_my_leagues', { p_id: playerId, p_secret: secret });
    return this._put('mine', Array.isArray(out) ? out : null);
  },

  /** 리그 순위판 → [{nickname, score, height, player_id}] | null.
   *  range: 'day'|'week'|'all' (event=false) — event=true면 range 무시하고 이벤트 창. */
  async board(playerId, secret, leagueId, range = 'all', event = false) {
    if (!this.enabled || !playerId || !secret) return null;
    const key = `board:${leagueId}:${event ? 'event' : range}`;
    const cached = this._get(key);
    if (cached !== undefined) return cached;
    const out = await rpc('get_league_board', {
      p_id: playerId, p_secret: secret, p_league_id: leagueId,
      p_since: this.rangeSince(range), p_event: event,
    });
    return this._put(key, Array.isArray(out) ? out : null);
  },

  /** 이벤트 시작(소유자) → 'ok'|'exists'|'notowner'|'invalid'|'error' */
  async startEvent(playerId, secret, leagueId, title, endsAtISO) {
    if (!this.enabled || !playerId || !secret) return 'error';
    const out = await rpc('start_event', {
      p_id: playerId, p_secret: secret, p_league_id: leagueId,
      p_title: title, p_ends_at: endsAtISO,
    });
    this._flush();
    return typeof out === 'string' ? out : 'error';
  },

  /** 참가 미리보기(신원 불요) → {name, member_count, has_event, event_title, event_ends_at} | null */
  async meta(code) {
    if (!this.enabled) return null;
    const out = await rpc('get_league_meta', { p_code: code });
    return (Array.isArray(out) && out[0]) ? out[0] : null;
  },
};
