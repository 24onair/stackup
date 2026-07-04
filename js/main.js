// main.js — 게임 상태머신, 루프, 입력, 카메라, 이동 페이즈, 주스(연출/사운드)
/* global Matter */
import { P, createWorld, makeChipBody, onFloorContact, freezeStep, computeSupport, towerTopY, updateToppleState } from './physics.js';
import { chipColor, randomStartIndex, oklchToHex } from './colors.js';
import { Storage, initOverlays, showTitle, hideTitle, showResult, hideResult, drawHUD, drawTapHint, drawCOMIndicator, drawChip, chipPalette, showBoard, hideBoard, setBoardTab, renderBoard, renderBoardMessage, wipe } from './ui.js';
import { Ads } from './ads.js';
import { Bgm } from './bgm.js';
import { Leaderboard } from './leaderboard.js';
import { T, loadFonts, zoneIndex } from './theme.js';
import { Bg } from './bg.js';

// ─── 게임플레이 튜닝 상수 ────────────────────────────────
const G = {
  // 페이즈 경계 (착지한 칩 수 기준, 0-base index로 비교)
  PHASE2_AT: 14, PHASE3_AT: 29, PHASE4_AT: 49,
  // 이동 속도(px/s): base + RAMP*n, cap
  X_BASE: 200, Y_BASE: 180, P3_BONUS: 45, RAMP: 7, X_CAP: 470, Y_CAP: 360,
  P4_X_SPEED: 290, P4_Y_SPEED: 215,
  X_AMP: 170,                       // 페이즈1 좌우 진폭
  P4_X_AMP: 190, P4_Y_AMP: 70,      // 페이즈4 진폭
  Y_DROP_MIN: 280, Y_DROP_MAX: 440, // 페이즈2 낙하 높이 범위(타워 상단 기준)
  X_HOVER: 360,                     // 페이즈1 이동선 높이(타워 상단 기준)
  TELEGRAPH_MS: 400,                // 페이즈3+ 축 예고 시간
  // 퍼펙트/점수
  PERFECT_WIN: { 1: 8, 2: 6, 3: 6, 4: 4 },
  SCORE_LAND: 10, SCORE_PERFECT: 30, COMBO_CAP: 5,
  STABILIZE_EVERY: 3,               // N연속 퍼펙트마다 "SET!" 안정화
  // 카메라/연출
  CAM_TOP_SCREEN_Y: 560,            // 타워 상단이 위치할 화면 y (58% 높이)
  CAM_LERP: 0.08, ZOOM_LERP: 0.05,
  NEARMISS_SLOWMO: 0.6, NEARMISS_MS: 150, // 니어미스 마이크로 슬로모(공정성 장치)는 유지
  SHAKE_AMP: 6,
  TOPPLE_SPECTACLE_MS: 900,         // 게임오버 → 결과까지 (가이드: 빠른 재도전 루프)
  CAM_DIP: 4,                       // 착지 시 스택 출렁 (카메라 딥)
};

const PHASE_NAMES = { 1: 'PHASE 1 · X축', 2: 'PHASE 2 · Y축', 3: 'PHASE 3 · 랜덤', 4: 'PHASE 4 · 대각선' };

// 디버그: ?phase=2|3|4 또는 ?height=N 으로 시작 높이 점프 (페이즈 테스트용)
const DEBUG_START_HEIGHT = (() => {
  const q = new URLSearchParams(location.search);
  if (q.has('height')) return Math.max(0, parseInt(q.get('height'), 10) || 0);
  const p = parseInt(q.get('phase') || '0', 10);
  return { 2: 14, 3: 29, 4: 49 }[p] || 0;
})();

// ─── 캔버스 셋업 (750×1334 논리 해상도, 레터박스) ─────────
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewScale = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = Math.min(window.innerWidth / P.W, window.innerHeight / P.H);
  canvas.style.width = `${P.W * fit}px`;
  canvas.style.height = `${P.H * fit}px`;
  canvas.width = Math.round(P.W * fit * dpr);
  canvas.height = Math.round(P.H * fit * dpr);
  viewScale = fit * dpr;
  const wrap = document.getElementById('wrap');
  wrap.style.width = canvas.style.width;
  wrap.style.height = canvas.style.height;
}
window.addEventListener('resize', resize);
resize();

// ─── 월드/상태 ───────────────────────────────────────────
const { engine, floorSensor } = createWorld();
const world = engine.world;

let state = 'TITLE'; // TITLE | AIM | SETTLE | TOPPLING | RESULT
let chips = [];          // 착지 순 [{body, n, col, pal, frozen, fallen, fallenMs, wasTilted}]
let currentChip = null;  // 낙하 중(SETTLE)인 칩
let mover = null;        // 조준 중인 키네마틱 칩
let startAnchor = randomStartIndex();
let score = 0, height = 0, combo = 0, newBestShown = false;
let gameOverReason = '';
let settle = { frames: 0, elapsed: 0 };
let toppleTimer = 0;
const floorHits = [];

