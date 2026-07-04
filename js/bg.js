// bg.js — 서울 스테이지 배경 (칩칩 가이드: assets/seoul-bg-pixel.png 픽셀아트 스트립)
// 720×2880 세로 스트립 1장: 지상 → 한강·스카이라인 → 하늘 → 성층권.
// 가이드 규칙: nearest-neighbor(픽셀 유지), 가로 100%, chipCount 비례 세로 스크롤
// (0칩 = 이미지 맨 아래, 최고 고도 = 맨 위). 존 색 페이드/토스트는 기존 높이 로직 유지.
import { P } from './physics.js';
import { T } from './theme.js';

const CH = () => P.CHIP_H;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ─── 픽셀 스트립 ─────────────────────────────────────────
const IMG_W = 720, IMG_H = 2880;
const SCALE = P.W / IMG_W;               // 750/720 — 화면폭 100%
const DRAW_H = IMG_H * SCALE;            // ≈3000
const VIEW_IMG = P.H / SCALE;            // 뷰포트가 덮는 이미지 px ≈1281
const ALT_START = 8;                     // 시작 시 카메라 고도(칩) — altOf(0)
const ALT_TOP = 90;                      // 이 고도에서 이미지 최상단 도달
const strip = new Image();
let stripReady = false;
strip.onload = () => { stripReady = true; };
strip.src = 'assets/seoul-bg-pixel.png';

// ─── 존 색 (이미지 로드 전 폴백 + HUD 밤 전환 판정) ──────
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const ZONES = T.ZONE_BG.map(hexRgb);
function targetColor(alt) {
  let c = ZONES[0];
  T.ZONE_BOUNDS.forEach((b, i) => {
    const t = smooth(b - 3, b + 3, alt);
    if (t > 0) c = c.map((v, k) => v + (ZONES[i + 1][k] - v) * t);
  });
  return c;
}

// ─── 상태 ────────────────────────────────────────────────
const state = {
  cur: ZONES[0].slice(),
  toast: null,             // {text, start, zone}
  meteor: null,            // {start}
};

export const Bg = {
  onZoneUp: null, // 존 전환 사운드 훅 (main.js가 연결)

  /** 존 판정용 고도(칩) — 카메라 기준 + 시작 오프셋 보정 */
  altOf(camY) { return Math.max(0, -camY / CH() + ALT_START); },
  isNight(camY) { return this.altOf(camY) > 68; },

  snap(camY) { state.cur = targetColor(this.altOf(camY)).slice(); },

  /** land()에서 호출 — 존 경계/랜드마크 토스트 트리거 */
  notifyHeight(h) {
    const msgs = {
      16: T.ZONE_TOASTS[0], 41: T.ZONE_TOASTS[1], 71: T.ZONE_TOASTS[2],
      20: '남산타워!', 28: '63빌딩!', 38: '롯데타워!',
    };
    if (msgs[h]) {
      state.toast = { text: msgs[h], start: performance.now(), zone: [16, 41, 71].includes(h) };
      if (state.toast.zone && this.onZoneUp) this.onZoneUp();
    }
    if (h >= 71 && h % 10 === 0) state.meteor = { start: performance.now() };
  },

  /** 메인 렌더 첫 단계 (카메라 변환 밖, 풀블리드) */
  draw(ctx, camY, dtMs, nowMs) {
    const alt = this.altOf(camY);

    // 존 색 — 폴백/레터박스 톤 (이미지가 화면을 덮으면 보이지 않음)
    const tgt = targetColor(alt);
    const maxStep = 255 * (dtMs / 2000);
    state.cur = state.cur.map((v, i) => {
      const d = tgt[i] - v;
      return v + Math.sign(d) * Math.min(Math.abs(d), maxStep);
    });
    ctx.fillStyle = `rgb(${state.cur.map(Math.round).join(',')})`;
    ctx.fillRect(0, 0, P.W, P.H);

    if (stripReady) {
      // 선형 스크롤: 시작(alt 8) = 이미지 맨 아래, alt 90 = 맨 위 (가이드)
      const t = clamp01((alt - ALT_START) / (ALT_TOP - ALT_START));
      const imgBottom = IMG_H - t * (IMG_H - VIEW_IMG); // 화면 하단에 걸릴 이미지 y
      const sy = P.H - imgBottom * SCALE;
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false; // nearest-neighbor — 픽셀아트 유지
      ctx.drawImage(strip, 0, sy, P.W, DRAW_H);
      ctx.imageSmoothingEnabled = prevSmooth;
    }

    // 유성 (성층권, 10칩마다 0.6s — 픽셀 이미지 위 가벼운 액센트)
    if (state.meteor) {
      const mt = (nowMs - state.meteor.start) / 600;
      if (mt >= 1) state.meteor = null;
      else {
        const mx = 620 - mt * 300, my = 180 + mt * 130;
        const grad = ctx.createLinearGradient(mx, my, mx + 90, my - 40);
        grad.addColorStop(0, 'rgba(251,244,230,0.95)');
        grad.addColorStop(1, 'rgba(251,244,230,0)');
        ctx.strokeStyle = grad; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 90, my - 40); ctx.stroke();
      }
    }
  },

  /** 월드 렌더 후 오버레이 (토스트) — 스크린 공간 */
  drawOverlay(ctx, nowMs) {
    if (!state.toast) return;
    const age = nowMs - state.toast.start;
    if (age > 1200) { state.toast = null; return; }
    const a = age < 150 ? age / 150 : age > 1000 ? (1200 - age) / 200 : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `26px ${T.F_HEAD}`;
    const w = ctx.measureText(state.toast.text).width + 56;
    const x = (P.W - w) / 2, y = 270, h = 54;
    ctx.fillStyle = T.INK; ctx.fillRect(x + 3, y + 3, w, h);          // 하드 섀도
    ctx.fillStyle = state.toast.zone ? T.TEAL : T.CREAM;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = T.INK; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = state.toast.zone ? T.CREAM : T.INK;
    ctx.textAlign = 'center';
    ctx.fillText(state.toast.text, P.W / 2, y + 37);
    ctx.restore();
  },
};
