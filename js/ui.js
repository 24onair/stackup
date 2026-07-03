// ui.js — HUD/무게중심 인디케이터(캔버스) + 타이틀/결과 오버레이(DOM) + localStorage
import { P } from './physics.js';
import { oklchToHex } from './colors.js';

// ─── localStorage ────────────────────────────────────────
const LS_KEY = 'chromaStack.v1';

export const Storage = {
  data: { bestScore: 0, bestHeight: 0, totalRuns: 0, lastPlayDate: '', streakDays: 0 },
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

export function initOverlays({ onStart, onRestart, onContinue }) {
  $('btnStart').addEventListener('click', onStart);
  $('btnRestart').addEventListener('click', onRestart);
  $('btnContinue').addEventListener('click', onContinue);
}

export function showTitle() {
  const d = Storage.data;
  $('titleBest').textContent = d.bestScore > 0 ? `BEST ${d.bestScore} · 높이 ${d.bestHeight}` : '';
  $('titleStreak').textContent = d.streakDays >= 2 ? `🔥 ${d.streakDays}일 연속 플레이` : '';
  $('title').style.display = 'flex';
}
export function hideTitle() { $('title').style.display = 'none'; }

export function showResult({ score, height, best, isNewBest, reason, canContinue }) {
  $('resultReason').textContent = reason;
  $('resultScore').textContent = score;
  $('resultHeight').textContent = `높이 ${height}`;
  $('resultBest').textContent = isNewBest ? '🏆 신기록!' : `BEST ${best}`;
  $('btnContinue').style.display = canContinue ? 'block' : 'none';
  $('result').style.display = 'flex';
}
export function hideResult() { $('result').style.display = 'none'; }

// ─── 캔버스 HUD (스크린 공간) ────────────────────────────
export function drawHUD(ctx, { score, height, best, combo, phaseName, textHex }) {
  ctx.textAlign = 'center';
  ctx.fillStyle = textHex;
  ctx.font = '700 64px -apple-system, "Noto Sans KR", sans-serif';
  ctx.fillText(String(score), P.W / 2, 110);
  ctx.font = '500 26px -apple-system, "Noto Sans KR", sans-serif';
  ctx.globalAlpha = 0.75;
  ctx.fillText(`높이 ${height}   ·   BEST ${best}`, P.W / 2, 152);
  ctx.fillText(phaseName, P.W / 2, 192);
  ctx.globalAlpha = 1;
  if (combo >= 2) {
    ctx.font = '800 34px -apple-system, "Noto Sans KR", sans-serif';
    ctx.fillText(`PERFECT ×${combo}`, P.W / 2, 240);
  }
}

// ─── 무게중심 인디케이터 (월드 공간 — 카메라 변환 내부에서 호출) ──
// ratio: 0=중앙, 1=지지폭 끝. 0.6/0.85 경계로 회색→앰버→레드.
export function drawCOMIndicator(ctx, sup, timeMs) {
  if (!sup) return;
  let color, pulse = 0;
  if (sup.ratio < 0.6) color = 'rgba(120,120,130,0.55)';
  else if (sup.ratio < 0.85) color = 'rgba(228,160,50,0.8)';
  else { color = 'rgba(225,60,60,0.9)'; pulse = Math.sin(timeMs / 70) * 1.5; }

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

// ─── 칩 렌더 (팬톤 칩 스타일: 컬러 블록 + 밝은 상단 에지 + 하단 라벨 밴드) ──
// hex/edgeHex/bandHex/labelHex는 스폰 시 main.js가 캐시. desat>0(게임오버 탈색)일 때만 재계산.
export function chipPalette(col) {
  const { l, c, h } = col;
  return {
    hex: oklchToHex(col),
    edgeHex: oklchToHex({ l: Math.min(0.95, l + 0.06), c, h }),
    bandHex: oklchToHex({ l: 0.92, c: 0.02, h }),
    labelHex: oklchToHex({ l: 0.4, c: 0.03, h }),
  };
}

export function drawChip(ctx, chip, desat = 0) {
  const b = chip.body, S = P.CHIP;
  let pal = chip.pal;
  if (desat > 0) {
    const { l, c, h } = chip.col;
    pal = chipPalette({ l, c: c + (0.03 - c) * desat, h }); // 색이 "죽는" 연출
  }
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  ctx.fillStyle = pal.hex;
  ctx.fillRect(-S / 2, -S / 2, S, S);
  ctx.fillStyle = pal.edgeHex;
  ctx.fillRect(-S / 2, -S / 2, S, 6);
  ctx.fillStyle = pal.bandHex;
  ctx.fillRect(-S / 2, S / 2 - 14, S, 14);
  ctx.fillStyle = pal.labelHex;
  ctx.font = '600 9px "Helvetica Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`CHROMA ${String(chip.n + 1).padStart(3, '0')}`, -S / 2 + 5, S / 2 - 4);
  ctx.restore();
}