const cam = { y: 0, targetY: 0, zoom: 1, targetZoom: 1 };
const slowmo = { t: 0, scale: 1 };
let shakeAmp = 0, camDip = 0;
let perfectCount = 0, maxCombo = 0;
let showTapHint = false;
let popups = [], rings = [], stamps = [];
let lastCreakAt = -Infinity, lastBeatAt = -Infinity;

onFloorContact(engine, floorSensor, (body) => floorHits.push(body));

// ─── 사운드 (Web Audio 신스, 에셋 없음) ──────────────────
let AC = null;
function audio() {
  if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
  if (AC.state === 'suspended') AC.resume();
  Bgm.start(AC); // 첫 제스처에서 BGM 루프 시작 (이후 호출은 no-op)
  return AC;
}

// 탭이 백그라운드면 오디오 전체 정지 (rAF와 함께 게임이 완전히 멈추도록)
document.addEventListener('visibilitychange', () => {
  if (!AC) return;
  if (document.hidden) AC.suspend();
  else AC.resume();
});
function tone(freq, dur = 0.1, type = 'sine', gain = 0.12, slideTo = null, delay = 0) {
  if (!Bgm.enabled) return; // 마스터 뮤트 — 효과음도 함께
  try {
    const a = audio(), t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* 오디오 불가 환경 무시 */ }
}
// 노이즈 스윕 — 휘익/굉음/러블 계열의 긴장 사운드용
let noiseBuf = null;
function noiseSweep({ from = 1200, to = 200, dur = 0.3, gain = 0.15, q = 1, delay = 0 }) {
  if (!Bgm.enabled) return; // 마스터 뮤트 — 효과음도 함께
  try {
    const a = audio(), t = a.currentTime + delay;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = a.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(t); src.stop(t + dur + 0.05);
  } catch { /* 오디오 불가 환경 무시 */ }
}

const Sfx = {
  // 낙하 휘슬 — 떨어지는 동안 음이 미끄러져 내려가며 결과를 기다리게 만든다
  drop()      { tone(700, 0.35, 'sine', 0.05, 240); tone(300, 0.06, 'square', 0.04, 180); },
  // 착지 = "톡" — 두꺼운 종이 카드가 나무에 닿는 폴리 (가이드: 종이·나무 질감)
  land()      { noiseSweep({ from: 1800, to: 900, dur: 0.06, gain: 0.11, q: 3 });
                tone(300, 0.05, 'triangle', 0.07, 220); },
  perfect(k)  { const s = [0, 2, 4, 7, 9][Math.min(k - 1, 4)]; // 펜타토닉 상승, 5음 캡
                const f = 523 * Math.pow(2, s / 12);
                tone(f, 0.12, 'triangle', 0.12); tone(f * 2, 0.08, 'sine', 0.05, null, 0.03); },
  // 크리크 — 단2도 디튠 톱니 두 개가 함께 내려앉는 불협화음 (매번 피치가 조금씩 달라 살아있는 느낌)
  creak()     { const f = 55 + Math.random() * 25;
                tone(f, 0.32, 'sawtooth', 0.05, f * 0.7);
                tone(f * 1.06, 0.3, 'sawtooth', 0.04, f * 0.72, 0.02); },
  // 심장박동 — 쿵-쿵. 위험도(0~1)에 따라 세지고, 호출 간격은 게임 루프가 조절
  heartbeat(x){ const g = 0.10 + 0.16 * x;
                tone(55, 0.09, 'sine', g);
                tone(45, 0.07, 'sine', g * 0.75, null, 0.12); },
  // 니어미스 복귀 — 바람이 훑고 지나간 뒤 안도의 한 음
  whoosh()    { noiseSweep({ from: 300, to: 2200, dur: 0.25, gain: 0.14, q: 2 });
                tone(880, 0.15, 'sine', 0.05, null, 0.24); },
  set()       { tone(392, 0.2, 'triangle', 0.1); tone(523, 0.2, 'triangle', 0.1, null, 0.07); },
  // 붕괴 — 카드 뭉치가 와르르 쏟아지는 폴리 (가이드: 밝은 톤 유지, 다크 러블 금지)
  over()      { [420, 370, 330, 290, 260, 230].forEach((f, i) =>
                  tone(f * (0.95 + (i % 3) * 0.04), 0.09, 'triangle', 0.09, f * 0.8, i * 0.055));
                noiseSweep({ from: 2200, to: 700, dur: 0.45, gain: 0.1, q: 1.5 }); },
  // 고도 구간 전환 — 상승 글리산도
  zoneUp()    { tone(400, 0.5, 'sine', 0.09, 1100);
                [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, null, 0.15 + i * 0.09)); },
  // 콤보 x5 — 브라스풍 스팅
  combo5()    { [262, 330, 392, 523].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.055, null, i * 0.04)); },
  newBest()   { [660, 880, 1100].forEach((f, i) => tone(f, 0.15, 'triangle', 0.1, null, i * 0.08)); },
};
const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };

// ─── 페이즈/이동 ─────────────────────────────────────────
function phaseFor(n) {
  if (n < G.PHASE2_AT) return 1;
  if (n < G.PHASE3_AT) return 2;
  if (n < G.PHASE4_AT) return 3;
  return 4;
}
const ramp = (base, n, cap) => Math.min(base + G.RAMP * n, cap);

function topChipX() {
  for (let i = chips.length - 1; i >= 0; i--) if (!chips[i].fallen) return chips[i].body.position.x;
  return P.W / 2;
}

function spawnMover() {
  const n = height;
  const phase = phaseFor(n);
  const top = towerTopY(chips);
  const col = chipColor(n, startAnchor);
  const axis = phase === 1 ? 'x' : phase === 2 ? 'y' : phase === 3 ? (Math.random() < 0.5 ? 'x' : 'y') : 'xy';
  const refX = topChipX();

  const m = { n, phase, axis, col, pal: chipPalette(col, n), telegraph: phase >= 3 ? G.TELEGRAPH_MS : 0 };
  if (axis === 'x') {
    m.cx = P.W / 2; m.ampX = G.X_AMP;
    m.speedX = ramp(phase === 3 ? G.X_BASE + G.P3_BONUS : G.X_BASE, n, G.X_CAP);
    m.dirX = Math.random() < 0.5 ? 1 : -1; // 시작 방향 랜덤 — 패턴 암기 방지
    m.x = m.cx - m.dirX * m.ampX;
    m.y = top - G.X_HOVER;
  } else if (axis === 'y') {
    m.x = refX;
    m.yMin = top - G.Y_DROP_MAX; m.yMax = top - G.Y_DROP_MIN;
    m.speedY = ramp(phase === 3 ? G.Y_BASE + G.P3_BONUS : G.Y_BASE, n, G.Y_CAP);
    m.y = m.yMax; m.dirY = -1;
  } else { // 'xy' 대각선: 비정수 주기 리사주
    m.cx = P.W / 2; m.ampX = G.P4_X_AMP;
    m.speedX = ramp(G.P4_X_SPEED, n - G.PHASE4_AT, G.X_CAP);
    m.speedY = ramp(G.P4_Y_SPEED, n - G.PHASE4_AT, G.Y_CAP);
    const midY = top - (G.X_HOVER - 30);
    m.yMin = midY - G.P4_Y_AMP; m.yMax = midY + G.P4_Y_AMP;
    m.x = m.cx - m.ampX; m.dirX = 1;
    m.y = midY; m.dirY = -1;
  }
  mover = m;
}

function updateMover(dtMs) {
  const m = mover;
  if (!m) return;
  if (m.telegraph > 0) { m.telegraph -= dtMs; return; }
  const dt = dtMs / 1000;
  if (m.speedX) { // 삼각파: 등속 + 즉시 반전
    m.x += m.dirX * m.speedX * dt;
    if (m.x > m.cx + m.ampX) { m.x = m.cx + m.ampX; m.dirX = -1; }
    if (m.x < m.cx - m.ampX) { m.x = m.cx - m.ampX; m.dirX = 1; }
  }
  if (m.speedY) {
    m.y += m.dirY * m.speedY * dt;
    if (m.y > m.yMax) { m.y = m.yMax; m.dirY = -1; }
    if (m.y < m.yMin) { m.y = m.yMin; m.dirY = 1; }
  }
}

// ─── 드롭/착지 ───────────────────────────────────────────
function drop() {
  if (state !== 'AIM' || !mover || mover.telegraph > 0) return;
  const body = makeChipBody(mover.x, mover.y);
  Matter.Composite.add(world, body);
  // Y/대각선 페이즈 퍼펙트 조건: 낮은 지점(부드러운 착지)에서 릴리즈해야 함
  const gentle = mover.yMax === undefined || (mover.yMax - mover.y) <= 40;
  currentChip = {
    body, n: mover.n, col: mover.col, pal: mover.pal, gentle,
    frozen: false, fallen: false, fallenMs: 0, wasTilted: false,
  };
  mover = null;
  showTapHint = false;
  settle = { frames: 0, elapsed: 0 };
  state = 'SETTLE';
  Sfx.drop();
}

