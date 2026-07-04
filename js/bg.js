// bg.js — 서울 4존 고도 배경 시스템 (칩칩 가이드: Seoul Altitude Scroll)
// 스크린 공간 렌더 (main.js render()의 카메라 변환 블록 "앞"에서 호출).
// 패럴랙스: screenY = y0 + scroll * factor,  scroll = -cam.y (타워가 자랄수록 증가).
// y0 = 목표높이 N칩에서 화면 중앙쯤 보이도록 authoring: y0 = TARGET - N*CHIP_H*factor.
import { P } from './physics.js';
import { T } from './theme.js';

const CH = () => P.CHIP_H;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

// ─── 존 색 (연속 고도 함수 + 2s 레이트 클램프) ───────────
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const ZONES = T.ZONE_BG.map(hexRgb);

function targetColor(alt) {
  // 경계 ±3칩 smoothstep 프리믹스 (가이드 규칙)
  let c = ZONES[0];
  T.ZONE_BOUNDS.forEach((b, i) => {
    const t = smooth(b - 3, b + 3, alt);
    if (t > 0) c = c.map((v, k) => v + (ZONES[i + 1][k] - v) * t);
  });
  return c;
}

// ─── 벡터 드로잉 헬퍼 (INK 외곽선 스티커 스타일) ─────────
function box(ctx, x, y, w, h, fill, lw = 3) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = T.INK; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h);
}
function circle(ctx, x, y, r, fill, stroke = T.INK, lw = 3) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function poly(ctx, pts, fill, lw = 3) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = T.INK; ctx.lineWidth = lw; ctx.stroke();
}

