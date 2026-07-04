// leaderboard.js — Supabase 기반 글로벌 랭킹 (SDK 없이 REST fetch만 사용)
// 아래 두 상수가 비어 있으면 랭킹 기능 전체가 조용히 비활성화된다 (게임은 정상 동작).
// anon 키는 공개 전제의 키 — 권한은 Supabase RLS 정책이 제한한다.

const SUPABASE_URL = '';       // 예: 'https://xxxx.supabase.co'
const SUPABASE_ANON_KEY = '';

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

export const Leaderboard = {
  get enabled() { return !!(SUPABASE_URL && SUPABASE_ANON_KEY); },
  _cache: {}, // range → {at, rows}

  /** 점수 제출 — 실패해도 게임 흐름을 방해하지 않는다 */
  async submit(nickname, score, height) {
    if (!this.enabled || !nickname || score <= 0) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...headers(), Prefer: 'return=minimal' },
        body: JSON.stringify({ nickname, score, height }),
      });
      this._cache = {}; // 새 점수 반영 위해 캐시 무효화
      return res.ok;
    } catch { return false; }
  },

  /** 랭킹 조회 — range: 'all' | 'day' | 'week'. 실패 시 null */
  async fetchTop(range = 'all') {
    if (!this.enabled) return null;
    const hit = this._cache[range];
    if (hit && performance.now() - hit.at < CACHE_MS) return hit.rows;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_leaderboard`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ since: RANGES[range]() }),
      });
      if (!res.ok) return null;
      const rows = await res.json();
      this._cache[range] = { at: performance.now(), rows };
      return rows;
    } catch { return null; }
  },
};