function land() {
  const c = currentChip;

  // 미스 판정: 이전 최상단 칩의 윗면 근처까지 올라가지 못했으면 타워 적층 실패
  // (타워 옆 플랫폼에 안착하는 꼼수 차단 — 정상 적층은 이전 칩 중심보다 ~80px 위)
  const prevTop = [...chips].reverse().find((p) => !p.fallen);
  if (prevTop && c.body.position.y > prevTop.body.position.y - P.CHIP_H * 0.25) {
    c.fallen = true; c.fallenMs = 1e9;
    gameOver('타워에서 미끄러졌습니다!');
    return;
  }

  chips.push(c);
  currentChip = null;
  c.landedAt = performance.now(); // 착지 스쿼시 (drawChip이 0.18s 렌더 전용 처리)
  camDip = G.CAM_DIP;              // 스택 전체 4px 출렁
  height++;
  score += G.SCORE_LAND;
  Sfx.land();

  // 퍼펙트 판정: 바로 아래 칩(또는 플랫폼 중앙)과의 x 오차
  const belowX = chips.length >= 2 ? chips[chips.length - 2].body.position.x : P.W / 2;
  const dx = Math.abs(c.body.position.x - belowX);
  const win = G.PERFECT_WIN[phaseFor(height - 1)];
  if (dx <= win && c.gentle) {
    combo++;
    perfectCount++;
    maxCombo = Math.max(maxCombo, combo);
    const bonus = G.SCORE_PERFECT * Math.min(combo, G.COMBO_CAP);
    score += bonus;
    stamp(c.body.position.x, c.body.position.y - 90, combo); // PERFECT! 스탬프 (-6°, 5색 순환)
    ring(c.body.position.x, c.body.position.y);
    Sfx.perfect(combo);
    vibrate(15);
    if (combo === 5) Sfx.combo5();
    if (combo % G.STABILIZE_EVERY === 0) stabilize(c);
  } else {
    combo = 0;
  }

  // 신기록 순간 연출 (플레이 중에 축하)
  if (!newBestShown && Storage.data.bestScore > 0 && score > Storage.data.bestScore) {
    newBestShown = true;
    popup(P.W / 2, towerTopY(chips) - 160, '🏆 NEW BEST!', '#EDAA3C', 44);
    Sfx.newBest();
  }

  Bg.notifyHeight(height);
  freezeStep(chips);
  spawnMover();
  state = 'AIM';
}

// 3연속 퍼펙트 보상: 활성 칩 전체 감쇠 — 완벽함이 타워를 진정시킨다
function stabilize(topChip) {
  for (const c of chips) {
    if (c.frozen || c.fallen) continue;
    Matter.Body.setAngularVelocity(c.body, c.body.angularVelocity * 0.4);
    Matter.Body.setVelocity(c.body, { x: c.body.velocity.x * 0.6, y: c.body.velocity.y * 0.6 });
  }
  popup(topChip.body.position.x, topChip.body.position.y - 120, 'SET!', '#FBF4E6', 40);
  ring(topChip.body.position.x, topChip.body.position.y, 160);
  Sfx.set();
}

// ─── 게임오버/컨티뉴/리스타트 ────────────────────────────
function gameOver(reason) {
  if (state === 'TOPPLING' || state === 'RESULT') return;
  gameOverReason = reason;
  if (currentChip) { chips.push(currentChip); currentChip = null; }
  mover = null;
  state = 'TOPPLING';
  toppleTimer = G.TOPPLE_SPECTACLE_MS; // 가이드: 슬로모션 금지 — 빠르게 무너지고 빠르게 결과로
  shakeAmp = G.SHAKE_AMP;
  // 붕괴 전경 샷: 바닥 피벗 줌아웃으로 타워 전체 프레이밍 (유지 결정)
  const top = towerTopY(chips);
  cam.targetZoom = Math.min(1, 1204 / (P.FLOOR_Y - top + 180));
  cam.targetY = 0;
  Sfx.over();
  Bgm.duck(0.35); // 붕괴 순간 BGM을 낮춰 굉음/결과에 집중
  vibrate([30, 40, 60]);
  Ads.registerGameOver();
  Storage.recordRun(score, height);
  if (Storage.data.nickname) Leaderboard.submit(Storage.data.nickname, score, height); // 비동기, 실패 무시
}

function resetRun(startHeight = DEBUG_START_HEIGHT) {
  for (const c of chips) Matter.Composite.remove(world, c.body);
  if (currentChip) Matter.Composite.remove(world, currentChip.body);
  chips = []; currentChip = null; mover = null;
  score = 0; height = 0; combo = 0;
  perfectCount = 0; maxCombo = 0;
  newBestShown = false;
  shakeAmp = 0; camDip = 0;
  slowmo.t = 0;
  popups = []; rings = []; stamps = []; floorHits.length = 0;
  cam.y = 0; cam.targetY = 0; cam.zoom = 1; cam.targetZoom = 1;
  startAnchor = randomStartIndex(); // 매 판 다른 컬러웨이
  Bg.snap(0);
  if (startHeight > 0) prebuildTower(startHeight);
  Bgm.duck(1);
  Storage.touchStreak();
  // 튜토리얼 힌트: 첫 3판만 (가이드)
  if ((Storage.data.tutorialCount || 0) < 3) {
    showTapHint = true;
    Storage.data.tutorialCount = (Storage.data.tutorialCount || 0) + 1;
    Storage.save();
  } else showTapHint = false;
  spawnMover();
  state = 'AIM';
}