// ─── 랜드마크/오브젝트 (x, baseY = 바닥 기준선) ──────────
function drawGwanghwamun(ctx, x, y) {          // 광화문 문루 — 2단 INK 지붕 + 몸체 + 아치
  poly(ctx, [[x - 92, y - 96], [x - 104, y - 130], [x, y - 152], [x + 104, y - 130], [x + 92, y - 96]], T.INK, 0);
  box(ctx, x - 76, y - 100, 152, 26, T.TEAL);
  poly(ctx, [[x - 84, y - 74], [x - 96, y - 100], [x, y - 118], [x + 96, y - 100], [x + 84, y - 74]], T.INK, 0);
  box(ctx, x - 82, y - 76, 164, 76, T.BG_TAN);
  ctx.fillStyle = T.INK;
  ctx.beginPath(); ctx.arc(x, y, 27, Math.PI, 0); ctx.lineTo(x + 27, y); ctx.lineTo(x - 27, y); ctx.fill();
}
function drawGinkgo(ctx, x, y) {               // 은행나무
  box(ctx, x - 8, y - 54, 16, 54, T.INK, 0.001);
  circle(ctx, x, y - 96, 52, T.MUSTARD);
}
function drawPojangmacha(ctx, x, y) {          // 분식 포장마차
  box(ctx, x - 70, y - 70, 140, 70, T.CREAM);
  poly(ctx, [[x - 88, y - 66], [x - 68, y - 118], [x + 68, y - 118], [x + 88, y - 66]], T.ORANGE);
  ctx.fillStyle = T.INK; ctx.font = `22px ${T.F_HEAD}`; ctx.textAlign = 'center';
  ctx.fillText('분식', x, y - 28);
}
function drawStreetlamp(ctx, x, y) {
  ctx.fillStyle = T.INK; ctx.fillRect(x - 4, y - 150, 8, 150);
  circle(ctx, x, y - 162, 17, T.MUSTARD);
}
function drawNamsan(ctx, x, y) {               // 남산타워 (언덕 + 기둥 + 오렌지 전망대)
  ctx.beginPath(); ctx.arc(x, y, 120, Math.PI, 0);
  ctx.fillStyle = T.AVOCADO; ctx.fill(); ctx.strokeStyle = T.INK; ctx.lineWidth = 3; ctx.stroke();
  box(ctx, x - 13, y - 285, 26, 168, T.BG_TAN);
  box(ctx, x - 38, y - 330, 76, 44, T.ORANGE);
  ctx.fillStyle = T.INK; ctx.fillRect(x - 2, y - 415, 4, 85);
}
function draw63Building(ctx, x, y) {           // 63빌딩 — 골드 테이퍼 + 가로줄
  poly(ctx, [[x - 30, y - 440], [x + 30, y - 440], [x + 48, y], [x - 48, y]], T.BG_GOLD);
  ctx.strokeStyle = T.INK_35; ctx.lineWidth = 3;
  for (let i = 1; i <= 5; i++) {
    const t = i / 6, yy = y - 440 * (1 - t), half = 30 + 18 * t - 6;
    ctx.beginPath(); ctx.moveTo(x - half, yy); ctx.lineTo(x + half, yy); ctx.stroke();
  }
}
function drawLotteTower(ctx, x, y) {           // 롯데타워 — 길고 완만한 테이퍼
  poly(ctx, [[x - 14, y - 600], [x + 14, y - 600], [x + 40, y], [x - 40, y]], T.BG_TAN);
}
function drawHanRiver(ctx, y) {                // 한강 띠 + 다리 (풀폭)
  ctx.fillStyle = T.TEAL; ctx.fillRect(-40, y - 90, P.W + 80, 130);
  ctx.strokeStyle = T.INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-40, y - 90); ctx.lineTo(P.W + 40, y - 90); ctx.stroke();
  box(ctx, -40, y - 40, P.W + 80, 20, T.BRICK);
  for (const bx of [90, 400]) {
    ctx.beginPath(); ctx.arc(bx + 110, y - 40, 110, Math.PI, 0);
    ctx.strokeStyle = T.INK; ctx.lineWidth = 4; ctx.stroke();
  }
}
function drawBlock(ctx, x, y, w, h, tone) { box(ctx, x - w / 2, y - h, w, h, tone); }
function drawCloud(ctx, x, y, s) {
  const r = 26 * s;
  const lobes = [[x - r * 1.2, y, r * 0.8], [x, y - r * 0.5, r], [x + r * 1.3, y, r * 0.85]];
  const path = () => {
    ctx.beginPath();
    for (const [cx2, cy2, rr] of lobes) { ctx.moveTo(cx2 + rr, cy2); ctx.arc(cx2, cy2, rr, 0, Math.PI * 2); }
  };
  // 외곽 실루엣만 남기는 트릭: 굵은 스트로크 → 위에 다시 채움 (내부 겹침선 제거)
  path(); ctx.strokeStyle = T.INK; ctx.lineWidth = 4; ctx.stroke();
  path(); ctx.fillStyle = T.CREAM; ctx.fill();
}
function drawBalloon(ctx, x, y) {              // 5색 줄무늬 열기구
  ctx.save();
  ctx.beginPath(); ctx.ellipse(x, y - 130, 62, 72, 0, 0, Math.PI * 2); ctx.clip();
  T.GAME5.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - 62 + i * 25, y - 210, 25, 160); });
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x, y - 130, 62, 72, 0, 0, Math.PI * 2);
  ctx.strokeStyle = T.INK; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = T.INK; ctx.fillRect(x - 1.5, y - 58, 3, 26);
  box(ctx, x - 26, y - 32, 52, 32, T.BASKET);
}
function drawKite(ctx, x, y) {                 // 방패연
  ctx.save(); ctx.translate(x, y); ctx.rotate(14 * Math.PI / 180);
  box(ctx, -40, -52, 80, 104, T.CREAM);
  circle(ctx, 0, 0, 17, T.ORANGE, T.INK, 2);
  ctx.strokeStyle = T.INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 52); ctx.quadraticCurveTo(-30, 130, -14, 190); ctx.stroke();
  ctx.restore();
}
function drawMoon(ctx, x, y) {                 // 초승달 (겨자 + INK 오프셋)
  circle(ctx, x, y, 66, T.MUSTARD, T.CREAM, 3);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, 66, 0, Math.PI * 2); ctx.clip();
  circle(ctx, x - 34, y - 22, 58, T.INK, null);
  ctx.restore();
}
function drawSatellite(ctx, x, y) {            // 브랜드 위성 CC-SAT
  ctx.save(); ctx.translate(x, y); ctx.rotate(-8 * Math.PI / 180);
  box(ctx, -120, -12, 62, 24, T.TEAL, 2); box(ctx, 58, -12, 62, 24, T.TEAL, 2);
  ctx.fillStyle = T.ORANGE; ctx.fillRect(-46, -34, 92, 46);
  ctx.fillStyle = T.CREAM; ctx.fillRect(-46, 12, 92, 22);
  ctx.strokeStyle = T.CREAM; ctx.lineWidth = 2.5; ctx.strokeRect(-46, -34, 92, 68);
  ctx.fillStyle = T.INK; ctx.font = `500 12px ${T.F_MONO}`; ctx.textAlign = 'center';
  ctx.fillText('CC-SAT', 0, 28);
  ctx.restore();
}
function drawSun(ctx, x, y) { circle(ctx, x, y, 44, T.MUSTARD); }

