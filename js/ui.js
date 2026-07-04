// ui.js — HUD/무게중심 인디케이터(캔버스) + 타이틀/결과/랭킹 오버레이(DOM) + localStorage
import { P } from './physics.js';
import { oklchToHex, chipColor } from './colors.js';
import { T, chipCode, koreanColorName } from './theme.js';

// ─── localStorage ────────────────────────────────────────
const LS_KEY = 'chromaStack.v1';

export const Storage = {
  data: { bestScore: 0, bestHeight: 0, totalRuns: 0, lastPlayDate: '', streakDays: 0, nickname: '' },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch { /* 무시 */ }
    return this.data;
  },
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch { /* 무시 */ } },
  /** 판 시작 시 호출 — 일일 스트릭 갱신 */
  touchStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const last = this.data.lastPlayDate;
    if (last !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().slice(0, 10);
      this.data.streakDays = last === yesterday ? this.data.streakDays + 1 : 1;
      this.data.lastPlayDate = today;
      this.save();
    }
    return this.data.streakDays;
  },
  recordRun(score, height) {
    this.data.totalRuns++;
    this.data.bestScore = Math.max(this.data.bestScore, score);
    this.data.bestHeight = Math.max(this.data.bestHeight, height);
    this.save();
  },
};

// ─── DOM 오버레이 ────────────────────────────────────────
const $ = (id) => document.getElementById(id);

export function initOverlays({ onStart, onRestart, onContinue, onHome, onShare }) {
  $('btnStart').addEventListener('click', onStart);
  $('btnRestart').addEventListener('click', onRestart);
  $('btnContinue').addEventListener('click', onContinue);
  $('btnHome').addEventListener('click', onHome);
  $('btnShare').addEventListener('click', onShare);
}

export function showTitle() {
  const d = Storage.data;
  $('titleBest').textContent = d.bestScore > 0 ? `🏆 BEST ${d.bestScore}점 · ${d.bestHeight}칩` : '';
  $('titleStreak').textContent = d.streakDays >= 2 ? `🔥 ${d.streakDays}일 연속 플레이` : '';
  $('title').style.display = 'flex';
}
export function hideTitle() { $('title').style.display = 'none'; }

export function showResult({ score, height, isNewBest, canContinue, askNickname, perfectCount, maxCombo, zoneName }) {
  $('resultScore').textContent = score;
  $('resultCode').textContent = chipCode(height); // 칩 번호 = 쌓은 칩 개수 (수집 컨셉)
  $('resultMeta').textContent = `${zoneName} · ${height}칩${isNewBest && score > 0 ? ' · 최고 기록!' : ''}`;
  $('statPerfect').textContent = perfectCount;
  $('statCombo').textContent = `x${maxCombo}`;
  $('btnContinue').style.display = canContinue ? 'block' : 'none';
  $('nickRow').style.display = askNickname ? 'flex' : 'none'; // 랭킹 참여용 닉네임 1회 등록
  const el = $('result');
  el.classList.remove('show');
  el.style.display = 'flex';
  void el.offsetHeight; // 리플로우 — 진입 모션(칩 드롭인 + 버튼 슬라이드) 재생
  el.classList.add('show');
}
export function hideResult() { $('result').style.display = 'none'; }

// ─── 화면 전환: 5색 칩 띠 와이프 (0.4s, 아래→위) ─────────
let wiping = false;
export function wipe(midCb) {
  if (wiping) { midCb(); return; } // 진행 중 재호출 — 전환만 수행
  const el = $('wipe');
  wiping = true;
  let done = false;
  const toOut = () => {
    if (done) return;
    done = true;
    midCb();
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => { el.classList.remove('out'); wiping = false; }, 280);
  };
  const onEnd = () => { el.removeEventListener('transitionend', onEnd); toOut(); };
  el.addEventListener('transitionend', onEnd);
  el.classList.add('in');
  setTimeout(toOut, 320); // transitionend 미발화 폴백
}

// ─── 랭킹 오버레이 ───────────────────────────────────────
export function showBoard() { $('board').style.display = 'flex'; }
export function hideBoard() { $('board').style.display = 'none'; }

export function setBoardTab(range) {
  document.querySelectorAll('#boardTabs .tab').forEach((b) =>
    b.classList.toggle('active', b.dataset.range === range));
}

export function renderBoardMessage(msg) {
  $('podium').textContent = '';
  $('myRow').textContent = '';
  const list = $('boardList');
  list.textContent = '';
  const div = document.createElement('div');
  div.className = 'board-msg';
  div.textContent = msg;
  list.appendChild(div);
}