// 디버그: 완벽히 쌓인 동결 타워를 미리 지어 특정 높이(페이즈)에서 시작
function prebuildTower(n) {
  for (let i = 0; i < n; i++) {
    const col = chipColor(i, startAnchor);
    const body = makeChipBody(P.W / 2, P.PLATFORM_TOP_Y - P.CHIP_H / 2 - i * P.CHIP_H);
    Matter.Body.setStatic(body, true);
    Matter.Composite.add(world, body);
    chips.push({ body, n: i, col, pal: chipPalette(col, i), frozen: true, fallen: false, fallenMs: 0, wasTilted: false });
  }
  height = n;
  score = n * G.SCORE_LAND;
  // 카메라·배경을 즉시 해당 높이로 (페이드/스크롤 생략)
  cam.y = cam.targetY = Math.min(0, towerTopY(chips) - G.CAM_TOP_SCREEN_Y);
  Bg.snap(cam.y);
}

initOverlays({
  onStart: () => { audio(); wipe(() => { hideTitle(); resetRun(); }); },
  onRestart: () => {
    const go = () => wipe(() => { hideResult(); resetRun(); }); // 광고 먼저 → 와이프
    if (Ads.canShowInterstitial()) Ads.showInterstitial(go); else go();
  },
  onHome: () => wipe(() => { hideResult(); toTitle(); }),
  onShare: shareRecord,
});

// 홈으로 — 월드를 비우고 타이틀로 (스폰 없음)
function toTitle() {
  for (const c of chips) Matter.Composite.remove(world, c.body);
  if (currentChip) Matter.Composite.remove(world, currentChip.body);
  chips = []; currentChip = null; mover = null;
  popups = []; rings = []; stamps = []; floorHits.length = 0;
  cam.y = 0; cam.targetY = 0; cam.zoom = 1; cam.targetZoom = 1;
  Bg.snap(0);
  Bgm.duck(1);
  state = 'TITLE';
  showTitle();
}

// 기록 공유 — Web Share, 미지원 시 클립보드 폴백
async function shareRecord() {
  const btn = document.getElementById('btnShare');
  const text = `CHIP! CHIP! 칩칩! 서울에서 ${height}칩 · ${score}점을 쌓았어요! 🏙️`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share) { await navigator.share({ text, url }); return; }
    await navigator.clipboard.writeText(`${text} ${url}`);
    btn.textContent = '복사됨!';
    setTimeout(() => { btn.textContent = '기록 공유'; }, 1500);
  } catch { /* 공유 취소 등 무시 */ }
}

// ─── 판정 루프 ───────────────────────────────────────────
function triggerSlowmo(scale, ms) { slowmo.scale = scale; slowmo.t = ms; }

function checkFloorHits() {
  while (floorHits.length) {
    const body = floorHits.shift();
    if (state !== 'AIM' && state !== 'SETTLE') continue;
    const all = currentChip ? chips.concat([currentChip]) : chips;
    const hit = all.find((c) => c.body === body);
    if (!hit) continue;
    hit.fallen = true; hit.fallenMs = 1e9;
    gameOver(currentChip && hit === currentChip ? '칩이 바닥에 떨어졌습니다!' : '칩이 굴러떨어졌습니다!');
    return;
  }
}

function checkToppleAndSettle(dtMs) {
  if (state !== 'AIM' && state !== 'SETTLE') return;
  const scan = currentChip ? chips.concat([currentChip]) : chips;
  const t = updateToppleState(scan, dtMs);

  // 니어미스: 20° 넘게 기울었다 복귀하면 마이크로 슬로모 + 휘익
  for (const c of scan) {
    if (c.frozen) continue;
    const dev = Math.abs(((c.body.angle * 180 / Math.PI) % 90 + 90) % 90);
    const deviation = Math.min(dev, 90 - dev);
    if (deviation > 20) c.wasTilted = true;
    else if (c.wasTilted && deviation < 10) {
      c.wasTilted = false;
      triggerSlowmo(G.NEARMISS_SLOWMO, G.NEARMISS_MS);
      Sfx.whoosh();
    }
  }

  if (t.fallenCount >= 2 || t.topFallen) {
    gameOver('타워가 무너졌습니다!');
    return;
  }

  // 긴장 사운드 레이어링:
  //  앰버존(ratio>0.6)부터 심장박동 시작 — 위험할수록 빨라지고(900→380ms) 세진다
  //  레드존/기울어짐엔 크리크(불협화음)가 겹쳐진다
  const sup = computeSupport(chips);
  const ratio = sup ? sup.ratio : 0;
  const now = performance.now();
  if (ratio > 0.6) {
    const intensity = Math.min(1, (ratio - 0.6) / 0.4);
    const beatInterval = 900 - 520 * intensity;
    if (now - lastBeatAt > beatInterval) {
      lastBeatAt = now;
      Sfx.heartbeat(intensity);
    }
  }
  const danger = t.anyDanger || ratio > 0.85;
  if (danger && now - lastCreakAt > 600) {
    lastCreakAt = now;
    Sfx.creak();
  }

  // 안착 게이트
  if (state === 'SETTLE' && currentChip) {
    settle.elapsed += dtMs;
    const b = currentChip.body;
    if (b.speed < P.SETTLE_SPEED && Math.abs(b.angularSpeed) < P.SETTLE_ANGVEL) settle.frames++;
    else settle.frames = 0;
    if (settle.frames >= P.SETTLE_FRAMES || settle.elapsed > P.SETTLE_TIMEOUT_MS) land();
  }
}

