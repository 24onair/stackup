// main.js — 게임 상태머신, 루프, 입력, 카메라, 이동 페이즈, 주스(연출/사운드)
/* global Matter */
import { P, createWorld, makeChipBody, onFloorContact, freezeStep, computeSupport, towerTopY, updateToppleState } from './physics.js';
import { chipColor, randomStartIndex, bgColorFor, floorColorFor, textColorFor, oklchToHex, oklchLerp } from './colors.js';
import { Storage, initOverlays, showTitle, hideTitle, showResult, hideResult, drawHUD, drawCOMIndicator, drawChip, chipPalette } from './ui.js';
import { Ads } from './ads.js';
import { Bgm } from './bgm.js';

// ─── 게임플레이 튜닝 상수 ────────────────────────────────
const G = {
  // 페이즈 경계 (착지한 칩 수 기준, 0-base index로 비교)
  PHASE2_AT: 14, PHASE3_AT: 29, PHASE4_AT: 49,
  // 이동 속도(px/s): base + RAMP*n, cap
  X_BASE: 180, Y_BASE: 160, P3_BONUS: 40, RAMP: 6, X_CAP: 420, Y_CAP: 320,
  P4_X_SPEED: 260, P4_Y_SPEED: 190,
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
  TOPPLE_SLOWMO: 0.25, TOPPLE_SLOWMO_MS: 400,
  NEARMISS_SLOWMO: 0.6, NEARMISS_MS: 150,
  SHAKE_AMP: 6,
  TOPPLE_SPECTACLE_MS: 1400,        // 게임오버 → 결과 패널까지
  DESAT_MS: 1000,
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
let score = 0, height = 0, combo = 0, continueUsed = false, newBestShown = false;
let gameOverReason = '';
let settle = { frames: 0, elapsed: 0 };
let toppleTimer = 0;
const floorHits = [];

const cam = { y: 0, targetY: 0, zoom: 1, targetZoom: 1 };
const slowmo = { t: 0, scale: 1 };
let shakeAmp = 0, desatT = 0, desatOn = false;
let popups = [], rings = [];
let lastCreakAt = -Infinity, lastBeatAt = -Infinity;

// 배경/바닥/텍스트 컬러 (현재 hue 연동, 1.5s 크로스페이드)
let bgCur = bgColorFor(chipColor(0, startAnchor).h);
let bgTarget = bgCur;

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
  // 착지 = 묵직한 썸 + 먼지 퍽
  land()      { tone(120, 0.09, 'sine', 0.15, 70); noiseSweep({ from: 600, to: 120, dur: 0.12, gain: 0.07 }); },
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
  // 붕괴 — 불협화 톱니 클러스터 + 저역 러블 굉음
  over()      { tone(220, 0.5, 'sawtooth', 0.08, 55);
                tone(233, 0.5, 'sawtooth', 0.07, 58, 0.03);
                tone(65, 0.8, 'sine', 0.15, 30, 0.1);
                noiseSweep({ from: 150, to: 40, dur: 0.9, gain: 0.22, q: 0.8 }); },
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

  const m = { n, phase, axis, col, pal: chipPalette(col), telegraph: phase >= 3 ? G.TELEGRAPH_MS : 0 };
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
  // 배경 크로스페이드 타깃 갱신
  bgTarget = bgColorFor(col.h);
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
  settle = { frames: 0, elapsed: 0 };
  state = 'SETTLE';
  Sfx.drop();
}