// ─── 오브젝트 배치 테이블 ────────────────────────────────
// 앵커 3종:
//  ground  — 월드 지면과 동기 (f=1.0 근경 거리 오브젝트)
//  horizon — 시작 화면의 지평선 뒤 원경 (스카이라인 초입 — 시작부터 배경으로 보임)
//  visAt   — 해당 높이(칩) 도달 시 화면 중앙(y≈550)에 오도록 위에서 진입 (랜드마크 퍼레이드)
// 중앙 140px(305–445)는 zone1에서 배제. 카메라는 높이 ~8칩부터 오르므로 (alt-8) 보정.
const OBJS = [];
function place(f, x, draw, { alpha = 0.6, ground = false, horizon = null, visAt = null } = {}) {
  let y0;
  if (ground) y0 = P.FLOOR_Y;
  else if (horizon !== null) y0 = P.FLOOR_Y - horizon;
  else y0 = 550 - Math.max(0, visAt - 8) * CH() * f;
  // visAt 오브젝트는 등장 고도 5칩 전부터 페이드-인 (패럴랙스 압축으로 인한 조기 노출 방지)
  OBJS.push({ f, x, draw, alpha, y0, visAt });
}
// ZONE 1 지상 (근경 1x, 지면 정렬)
place(1.0, 128, drawGwanghwamun, { ground: true, alpha: 0.62 });
place(1.0, 252, drawStreetlamp, { ground: true, alpha: 0.6 });
place(1.0, 528, drawGinkgo, { ground: true, alpha: 0.62 });
place(1.0, 652, drawPojangmacha, { ground: true, alpha: 0.62 });
// ZONE 2 스카이라인 — 10칩 간격 랜드마크 퍼레이드 (세로 스트립 월드: 위에서 진입해 지나감)
// 높이 16에서 한강 밴드가 화면을 통과 = "한강을 건넜어요!" 토스트와 동기
place(0.6, 0, (c, x, y) => drawHanRiver(c, y), { visAt: 15, alpha: 0.55 });
place(0.6, 600, drawNamsan, { visAt: 20, alpha: 0.6 });
place(0.6, 680, (c, x, y) => drawBlock(c, x, y, 80, 300, T.BG_TAN), { visAt: 24, alpha: 0.5 });
place(0.6, 120, draw63Building, { visAt: 28, alpha: 0.6 });
place(0.6, 210, (c, x, y) => drawBlock(c, x, y, 96, 250, T.BG_TAN2), { visAt: 33, alpha: 0.45 });
place(0.6, 600, drawLotteTower, { visAt: 38, alpha: 0.6 });
// ZONE 3 하늘 (밀도 40%)
place(0.6, 150, (c, x, y) => drawCloud(c, x, y, 1.2), { visAt: 45, alpha: 0.85 });
place(0.3, 560, (c, x, y) => drawCloud(c, x, y, 0.9), { visAt: 50, alpha: 0.7 });
place(0.6, 620, drawKite, { visAt: 54, alpha: 0.8 });
place(1.0, 250, (c, x, y) => drawCloud(c, x, y, 1.5), { visAt: 58, alpha: 0.9 });
place(0.3, 140, drawBalloon, { visAt: 63, alpha: 0.85 });
place(0.6, 500, (c, x, y) => drawCloud(c, x, y, 1.0), { visAt: 67, alpha: 0.75 });
// ZONE 4 성층권
place(0.3, 600, drawMoon, { visAt: 78, alpha: 0.95 });
place(0.6, 190, drawSatellite, { visAt: 86, alpha: 0.95 });