// 리스트 행 스와치: 그 기록의 마지막 칩 색 (높이 → 그라데이션, 앵커 0 고정 = 결정적)
const swatchHex = (h) => oklchToHex(chipColor(Math.max(0, h - 1), 0));

function boardRowEl(rank, r, my = false) {
  const row = document.createElement('div');
  row.className = 'board-row';
  const cells = [
    ['rank', String(rank)],
    ['swatch', ''],
    ['nick', my ? `나 (${r.nickname})` : r.nickname],
    ['pts', `${r.score}점`],
  ];
  for (const [cls, text] of cells) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text; // textContent 조립 — XSS 차단
    if (cls === 'swatch') el.style.background = swatchHex(r.height);
    row.appendChild(el);
  }
  return row;
}

/** rows: [{nickname, score, height}] — 포디움(1–3위 칩 타워) + 리스트(4위~) + 내 순위 고정 */
export function renderBoard(rows, myNickname) {
  const podium = $('podium'), list = $('boardList'), myRow = $('myRow');
  podium.textContent = ''; list.textContent = ''; myRow.textContent = '';
  if (!rows || rows.length === 0) { renderBoardMessage(rows ? '아직 기록이 없습니다' : '랭킹을 불러오지 못했습니다'); return; }

  // 포디움: 배치 순서 2-1-3, 칩 높이 = 순위 (가이드: 겨자/청록/벽돌)
  const spec = [
    { i: 1, h: 74, bg: T.TEAL, fg: T.CREAM, fs: 28 },
    { i: 0, h: 104, bg: T.MUSTARD, fg: T.INK, fs: 38, flag: true },
    { i: 2, h: 56, bg: T.BRICK, fg: T.CREAM, fs: 24 },
  ];
  for (const s of spec) {
    const r = rows[s.i];
    if (!r) continue;
    const pod = document.createElement('div');
    pod.className = 'pod' + (s.i === 0 ? ' p1' : '');
    const face = document.createElement('div');
    face.className = 'pod-face';
    face.style.height = `${s.h}px`;
    face.style.background = s.bg;
    if (s.flag) { const f = document.createElement('i'); f.className = 'pod-flag'; face.appendChild(f); }
    const b = document.createElement('b');
    b.textContent = String(s.i + 1);
    b.style.color = s.fg; b.style.fontSize = `${s.fs}px`;
    face.appendChild(b);
    const label = document.createElement('div');
    label.className = 'pod-label';
    const nick = document.createElement('span');
    nick.className = 'nick'; nick.textContent = r.nickname;
    const code = document.createElement('span');
    code.className = 'code'; code.textContent = `${chipCode(r.height)} · ${r.score}점`;
    label.appendChild(nick); label.appendChild(code);
    pod.appendChild(face); pod.appendChild(label);
    podium.appendChild(pod);
  }

  // 4위 이하 리스트
  rows.slice(3).forEach((r, i) => list.appendChild(boardRowEl(i + 4, r)));

  // 내 순위 — 하단 고정 (리스트에 있으면 순위째로, 없으면 숨김)
  if (myNickname) {
    const idx = rows.findIndex((r) => r.nickname === myNickname);
    if (idx >= 0) myRow.appendChild(boardRowEl(idx + 1, rows[idx], true));
  }
}

// ─── 캔버스 HUD (칩칩 가이드: 스티커 칩 스타일) ──────────
// 좌: 점수 칩(CREAM, 점수 Rammetto + N칩 병기) / 우: 존 배지(TEAL, "서울 · 지상")
function sticker(ctx, x, y, w, h, fill) {
  ctx.fillStyle = T.INK; ctx.fillRect(x + 3, y + 3, w, h); // 하드 섀도
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = T.INK; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
}

export function drawHUD(ctx, { score, height, zoneName }) {
  // 점수 칩 (좌상단)
  ctx.font = `40px ${T.F_DISPLAY}`;
  const scoreW = Math.max(64, ctx.measureText(String(score)).width) + 76;
  sticker(ctx, 22, 22, scoreW, 64, T.CREAM);
  ctx.fillStyle = T.INK;
  ctx.textAlign = 'left';
  ctx.fillText(String(score), 40, 68);
  ctx.font = `18px ${T.F_HEAD}`;
  ctx.fillStyle = T.SUBTLE;
  ctx.fillText(`${height}칩`, 40 + scoreW - 74, 66);

  // 존 배지 (우상단)
  ctx.font = `20px ${T.F_HEAD}`;
  const zw = ctx.measureText(zoneName).width + 40;
  sticker(ctx, P.W - 22 - zw, 22, zw, 46, T.TEAL);
  ctx.fillStyle = T.CREAM;
  ctx.textAlign = 'center';
  ctx.fillText(zoneName, P.W - 22 - zw / 2, 53);
}