function land() {
  const c = currentChip;

  // 미스 판정: 이전 최상단 칩의 윗면 근처까지 올라가지 못했으면 타워 적층 실패
  // (타워 옆 플랫폼에 안착하는 꼼수 차단 — 정상 적층은 이전 칩 중심보다 ~80px 위)
  const prevTop = [...chips].reverse().find((p) => !p.fallen);
  if (prevTop && c.body.position.y > prevTop.body.position.y - P.CHIP * 0.25) {
    c.fallen = true; c.fallenMs = 1e9;
    gameOver('타워에서 미끄러졌습니다!');
    return;
  }

  chips.push(c);
  currentChip = null;
  height++;
  score += G.SCORE_LAND;
  Sfx.land();

  // 퍼펙트 판정: 바로 아래 칩(또는 플랫폼 중앙)과의 x 오차
  const belowX = chips.length >= 2 ? chips[chips.length - 2].body.position.x : P.W / 2;
  const dx = Math.abs(c.body.position.x - belowX);
  const win = G.PERFECT_WIN[phaseFor(height - 1)];
  if (dx <= win && c.gentle) {
    combo++;
    const bonus = G.SCORE_PERFECT * Math.min(combo, G.COMBO_CAP);
    score += bonus;
    popup(c.body.position.x, c.body.position.y - 70, `PERFECT +${bonus}`, '#fff', 34);
    ring(c.body.position.x, c.body.position.y);
    Sfx.perfect(combo);
    vibrate(15);
    if (combo % G.STABILIZE_EVERY === 0) stabilize(c);
  } else {
    combo = 0;
  }

  // 신기록 순간 연출 (플레이 중에 축하)
  if (!newBestShown && Storage.data.bestScore > 0 && score > Storage.data.bestScore) {
    newBestShown = true;
    popup(P.W / 2, towerTopY(chips) - 160, '🏆 NEW BEST!', '#E8B93E', 44);
    Sfx.newBest();
  }

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
  popup(topChip.body.position.x, topChip.body.position.y - 120, 'SET!', '#fff', 40);
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
  toppleTimer = G.TOPPLE_SPECTACLE_MS;
  triggerSlowmo(G.TOPPLE_SLOWMO, G.TOPPLE_SLOWMO_MS);
  shakeAmp = G.SHAKE_AMP;
  desatOn = true;
  // 붕괴 전경 샷: 바닥 피벗 줌아웃으로 타워 전체 프레이밍
  const top = towerTopY(chips);
  cam.targetZoom = Math.min(1, 1204 / (P.FLOOR_Y - top + 180));
  cam.targetY = 0;
  Sfx.over();
  Bgm.duck(0.35); // 붕괴 순간 BGM을 낮춰 굉음/결과에 집중
  vibrate([30, 40, 60]);
  Ads.registerGameOver();
  Storage.recordRun(score, height);
}

function doContinue() {
  continueUsed = true;
  for (const c of chips) {
    if (c.fallen) { Matter.Composite.remove(world, c.body); continue; }
    Matter.Body.setStatic(c.body, true); // 생존 타워 전체 동결 — 컨티뉴 직후 재붕괴 방지
    c.frozen = true; c.fallenMs = 0;
  }
  chips = chips.filter((c) => !c.fallen);
  desatOn = false; desatT = 0;
  shakeAmp = 0;
  cam.targetZoom = 1; cam.zoom = 1;
  Bgm.duck(1);
  hideResult();
  spawnMover();
  state = 'AIM';
}

function resetRun(startHeight = DEBUG_START_HEIGHT) {
  for (const c of chips) Matter.Composite.remove(world, c.body);
  if (currentChip) Matter.Composite.remove(world, currentChip.body);
  chips = []; currentChip = null; mover = null;
  score = 0; height = 0; combo = 0;
  continueUsed = false; newBestShown = false;
  desatOn = false; desatT = 0; shakeAmp = 0;
  slowmo.t = 0;
  popups = []; rings = []; floorHits.length = 0;
  cam.y = 0; cam.targetY = 0; cam.zoom = 1; cam.targetZoom = 1;
  startAnchor = randomStartIndex(); // 매 판 다른 컬러웨이
  if (startHeight > 0) prebuildTower(startHeight);
  Bgm.duck(1);
  Storage.touchStreak();
  spawnMover();
  state = 'AIM';
}

// 디버그: 완벽히 쌓인 동결 타워를 미리 지어 특정 높이(페이즈)에서 시작
function prebuildTower(n) {
  for (let i = 0; i < n; i++) {
    const col = chipColor(i, startAnchor);
    const body = makeChipBody(P.W / 2, P.PLATFORM_TOP_Y - P.CHIP / 2 - i * P.CHIP);
    Matter.Body.setStatic(body, true);
    Matter.Composite.add(world, body);
    chips.push({ body, n: i, col, pal: chipPalette(col), frozen: true, fallen: false, fallenMs: 0, wasTilted: false });
  }
  height = n;
  score = n * G.SCORE_LAND;
  // 카메라·배경을 즉시 해당 높이로 (페이드/스크롤 생략)
  cam.y = cam.targetY = Math.min(0, towerTopY(chips) - G.CAM_TOP_SCREEN_Y);
  bgCur = bgTarget = bgColorFor(chipColor(n, startAnchor).h);
}

initOverlays({
  onStart: () => { audio(); hideTitle(); resetRun(); },
  onRestart: () => {
    const go = () => { hideResult(); resetRun(); };
    if (Ads.canShowInterstitial()) Ads.showInterstitial(go); else go();
  },
  onContinue: () => Ads.showRewarded(doContinue, () => { /* 중도 이탈 시 결과 화면 유지 */ }),
});

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

// ─── 낙하 가이드 (전구 스트립) ───────────────────────────
// 이동 범위를 따라 작은 전구가 늘어서고, 퍼펙트 존 전구만 그린.
// 칩이 그린 존에 들어오면 전구가 커지고 칩에 그린 글로우 — "지금 눌러" 신호.
const GUIDE = {
  SPACING: 24,       // 전구 간격(px)
  OFFSET: 64,        // 칩 경로에서 스트립까지 거리
  Y_GENTLE: 40,      // Y축 그린 존: 최저점에서 이 높이 이내 (drop()의 gentle 조건과 동일)
  GREEN: '52,199,89',
};

