// ui.js — HUD/무게중심 인디케이터(캔버스) + 타이틀/결과/랭킹 오버레이(DOM) + localStorage
import { P } from './physics.js';
import { oklchToHex, chipColor } from './colors.js';
import { T, chipCode, colorName } from './theme.js';
import { t, LANG } from './i18n.js';

// ─── localStorage ────────────────────────────────────────
const LS_KEY = 'chromaStack.v1';

export const Storage = {
  data: { bestScore: 0, bestHeight: 0, totalRuns: 0, lastPlayDate: '', streakDays: 0, nickname: '', stage: 'seoul', playerId: '', playerSecret: '', nickClaimed: false },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch { /* 무시 */ }
    return this.data;
  },
  /** 익명 플레이어 정체성(랭킹 v2) — 닉네임 소유·점수 제출 검증용 (id, secret) UUID 쌍.
   *  chromaStack.v1 안에 저장되므로 도메인 마이그레이션 브릿지에 자동 탑승한다. */
  ensurePlayer() {
    const d = this.data;
    if (!d.playerId || !d.playerSecret) {
      const uuid = () => {
        try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* 폴백 */ }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      };
      d.playerId = d.playerId || uuid();
      d.playerSecret = d.playerSecret || uuid();
      this.save();
    }
    return d;
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
  /** 도메인 전환 마이그레이션(구 origin → 신 origin) 병합. 비파괴적:
   *  최고 기록류는 큰 값 채택, 닉네임/스테이지는 로컬이 비어 있을 때만 이전. */
  mergeMigrated(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    const d = this.data;
    const num = (v) => (Number.isFinite(+v) ? +v : 0);
    d.bestScore  = Math.max(num(d.bestScore),  num(incoming.bestScore));
    d.bestHeight = Math.max(num(d.bestHeight), num(incoming.bestHeight));
    d.totalRuns  = Math.max(num(d.totalRuns),  num(incoming.totalRuns));
    d.streakDays = Math.max(num(d.streakDays), num(incoming.streakDays));
    d.tutorialCount = Math.max(num(d.tutorialCount), num(incoming.tutorialCount));
    // 정체성 승계(랭킹 v2): 로컬이 아직 닉네임을 선점하지 않았을 때만 —
    // 닉네임 소유권이 (playerId, secret)에 묶이므로 닉과 함께 통째로 넘어와야 한다.
    if (!d.nickname && incoming.playerId && incoming.playerSecret) {
      d.playerId = String(incoming.playerId).slice(0, 40);
      d.playerSecret = String(incoming.playerSecret).slice(0, 40);
      d.nickClaimed = !!incoming.nickClaimed;
    }
    if (!d.nickname && incoming.nickname) d.nickname = String(incoming.nickname).slice(0, 24);
    if (!d.stage && incoming.stage) d.stage = String(incoming.stage);
    if (incoming.lastPlayDate && String(incoming.lastPlayDate) > (d.lastPlayDate || '')) d.lastPlayDate = String(incoming.lastPlayDate);
    this.save();
    return true;
  },
};

// ─── DOM 오버레이 ────────────────────────────────────────
const $ = (id) => document.getElementById(id);

export function initOverlays({ onStart, onRestart, onHome, onShare, onDouble, onRevive }) {
  // null 방어 — 배포 직후 캐시 혼합(옛 HTML + 새 JS)에서도 부팅이 죽지 않게
  const on = (id, fn) => { const el = $(id); if (el && fn) el.addEventListener('click', fn); };
  on('btnStart', onStart);
  on('btnRestart', onRestart);
  on('btnHome', onHome);
  on('btnShare', onShare);
  on('btnDouble', onDouble);
  on('btnRevive', onRevive);
}

/** 결과 화면 "점수 2배" 버튼 표시 토글 */
export function setDoubleBtn(show) {
  const db = $('btnDouble');
  if (db) db.style.display = show ? '' : 'none';
}

/** 결과 화면 "이어하기" 버튼 표시 토글 */
export function setReviveBtn(show) {
  const rb = $('btnRevive');
  if (rb) rb.style.display = show ? '' : 'none';
}

/** 리워드 2배 적용 후 점수/메타 갱신 (높이는 불변) + 점수 팝 연출 */
export function updateResultScore({ score, isNewBest, zoneName, height }) {
  const el = $('resultScore');
  el.textContent = score;
  $('resultMeta').textContent = `${zoneName} · ${t('chips_unit', { n: height })}${isNewBest && score > 0 ? t('best_tag') : ''}`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); // 리플로우로 애니 재생
}

export function showTitle() {
  const d = Storage.data;
  $('titleBest').textContent = d.bestScore > 0 ? t('best', { score: d.bestScore, height: d.bestHeight }) : '';
  $('titleStreak').textContent = d.streakDays >= 2 ? t('streak', { days: d.streakDays }) : '';
  $('title').style.display = 'flex';
}
export function hideTitle() { $('title').style.display = 'none'; }