/** 튜토리얼 탭 힌트 (첫 3판) — 하단 중앙 */
export function drawTapHint(ctx) {
  ctx.font = `24px ${T.F_HEAD}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = T.INK;
  ctx.fillText('화면을 터치해서 칩을 떨어뜨려요!', P.W / 2 + 2, P.H - 56 + 2);
  ctx.fillStyle = T.CREAM;
  ctx.fillText('화면을 터치해서 칩을 떨어뜨려요!', P.W / 2, P.H - 56);
}

// ─── 무게중심 인디케이터 (월드 공간 — 카메라 변환 내부에서 호출) ──
// ratio: 0=중앙, 1=지지폭 끝. 0.6/0.85 경계로 회색→앰버→레드.
export function drawCOMIndicator(ctx, sup, timeMs, night = false) {
  if (!sup) return;
  let color, pulse = 0;
  if (sup.ratio < 0.6) color = night ? T.CREAM_60 : T.INK_40;
  else if (sup.ratio < 0.85) color = T.MUSTARD;
  else { color = T.ORANGE; pulse = Math.sin(timeMs / 70) * 1.5; }

  const x = sup.comX + pulse;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(x, sup.towerTopY - 30);
  ctx.lineTo(x, sup.supportTopY);
  ctx.stroke();
  ctx.setLineDash([]);
  // 무게중심 점
  ctx.beginPath();
  ctx.arc(x, sup.supportTopY, 7, 0, Math.PI * 2);
  ctx.fill();
  // 지지폭 표시
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sup.supportX - sup.supportHalf, sup.supportTopY + 2);
  ctx.lineTo(sup.supportX + sup.supportHalf, sup.supportTopY + 2);
  ctx.stroke();
}

// ─── 칩 렌더 (칩칩 가이드: 색면 + CREAM 라벨 + 3px INK 외곽선) ──────────
// 92×72 — 색면 50px 위, 라벨 22px 아래. 라벨: `CC 0NN-C 한글색명` (번호 = 칩 순번).
// 컬러는 기존 OKLCH 팬톤 그라데이션 유지(사용자 결정).
export function chipPalette(col, n) {
  return {
    hex: oklchToHex(col),
    label: `${chipCode(n + 1)} ${koreanColorName(col.h)}`,
  };
}

const HW = () => P.CHIP_W / 2, HH = () => P.CHIP_H / 2;
const FACE_H = 50, LABEL_H = 22; // FACE_H + LABEL_H === P.CHIP_H

export function drawChip(ctx, chip, { falling = false } = {}) {
  const b = chip.body;
  const hw = HW(), hh = HH();
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);

  // 착지 스쿼시 (렌더 전용 — chip.landedAt은 main.js가 기록)
  if (chip.landedAt) {
    const age = performance.now() - chip.landedAt;
    if (age < 180) {
      const t = age / 180; // 0→1, ease-out 복원
      const e = 1 - (1 - t) * (1 - t);
      ctx.scale(1.10 + (1 - 1.10) * e, 0.88 + (1 - 0.88) * e);
    }
  }

  // 낙하 중 하드 섀도 (가이드: 4px 4px 0 INK 35%)
  if (falling) {
    ctx.fillStyle = T.INK_35;
    ctx.fillRect(-hw + 4, -hh + 4, P.CHIP_W, P.CHIP_H);
  }
  // 색면
  ctx.fillStyle = chip.pal.hex;
  ctx.fillRect(-hw, -hh, P.CHIP_W, FACE_H);
  // CREAM 라벨
  ctx.fillStyle = T.CREAM;
  ctx.fillRect(-hw, -hh + FACE_H, P.CHIP_W, LABEL_H);
  // 색면/라벨 구분선 + 외곽선 (3px INK, 몸체 안쪽 정렬)
  ctx.strokeStyle = T.INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh + FACE_H);
  ctx.lineTo(hw, -hh + FACE_H);
  ctx.stroke();
  ctx.strokeRect(-hw + 1.5, -hh + 1.5, P.CHIP_W - 3, P.CHIP_H - 3);
  // 라벨 텍스트
  ctx.fillStyle = T.INK;
  ctx.font = `500 9px ${T.F_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(chip.pal.label, -hw + 8, -hh + FACE_H + LABEL_H / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