function dropReady(m) {
  const win = G.PERFECT_WIN[m.phase];
  const xOk = !m.speedX || Math.abs(m.x - topChipX()) <= win;
  const yOk = m.yMax === undefined || (m.yMax - m.y) <= GUIDE.Y_GENTLE;
  return xOk && yOk;
}

function drawBulb(ctx, x, y, isTarget, isCur) {
  let r = 4, color = 'rgba(120,120,130,0.3)';                      // 꺼진 전구
  if (isTarget && isCur) {                                          // 그린 존 + 칩 위치 일치
    ctx.fillStyle = `rgba(${GUIDE.GREEN},0.25)`;
    ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill(); // 글로우
    r = 8; color = `rgb(${GUIDE.GREEN})`;
  } else if (isTarget) { r = 5; color = `rgba(${GUIDE.GREEN},0.6)`; }
  else if (isCur)      { r = 6; color = 'rgba(255,255,255,0.9)'; }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function drawDropGuide(ctx, m, nowMs) {
  const win = Math.max(G.PERFECT_WIN[m.phase], 13);
  const targetX = topChipX();
  const half = GUIDE.SPACING / 2 + 1;

  if (m.speedX) { // 수평 스트립 — 그린 존 = 타워 최상단 칩 중심 ± 퍼펙트 윈도우
    const gy = (m.yMin !== undefined ? m.yMin : m.y) - GUIDE.OFFSET;
    for (let bx = m.cx - m.ampX; bx <= m.cx + m.ampX + 1; bx += GUIDE.SPACING) {
      drawBulb(ctx, bx, gy, Math.abs(bx - targetX) <= win, Math.abs(bx - m.x) < half);
    }
  }
  if (m.speedY) { // 수직 스트립 — 그린 존 = 최저점 근처(부드러운 착지)
    const gx = m.x + GUIDE.OFFSET > 660 ? m.x - GUIDE.OFFSET : m.x + GUIDE.OFFSET;
    for (let by = m.yMin; by <= m.yMax + 1; by += GUIDE.SPACING) {
      drawBulb(ctx, gx, by, (m.yMax - by) <= GUIDE.Y_GENTLE + 4, Math.abs(by - m.y) < half);
    }
  }
  if (dropReady(m)) { // 칩 자체에 그린 글로우 펄스
    const pulse = 0.55 + 0.45 * Math.sin(nowMs / 80);
    ctx.strokeStyle = `rgba(${GUIDE.GREEN},${pulse})`;
    ctx.lineWidth = 5;
    ctx.strokeRect(m.x - P.CHIP / 2 - 7, m.y - P.CHIP / 2 - 7, P.CHIP + 14, P.CHIP + 14);
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

function popup(x, y, text, color = '#fff', size = 30) {
  popups.push({ x, y, text, color, size, age: 0, life: 900 });
}
function ring(x, y, maxR = 110) {
  rings.push({ x, y, maxR, age: 0, life: 260 });
}

function updateJuice(rawDt) {
  if (slowmo.t > 0) slowmo.t -= rawDt;
  shakeAmp = Math.max(0, shakeAmp - rawDt * 0.02);
  if (desatOn) desatT = Math.min(1, desatT + rawDt / G.DESAT_MS);
  popups = popups.filter((p) => (p.age += rawDt) < p.life);
  rings = rings.filter((r) => (r.age += rawDt) < r.life);
  // 배경 크로스페이드 (~1.5s)
  bgCur = oklchLerp(bgCur, bgTarget, Math.min(1, rawDt / 1500 * 3));

  if (state === 'TOPPLING') {
    toppleTimer -= rawDt;
    if (toppleTimer <= 0) {
      state = 'RESULT';
      const d = Storage.data;
      showResult({
        score, height, best: d.bestScore,
        isNewBest: score >= d.bestScore && score > 0,
        reason: gameOverReason,
        canContinue: !continueUsed && height > 0,
      });
    }
  }
}

// ─── 렌더 ────────────────────────────────────────────────
function render(nowMs) {
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);

  // 배경 (배경 hue는 칩 hue의 보색이므로, 칩 hue = 배경 hue + 180)
  const chipHue = (bgCur.h + 180) % 360;
  ctx.fillStyle = oklchToHex(bgCur);
  ctx.fillRect(0, 0, P.W, P.H);

  ctx.save();
  // 셰이크
  if (shakeAmp > 0.2) {
    ctx.translate((Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp);
  }
  // 바닥(375,1284) 피벗 줌 + 카메라 스크롤
  const z = cam.zoom;
  ctx.translate(P.W / 2 * (1 - z), P.FLOOR_Y * (1 - z));
  ctx.scale(z, z);
  ctx.translate(0, -cam.y);

  // 바닥/플랫폼
  const floorHex = oklchToHex(floorColorFor(chipHue));
  ctx.fillStyle = floorHex;
  ctx.fillRect(-P.W, P.FLOOR_Y, P.W * 3, 400);
  ctx.fillRect(P.W / 2 - 24, P.PLATFORM_TOP_Y + P.PLATFORM_H, 48, P.FLOOR_Y - P.PLATFORM_TOP_Y - P.PLATFORM_H); // 다리
  ctx.fillRect(P.W / 2 - P.PLATFORM_W / 2, P.PLATFORM_TOP_Y, P.PLATFORM_W, P.PLATFORM_H); // 슬래브

  // 칩 (동결 → 활성 순으로)
  const desat = desatT;
  for (const c of chips) drawChip(ctx, c, desat);
  if (currentChip) drawChip(ctx, currentChip, desat);

  // 조준 칩 + 텔레그래프
  if (mover && state === 'AIM') {
    if (mover.telegraph > 0) {
      ctx.fillStyle = oklchToHex(textColorFor(chipHue));
      ctx.font = '800 72px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const blink = Math.sin(nowMs / 60) * 0.3 + 0.7;
      ctx.globalAlpha = blink;
      ctx.fillText(mover.axis === 'y' ? '↕' : mover.axis === 'xy' ? '⤢' : '↔', mover.x, mover.y + 24);
      ctx.globalAlpha = 1;
    } else {
      drawDropGuide(ctx, mover, nowMs);
      drawChip(ctx, { body: { position: { x: mover.x, y: mover.y }, angle: 0 }, n: mover.n, col: mover.col, pal: mover.pal });
    }
  }

  // 무게중심 인디케이터
  if (state === 'AIM' || state === 'SETTLE') {
    drawCOMIndicator(ctx, computeSupport(chips), nowMs);
  }

  // 링/팝업 (월드 공간 — 타워와 함께 스크롤)
  for (const r of rings) {
    const t = r.age / r.life;
    ctx.strokeStyle = `rgba(255,255,255,${(1 - t) * 0.9})`;
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.maxR * t, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const p of popups) {
    const t = p.age / p.life;
    ctx.globalAlpha = 1 - t * t;
    ctx.fillStyle = p.color;
    ctx.font = `800 ${p.size}px -apple-system, "Noto Sans KR", sans-serif`;
    ctx.fillText(p.text, p.x, p.y - t * 60);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // HUD (스크린 공간)
  if (state !== 'TITLE') {
    drawHUD(ctx, {
      score, height, best: Storage.data.bestScore, combo,
      phaseName: PHASE_NAMES[phaseFor(height)],
      textHex: oklchToHex(textColorFor(chipHue)),
    });
  }
}

// ─── 메인 루프 (고정 60fps 스텝 + 어큐뮬레이터) ──────────
let last = performance.now(), acc = 0;
function frame(now) {
  const rawDt = Math.min(now - last, 100);
  last = now;
  acc += rawDt;
  while (acc >= P.STEP_MS) {
    tick(P.STEP_MS);
    acc -= P.STEP_MS;
  }
  render(now);
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
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio();
  drop();
}, { passive: false });

// ─── BGM 음소거 토글 ─────────────────────────────────────
const btnSound = document.getElementById('btnSound');
function syncSoundBtn() { btnSound.textContent = Bgm.enabled ? '🔊' : '🔇'; }
btnSound.addEventListener('click', () => {
  audio(); // 첫 클릭이 이 버튼일 수도 있으므로 컨텍스트 보장
  Bgm.setEnabled(!Bgm.enabled);
  syncSoundBtn();
});

// ─── 부팅 ────────────────────────────────────────────────
Storage.load();
syncSoundBtn();
showTitle();
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
  get bgm() { return { current: Bgm.current, enabled: Bgm.enabled, loaded: Object.keys(Bgm.buffers) }; },
  drop,
  forceGameOver: () => gameOver('디버그 게임오버'),
  // QA: 탭이 백그라운드(rAF 정지)여도 시뮬레이션을 수동으로 진행
  step(ms) { const n = Math.max(1, Math.round(ms / P.STEP_MS)); for (let i = 0; i < n; i++) tick(P.STEP_MS); render(performance.now()); },
  // QA: 콘솔에서 원하는 높이로 즉시 점프 (예: jumpTo(14) → 페이즈 2)
  jumpTo(h) { hideResult(); hideTitle(); resetRun(h); },
  P, G,
};