// 별 2레이어 (결정적 의사난수, 고도 66–260칩)
const STARS = [];
for (let i = 0; i < 140; i++) {
  const h1 = Math.abs(Math.sin(i * 127.1)) % 1, h2 = Math.abs(Math.sin(i * 311.7)) % 1;
  const f = i % 2 ? 0.6 : 0.3;
  const alt = 66 + h2 * 194;
  STARS.push({
    x: 30 + h1 * (P.W - 60),
    y0: 550 - Math.max(0, alt - 8) * 72 * f,
    f,
    r: i % 2 ? 2.2 : 1.4,
  });
}

// ─── 상태 ────────────────────────────────────────────────
const state = {
  cur: ZONES[0].slice(),   // 현재 표시 색 (레이트 클램프)
  toast: null,             // {text, start}
  lastToastHeight: 0,
  meteor: null,            // {start}
};

export const Bg = {
  onZoneUp: null, // M5에서 사운드 훅 연결

  /** 존 판정용 고도(칩) — 카메라 기준 + 시작 오프셋 보정 */
  altOf(camY) { return Math.max(0, -camY / CH() + 8); },
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
    const scroll = -camY;
    const alt = this.altOf(camY);

    // 존 색 — 목표로 레이트 클램프 이동 (풀 스팬 2s)
    const tgt = targetColor(alt);
    const maxStep = 255 * (dtMs / 2000);
    state.cur = state.cur.map((v, i) => {
      const d = tgt[i] - v;
      return v + Math.sign(d) * Math.min(Math.abs(d), maxStep);
    });
    ctx.fillStyle = `rgb(${state.cur.map(Math.round).join(',')})`;
    ctx.fillRect(0, 0, P.W, P.H);

    // 태양 (지상~스카이라인, 하늘 진입 시 페이드아웃)
    const sunA = 0.85 * (1 - smooth(38, 50, alt));
    if (sunA > 0.02) {
      ctx.globalAlpha = sunA;
      drawSun(ctx, 600, 210 + scroll * 0.3 - 0 * CH());
      ctx.globalAlpha = 1;
    }

    // 별 (성층권 진입 페이드인)
    const starA = smooth(62, 72, alt);
    if (starA > 0.02) {
      ctx.fillStyle = T.CREAM;
      for (const s of STARS) {
        const sy = s.y0 + scroll * s.f;
        if (sy < -20 || sy > P.H + 20) continue;
        ctx.globalAlpha = starA * (s.f === 0.3 ? 0.55 : 0.9);
        ctx.beginPath(); ctx.arc(s.x, sy, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // 유성 (성층권에서 10칩마다 0.6s)
      if (state.meteor) {
        const t = (nowMs - state.meteor.start) / 600;
        if (t >= 1) state.meteor = null;
        else {
          const mx = 620 - t * 300, my = 180 + t * 130;
          const grad = ctx.createLinearGradient(mx, my, mx + 90, my - 40);
          grad.addColorStop(0, 'rgba(251,244,230,0.95)'); grad.addColorStop(1, 'rgba(251,244,230,0)');
          ctx.strokeStyle = grad; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 90, my - 40); ctx.stroke();
        }
      }
    }

    // 오브젝트 (원경 → 근경)
    for (const o of [...OBJS].sort((a, b) => a.f - b.f)) {
      if (o.alpha <= 0) continue;
      const sy = o.y0 + scroll * o.f;
      if (sy < -650 || sy > P.H + 650) continue;
      const gate = o.visAt == null ? 1 : smooth(o.visAt - 5, o.visAt - 1, alt);
      if (gate <= 0.01) continue;
      ctx.globalAlpha = o.alpha * gate;
      o.draw(ctx, o.x, sy);
      ctx.globalAlpha = 1;
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