export function showResult({ score, height, isNewBest, askNickname, perfectCount, maxCombo, zoneName }) {
  $('resultScore').textContent = score;
  $('resultCode').textContent = chipCode(height); // 칩 번호 = 쌓은 칩 개수 (수집 컨셉)
  $('resultMeta').textContent = `${zoneName} · ${t('chips_unit', { n: height })}${isNewBest && score > 0 ? t('best_tag') : ''}`;
  $('statPerfect').textContent = perfectCount;
  $('statCombo').textContent = `x${maxCombo}`;
  $('nickRow').style.display = askNickname ? 'flex' : 'none'; // 랭킹 참여용 닉네임 1회 등록
  setDoubleBtn(score > 0); // 점수 있을 때만 2배 리워드 노출 (매 결과마다 초기화)
  setReviveBtn(false);     // 기본 숨김 — main.js가 조건(판당 1회·스냅샷 유무)에 따라 노출
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
// 랭킹 열림 동안 전역 버튼(언어/사운드) 숨김 — 보드 자체 헤더(닫기 버튼)와 겹침 방지
export function showBoard() { $('board').style.display = 'flex'; document.body.classList.add('board-open'); }
export function hideBoard() { $('board').style.display = 'none'; document.body.classList.remove('board-open'); }

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
    ['nick', my ? t('me', { nick: r.nickname }) : r.nickname],
    ['pts', t('pts', { score: r.score })],
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

/** 포디움(1–3위) + 리스트(4위~) + 내 순위 고정 을 지정 컨테이너에 렌더 (전역/리그 공용).
 *  els: {podium, list, myRow} DOM 엘리먼트.
 *  rows: [{nickname, score, height, player_id?}]
 *  myFallback: 탑100 밖일 때 하단 고정에 쓸 {score, height} (전체 탭 한정, 순위 '100+')
 *  myPlayerId: 내 순위 매칭 우선 키(랭킹 v2) — 동명이인 오매칭 방지. 레거시 행은 닉네임 폴백. */
export function renderRankingInto(els, rows, myNickname, myFallback = null, myPlayerId = '') {
  const { podium, list, myRow } = els;
  podium.textContent = ''; list.textContent = ''; myRow.textContent = '';
  if (!rows || rows.length === 0) {
    const div = document.createElement('div');
    div.className = 'board-msg';
    div.textContent = rows ? t('board_empty') : t('board_error');
    list.appendChild(div);
    return;
  }

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
    code.className = 'code'; code.textContent = `${chipCode(r.height)} · ${t('pts', { score: r.score })}`;
    label.appendChild(nick); label.appendChild(code);
    pod.appendChild(face); pod.appendChild(label);
    podium.appendChild(pod);
  }

  // 4위 이하 리스트
  rows.slice(3).forEach((r, i) => list.appendChild(boardRowEl(i + 4, r)));

  // 내 순위 — 하단 고정 (가이드: 항상 하단 sticky). 탑100 밖이면 '100+' 표기
  // 매칭: player_id 일치 우선(정체성 기준) → 레거시 행(player_id 없음)만 닉네임 문자열 폴백
  if (myNickname) {
    const idx = rows.findIndex((r) =>
      (myPlayerId && r.player_id) ? r.player_id === myPlayerId : r.nickname === myNickname);
    if (idx >= 0) myRow.appendChild(boardRowEl(idx + 1, rows[idx], true));
    else if (myFallback) myRow.appendChild(boardRowEl('100+', { nickname: myNickname, ...myFallback }, true));
  }
}

/** 전역 랭킹 렌더 (기존 시그니처 유지 — #board 컨테이너 대상) */
export function renderBoard(rows, myNickname, myFallback = null, myPlayerId = '') {
  renderRankingInto({ podium: $('podium'), list: $('boardList'), myRow: $('myRow') },
    rows, myNickname, myFallback, myPlayerId);
}

// ─── 리그 오버레이 ───────────────────────────────────────
export function showLeagues()     { $('leagues').style.display = 'flex'; document.body.classList.add('board-open'); }
export function hideLeagues()      { $('leagues').style.display = 'none'; document.body.classList.remove('board-open'); }
export function showLeagueBoard()  { $('leagueBoard').style.display = 'flex'; document.body.classList.add('board-open'); }
export function hideLeagueBoard()  { $('leagueBoard').style.display = 'none'; document.body.classList.remove('board-open'); }

export function setLeagueTab(range) {
  document.querySelectorAll('#leagueTabs .ltab').forEach((b) =>
    b.classList.toggle('active', b.dataset.lrange === range));
}

/** 리그 순위판 렌더 (#leagueBoard 컨테이너 대상, renderRankingInto 재사용) */
export function renderLeagueBoard(rows, myNickname, myPlayerId = '') {
  renderRankingInto({ podium: $('leaguePodium'), list: $('leagueList'), myRow: $('leagueMyRow') },
    rows, myNickname, null, myPlayerId);
}

// 마감까지 남은 시간 — 브라우저 로케일 상대 표기("3일 후"/"in 3 days")
function remainText(endsAtISO) {
  try {
    const ms = new Date(endsAtISO).getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(LANG, { numeric: 'auto' });
    const abs = Math.abs(ms), DAY = 86400000, HR = 3600000, MIN = 60000;
    if (abs >= DAY) return rtf.format(Math.round(ms / DAY), 'day');
    if (abs >= HR)  return rtf.format(Math.round(ms / HR), 'hour');
    return rtf.format(Math.round(ms / MIN), 'minute');
  } catch { return ''; }
}