// ─── 낙하 가이드 (칩칩 가이드: 점선 + 칩 글로우) ─────────
// 낙하 칩 하단 → 착지점까지 3px INK 30% 점선. 퍼펙트 타이밍엔 칩에 오렌지 글로우 펄스.
const Y_GENTLE = 40; // Y축 부드러운 착지 존 (drop()의 gentle 조건과 동일)

function dropReady(m) {
  const win = G.PERFECT_WIN[m.phase];
  const xOk = !m.speedX || Math.abs(m.x - topChipX()) <= win;
  const yOk = m.yMax === undefined || (m.yMax - m.y) <= Y_GENTLE;
  return xOk && yOk;
}

function drawDropGuide(ctx, m, nowMs, night) {
  // 착지점까지 점선 (3px, INK 30% — 밤 존에선 CREAM)
  const top = towerTopY(chips);
  ctx.strokeStyle = night ? T.CREAM_30 : T.INK_30;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(m.x, m.y + P.CHIP_H / 2 + 6);
  ctx.lineTo(m.x, top - 4);
  ctx.stroke();
  ctx.setLineDash([]);

  if (dropReady(m)) { // 퍼펙트 타이밍 — 칩에 강조색 글로우 펄스
    const pulse = 0.55 + 0.45 * Math.sin(nowMs / 80);
    ctx.strokeStyle = `rgba(228,87,46,${pulse.toFixed(3)})`; // T.ORANGE
    ctx.lineWidth = 5;
    ctx.strokeRect(m.x - P.CHIP_W / 2 - 7, m.y - P.CHIP_H / 2 - 7, P.CHIP_W + 14, P.CHIP_H + 14);
  }
}

// ─── 카메라/주스 ─────────────────────────────────────────
function updateCamera() {
  if (state === 'AIM' || state === 'SETTLE') {
    const top = towerTopY(chips);
    cam.targetY = Math.min(0, top - G.CAM_TOP_SCREEN_Y);
  }
  cam.y += (cam.targetY - cam.y) * G.CAM_LERP;
  cam.zoom += (cam.targetZoom - cam.zoom) * G.ZOOM_LERP;
}

// PERFECT! 스탬프 — -6°, back-out 등장, 연속 퍼펙트마다 5색 순환 (가이드)
function stamp(x, y, comboN) {
  stamps.push({ x, y, color: T.GAME5[(comboN - 1) % 5], age: 0 });
}

function popup(x, y, text, color = '#fff', size = 30) {
  popups.push({ x, y, text, color, size, age: 0, life: 900 });
}
function ring(x, y, maxR = 110) {
  rings.push({ x, y, maxR, age: 0, life: 260 });
}

function updateJuice(rawDt) {
  if (slowmo.t > 0) slowmo.t -= rawDt;
  shakeAmp = Math.max(0, shakeAmp - rawDt * 0.02);
  camDip *= Math.pow(0.85, rawDt / 16.7);
  stamps = stamps.filter((s) => (s.age += rawDt) < 600);
  popups = popups.filter((p) => (p.age += rawDt) < p.life);
  rings = rings.filter((r) => (r.age += rawDt) < r.life);

  if (state === 'TOPPLING') {
    toppleTimer -= rawDt;
    if (toppleTimer <= 0) {
      state = 'RESULT';
      const d = Storage.data;
      showResult({
        score, height,
        isNewBest: score >= d.bestScore && score > 0,
        askNickname: Leaderboard.enabled && !d.nickname && score > 0,
        perfectCount, maxCombo,
        zoneName: T.ZONE_NAMES[zoneIndex(height)],
      });
    }
  }
}