// 리그 카드/배너 공용 이벤트 요약 텍스트
function eventSummaryText(lg) {
  if (lg.event_frozen) {
    return '🏁 ' + lg.event_title + ' · ' +
      (lg.event_leader_nick ? t('event_winner', { nick: lg.event_leader_nick }) : t('event_none'));
  }
  const lead = lg.event_leader_nick ? ` · 🥇 ${lg.event_leader_nick}` : '';
  return '🔥 ' + lg.event_title + ' · ' + remainText(lg.event_ends_at) + lead;
}

/** 내 리그 목록 렌더. leagues: get_my_leagues 결과(또는 null). onOpen(lg) 콜백으로 상세 진입. */
export function renderLeaguesList(leagues, onOpen) {
  const box = $('leaguesList');
  box.textContent = '';
  if (!leagues) {
    const d = document.createElement('div'); d.className = 'board-msg';
    d.textContent = t('board_error'); box.appendChild(d); return;
  }
  if (leagues.length === 0) {
    const d = document.createElement('div'); d.className = 'board-msg';
    d.textContent = t('no_leagues'); box.appendChild(d); return;
  }
  for (const lg of leagues) {
    const card = document.createElement('button');
    card.className = 'league-card';
    const top = document.createElement('div'); top.className = 'lc-top';
    const nm = document.createElement('span'); nm.className = 'lc-name'; nm.textContent = lg.name;
    top.appendChild(nm);
    if (lg.is_owner) {
      const b = document.createElement('span'); b.className = 'lc-owner';
      b.textContent = t('owner_badge'); top.appendChild(b);
    }
    const meta = document.createElement('div'); meta.className = 'lc-meta';
    meta.textContent = t('member_count', { n: lg.member_count }) + ' · ' +
      (lg.my_rank ? t('my_rank', { r: lg.my_rank }) : t('my_rank_none'));
    card.appendChild(top); card.appendChild(meta);
    if (lg.event_title) {
      const ev = document.createElement('div'); ev.className = 'lc-event';
      ev.textContent = eventSummaryText(lg);
      card.appendChild(ev);
    }
    card.addEventListener('click', () => onOpen(lg));
    box.appendChild(card);
  }
}

/** 상세 화면 이벤트 배너 + 소유자 '이벤트 시작' 버튼 토글.
 *  lg: 해당 리그의 get_my_leagues 행. isOwner: 소유 여부. */
export function renderLeagueEvent(lg, isOwner) {
  const info = $('leagueEventInfo');
  const btn = $('btnStartEvent');
  const hasLive = !!(lg && lg.event_title && !lg.event_frozen);
  if (info) info.textContent = (lg && lg.event_title) ? eventSummaryText(lg) : t('event_none');
  if (btn) btn.style.display = (isOwner && !hasLive) ? '' : 'none';
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
  ctx.fillText(t('chips_unit', { n: height }), 40 + scoreW - 74, 66);

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
  const hint = t('tap_hint');
  ctx.fillStyle = T.INK;
  ctx.fillText(hint, P.W / 2 + 2, P.H - 56 + 2);
  ctx.fillStyle = T.CREAM;
  ctx.fillText(hint, P.W / 2, P.H - 56);
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
    label: `${chipCode(n + 1)} ${colorName(col.h)}`,
  };
}

const HW = () => P.CHIP_W / 2, HH = () => P.CHIP_H / 2;
// 색면:라벨 = 50:22 (가이드 비율) — P.CHIP_H에서 파생되어 칩 크기 변경 시 자동 스케일
const LABEL_H = () => Math.round(P.CHIP_H * 22 / 72);
const FACE_H = () => P.CHIP_H - LABEL_H();
const LABEL_FONT = () => Math.round(9 * P.CHIP_H / 72); // 라벨 폰트도 비례

export function drawChip(ctx, chip, { falling = false } = {}) {
  const b = chip.body;
  const hw = HW(), hh = HH();
  const fh = FACE_H(), lh = LABEL_H();
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
  ctx.fillRect(-hw, -hh, P.CHIP_W, fh);
  // CREAM 라벨
  ctx.fillStyle = T.CREAM;
  ctx.fillRect(-hw, -hh + fh, P.CHIP_W, lh);
  // 색면/라벨 구분선 + 외곽선 (3px INK, 몸체 안쪽 정렬)
  ctx.strokeStyle = T.INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-hw, -hh + fh);
  ctx.lineTo(hw, -hh + fh);
  ctx.stroke();
  ctx.strokeRect(-hw + 1.5, -hh + 1.5, P.CHIP_W - 3, P.CHIP_H - 3);
  // 라벨 텍스트
  ctx.fillStyle = T.INK;
  ctx.font = `500 ${LABEL_FONT()}px ${T.F_MONO}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(chip.pal.label, -hw + 10, -hh + fh + lh / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