// ─── 렌더 ────────────────────────────────────────────────
let lastRenderNow = performance.now();
function render(nowMs) {
  const renderDt = Math.min(100, nowMs - lastRenderNow);
  lastRenderNow = nowMs;
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);

  // 배경 — 서울 4존 고도 시스템 (스크린 공간, 카메라 변환 밖)
  Bg.draw(ctx, cam.y, renderDt, nowMs);
  const night = Bg.isNight(cam.y);

  ctx.save();
  // 셰이크
  if (shakeAmp > 0.2) {
    ctx.translate((Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp);
  }
  // 바닥(375,1284) 피벗 줌 + 카메라 스크롤
  const z = cam.zoom;
  ctx.translate(P.W / 2 * (1 - z), P.FLOOR_Y * (1 - z));
  ctx.scale(z, z);
  ctx.translate(0, -cam.y + camDip);

  // 지면 밴드 + 플랫폼 (월드 공간 — 물리와 정렬)
  ctx.fillStyle = T.GROUND;
  ctx.fillRect(-P.W, P.FLOOR_Y, P.W * 3, 400);
  ctx.strokeStyle = T.INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-P.W, P.FLOOR_Y); ctx.lineTo(P.W * 2, P.FLOOR_Y); ctx.stroke();
  ctx.fillStyle = T.INK;
  ctx.fillRect(P.W / 2 - 24, P.PLATFORM_TOP_Y + P.PLATFORM_H, 48, P.FLOOR_Y - P.PLATFORM_TOP_Y - P.PLATFORM_H); // 다리
  ctx.fillStyle = T.BG_TAN;
  ctx.fillRect(P.W / 2 - P.PLATFORM_W / 2, P.PLATFORM_TOP_Y, P.PLATFORM_W, P.PLATFORM_H); // 슬래브
  ctx.strokeStyle = T.INK; ctx.lineWidth = 3;
  ctx.strokeRect(P.W / 2 - P.PLATFORM_W / 2 + 1.5, P.PLATFORM_TOP_Y + 1.5, P.PLATFORM_W - 3, P.PLATFORM_H - 3);

  // 칩 (동결 → 활성 순으로)
  for (const c of chips) drawChip(ctx, c);
  if (currentChip) drawChip(ctx, currentChip, { falling: true });

  // 조준 칩 + 텔레그래프
  if (mover && state === 'AIM') {
    if (mover.telegraph > 0) {
      ctx.fillStyle = night ? T.CREAM : T.INK;
      ctx.font = '800 72px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const blink = Math.sin(nowMs / 60) * 0.3 + 0.7;
      ctx.globalAlpha = blink;
      ctx.fillText(mover.axis === 'y' ? '↕' : mover.axis === 'xy' ? '⤢' : '↔', mover.x, mover.y + 24);
      ctx.globalAlpha = 1;
    } else {
      drawDropGuide(ctx, mover, nowMs, night);
      drawChip(ctx, { body: { position: { x: mover.x, y: mover.y }, angle: 0 }, n: mover.n, col: mover.col, pal: mover.pal }, { falling: true });
    }
  }

  // 무게중심 인디케이터
  if (state === 'AIM' || state === 'SETTLE') {
    drawCOMIndicator(ctx, computeSupport(chips), nowMs, night);
  }

  // PERFECT! 스탬프 (월드 공간, -6°, back-out 등장, INK 하드섀도)
  for (const s of stamps) {
    const t = Math.min(1, s.age / 250);
    const c1 = 1.70158; // back-out 커브
    const scale = 1.4 - 0.4 * (1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(-6 * Math.PI / 180);
    ctx.scale(scale, scale);
    ctx.font = `34px ${T.F_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = s.age > 450 ? (600 - s.age) / 150 : 1;
    ctx.fillStyle = T.INK;
    ctx.fillText('PERFECT!', 3, 3);
    ctx.fillStyle = s.color;
    ctx.fillText('PERFECT!', 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // 링/팝업 (월드 공간 — 타워와 함께 스크롤)
  for (const r of rings) {
    const t = r.age / r.life;
    ctx.strokeStyle = `rgba(251,244,230,${((1 - t) * 0.9).toFixed(3)})`;
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.maxR * t, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const p of popups) {
    const t = p.age / p.life;
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `${p.size}px ${T.F_HEAD}`;
    ctx.fillStyle = T.INK;
    ctx.fillText(p.text, p.x + 2, p.y - t * 60 + 2);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y - t * 60);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 토스트 (스크린 공간)
  Bg.drawOverlay(ctx, nowMs);

  // HUD (스크린 공간)
  if (state !== 'TITLE') {
    drawHUD(ctx, { score, height, zoneName: T.ZONE_NAMES[zoneIndex(height)] });
    // 튜토리얼 탭 힌트 (첫 3판, 첫 드롭 전까지)
    if (showTapHint && state === 'AIM') drawTapHint(ctx);
  }
}

// ─── 메인 루프 (고정 60fps 스텝 + 어큐뮬레이터) ──────────
// 예외 1회로 rAF 체인이 끊겨 게임이 영구 정지하지 않도록 — 프레임 스킵으로 강등
let last = performance.now(), acc = 0;
function frame(now) {
  try {
    const rawDt = Math.min(now - last, 100);
    last = now;
    acc += rawDt;
    while (acc >= P.STEP_MS) {
      tick(P.STEP_MS);
      acc -= P.STEP_MS;
    }
    render(now);
  } catch (err) {
    console.error('CHIP!CHIP! frame error (프레임 스킵):', err);
    acc = 0; // 예외 프레임의 잔여 스텝 폐기
  }
  requestAnimationFrame(frame);
}

function tick(stepMs) {
  const timeScale = slowmo.t > 0 ? slowmo.scale : 1;
  const scaled = stepMs * timeScale;
  updateJuice(stepMs);
  if (state === 'AIM') updateMover(scaled);
  if (state !== 'TITLE') {
    Matter.Engine.update(engine, scaled); // 고정 스텝 — 가변 dt는 비결정적 흔들림 유발
    checkFloorHits();
    checkToppleAndSettle(scaled);
  }
  updateCamera();
}

// ─── 입력 ────────────────────────────────────────────────
// 가이드: 터치 영역 = 화면 전체. window 레벨로 받아 캔버스 위 요소 간섭에도 안전.
// 버튼/입력은 제외(고유 핸들러 우선), 오디오 예외가 드롭을 막지 못하게 격리.
window.addEventListener('pointerdown', (e) => {
  const t = e.target;
  if (t && t.closest && t.closest('button, input, a')) return;
  if (t === canvas) e.preventDefault();
  try { audio(); } catch { /* 오디오 실패 무시 */ }
  drop(); // state !== 'AIM'이면 내부에서 no-op
}, { passive: false });

// ─── 랭킹보드 ────────────────────────────────────────────
let boardRange = 'day';
async function openBoard(range = boardRange) {
  boardRange = range;
  setBoardTab(range);
  showBoard();
  renderBoardMessage('불러오는 중…');
  const rows = await Leaderboard.fetchTop(range);
  renderBoard(rows, Storage.data.nickname);
}

function initBoardUI() {
  // getElementById null 방어 — 배포 직후 10분 캐시 창에서 옛/새 HTML·JS 조합이 만나도 부팅 유지
  const btnBoard = document.getElementById('btnBoard');
  const btnBoardTitle = document.getElementById('btnBoardTitle');
  if (!Leaderboard.enabled) { // 키 미설정 → 랭킹 UI 전체 숨김
    if (btnBoard) btnBoard.style.display = 'none';
    if (btnBoardTitle) btnBoardTitle.style.display = 'none';
    return;
  }
  if (btnBoard) btnBoard.addEventListener('click', () => wipe(() => openBoard()));
  if (btnBoardTitle) btnBoardTitle.addEventListener('click', () => wipe(() => openBoard()));
  document.getElementById('btnBoardClose')?.addEventListener('click', () => wipe(hideBoard));
  document.querySelectorAll('#boardTabs .tab').forEach((b) =>
    b.addEventListener('click', () => openBoard(b.dataset.range)));

  // 닉네임 1회 등록 → 방금 끝난 판 점수도 즉시 제출
  document.getElementById('btnNickSave')?.addEventListener('click', () => {
    const nick = document.getElementById('nickInput').value.trim();
    if (nick.length < 2 || nick.length > 12) { document.getElementById('nickInput').placeholder = '2~12자로 입력하세요'; return; }
    Storage.data.nickname = nick;
    Storage.save();
    document.getElementById('nickRow').style.display = 'none';
    if (score > 0) Leaderboard.submit(nick, score, height);
  });
}

// ─── BGM 음소거 토글 ─────────────────────────────────────
const btnSound = document.getElementById('btnSound');
function syncSoundBtn() { if (btnSound) btnSound.textContent = Bgm.enabled ? '🔊' : '🔇'; }
btnSound?.addEventListener('click', () => {
  audio(); // 첫 클릭이 이 버튼일 수도 있으므로 컨텍스트 보장
  Bgm.setEnabled(!Bgm.enabled);
  syncSoundBtn();
});

// ─── 부팅 ────────────────────────────────────────────────
const BUILD = 'chipchip-2026-07-04e'; // 배포마다 갱신 — 사용자 캐시 버전 판별용
console.info(`CHIP! CHIP! 칩칩! build: ${BUILD}`);
Storage.load();
syncSoundBtn();
initBoardUI();
Bg.onZoneUp = () => Sfx.zoneUp(); // 존 전환 토스트와 동기된 상승 글리산도
showTitle();
// 캔버스 폰트는 명시 로드 필수(ctx.font는 로드를 트리거하지 않음) — 병렬 로드.
// 주의: 루프 시작을 폰트에 블로킹하면 느린 네트워크에서 게임이 수 초간 멈춰
// "클릭해도 칩이 안 떨어지는" 버그가 됨. 매 프레임 재렌더라 늦게 로드돼도 자동 반영.
loadFonts();
requestAnimationFrame(frame);

// QA/디버그 훅
window.__CHROMA = {
  get state() { return state; },
  get score() { return score; },
  get height() { return height; },
  get combo() { return combo; },
  get chips() { return chips; },
  get mover() { return mover; },
  get cam() { return cam; },
  get adDebug() { return Ads.debugState; },
  get ads() { return Ads; },
  get leaderboard() { return Leaderboard; },
  get bgm() { return { current: Bgm.current, enabled: Bgm.enabled, loaded: Object.keys(Bgm.buffers) }; },
  drop,
  forceGameOver: () => gameOver('디버그 게임오버'),
  // QA: 탭이 백그라운드(rAF 정지)여도 시뮬레이션을 수동으로 진행
  step(ms) { const n = Math.max(1, Math.round(ms / P.STEP_MS)); for (let i = 0; i < n; i++) tick(P.STEP_MS); render(performance.now()); },
  // QA: 콘솔에서 원하는 높이로 즉시 점프 (예: jumpTo(14) → 페이즈 2)
  jumpTo(h) { hideResult(); hideTitle(); resetRun(h); },
  P, G,
};
