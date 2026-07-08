// ads.js — AdSense H5 Games Ads(광고 배치 API) 연동 + 노출 캐던스 게이팅.
// 게임 코드는 이 인터페이스만 호출한다. 앱(AdMob) 전환 시에도 이 파일만 수정하면 된다.
//
// 동작 원칙:
//  - 실제 광고는 AdSense H5 "Ad Placement API"(window.adBreak/adConfig)로 노출한다.
//  - 이 API가 없는 컨텍스트(로컬 개발·포털 임베드·승인 전 등)에서는 가짜 오버레이로 폴백해
//    게임 흐름(콜백)이 끊기지 않게 한다. → 라이브 사고 방지.
//  - AdSense 스크립트는 우리 프로덕션 도메인에서만 주입한다(포털 정책 위반·중복 방지).
//
// 캐던스 규칙:
//  - 인터스티셜: 줄어드는 스케줄 — 3판 → 광고 → 2판 → 광고 → 이후 매판. 1시간 휴식 시 리셋.
//    리워드 직후(10초) 제외. 결과 화면 RESTART 탭 후에만 노출.
//  - 리워드: "이어하기/점수 2배" 등 v1.1 지점 대비. 시청 완료(adViewed)에만 보상.
//
// URL 플래그(디버그/QA):
//  - `?noads`   전체 비활성화
//  - `?realads` 비프로덕션 도메인에서도 실제 AdSense 강제 로드(실기기 QA)
//  - `?adtest`  테스트 광고 모드(data-adbreak-test) — 승인 전 노출 확인용

import { track } from './analytics.js';
import { t } from './i18n.js';
import { CG } from './crazygames.js';
import { GD } from './gamedistribution.js';
import { GM } from './gamemonetize.js';

const AD_CLIENT = 'ca-pub-1737192970081110';
const PROD_HOSTS = ['playchipchip.com', 'www.playchipchip.com'];

// ⚠️ AdSense H5 Games Ads 승인 스위치.
//   false = 승인 전(현재). 실제 AdSense 스크립트를 주입하지 않는다 → 리워드/인터스티셜은
//           폴백(가짜 광고)으로 동작해 "점수 2배·이어하기"가 항상 보상을 지급한다(먹통 방지).
//   true  = 승인 완료 후 전환. 프로덕션 도메인에서 실제 광고를 주입·노출한다.
//   (승인 전에도 실기기 실광고 QA가 필요하면 URL에 ?realads 를 붙인다.)
const ADS_LIVE = false;

const REWARDED_MS = 1500;       // 폴백 가짜 리워드 재생 시간
const INTERSTITIAL_MS = 1000;   // 폴백 가짜 인터스티셜 재생 시간
const INTERSTITIAL_SCHEDULE = [3, 2, 1]; // 광고 사이 판 수 — 마지막 값(1 = 매판)이 계속 반복
const SCHEDULE_RESET_MS = 3_600_000;     // 1시간 쉬면 스케줄 리셋
const AFTER_REWARDED_GAP_MS = 10_000;

const params = new URLSearchParams(location.search);
const state = {
  disabled: params.has('noads'),
  firstPlayAdDone: false, // GameMonetize 정책: 첫 Play 클릭 시 광고 1회 필수 (심사 요건)
  gameOvers: 0,
  gameOversSinceAd: 0,   // 마지막 인터스티셜 이후 판 수
  scheduleIdx: 0,        // INTERSTITIAL_SCHEDULE 진행 위치
  lastGameOverAt: -Infinity,
  lastInterstitialAt: -Infinity,
  lastRewardedAt: -Infinity,
};

const currentInterval = () =>
  INTERSTITIAL_SCHEDULE[Math.min(state.scheduleIdx, INTERSTITIAL_SCHEDULE.length - 1)];

// ─── AdSense H5 초기화 ──────────────────────────────────────
// 프로덕션 도메인(또는 ?realads)에서만 스크립트를 주입한다.
function initAdSense() {
  if (state.disabled) return;
  const forced = params.has('realads');
  if (!ADS_LIVE && !forced) return;   // 승인 전: 실광고 미주입 → 폴백이 리워드 보장(먹통 방지)
  const allowed = PROD_HOSTS.includes(location.hostname) || forced;
  if (!allowed) return;               // 로컬·포털 등에선 폴백 스텁 사용
  if (window.adBreak) return;         // 중복 주입 방지

  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adBreak || function (o) { window.adsbygoogle.push(o); };
  window.adConfig = window.adConfig || function (o) { window.adsbygoogle.push(o); };

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
  s.crossOrigin = 'anonymous';
  if (params.has('adtest')) s.setAttribute('data-adbreak-test', 'on'); // 승인 전 테스트 광고
  s.onerror = () => { /* 로드 실패 시 adBreak는 push만 하고 콜백은 폴백이 처리 */ };
  document.head.appendChild(s);

  // 광고 프리로드 켜기 — 인터스티셜 표시 지연 최소화
  window.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => {} });
}

// 실제 배치 API 사용 가능 여부
const realAdsReady = () => typeof window.adBreak === 'function';

// ─── 폴백: 가짜 광고 오버레이 ───────────────────────────────
let overlay = null;
function ensureOverlay() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'adOverlay';
  overlay.innerHTML = '<div class="ad-box"><div class="ad-label">AD</div><div class="ad-text"></div><div class="ad-bar"><div class="ad-bar-fill"></div></div></div>';
  document.body.appendChild(overlay);
  return overlay;
}

function playFakeAd(text, durationMs, onDone) {
  const el = ensureOverlay();
  el.classList.remove('loading'); // 진행률 바 모드
  el.querySelector('.ad-text').textContent = text;
  const fill = el.querySelector('.ad-bar-fill');
  fill.style.width = '0';
  el.style.display = 'flex';
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / durationMs);
    fill.style.width = (p * 100).toFixed(1) + '%';
    if (p < 1) requestAnimationFrame(tick);
    else { el.style.display = 'none'; onDone(); }
  })(start);
}

// ─── 광고 로딩 인디케이터 ────────────────────────────────────
// 포털 광고(CrazyGames·GD·GameMonetize)는 로드~시작까지 수 초(GM은 ~10s) 걸린다.
// 그 동안 "광고 불러오는 중…"을 띄워 먹통처럼 보이는 것을 방지. 광고가 실제로 시작되면
// (main.js의 오디오 뮤트 훅 → Ads.hideAdLoading) 또는 흐름 종료 시 숨긴다.
let loadingShown = false;
function showAdLoading() {
  const el = ensureOverlay();
  el.classList.add('loading');           // 무한 슬라이드 바
  el.querySelector('.ad-text').textContent = t('ad_loading');
  el.querySelector('.ad-bar-fill').style.width = '';
  el.style.display = 'flex';
  loadingShown = true;
}
function hideAdLoading() {
  if (!loadingShown) return;
  loadingShown = false;
  if (!overlay) return;
  overlay.classList.remove('loading');
  overlay.style.display = 'none';
}

// ─── 실제 배치 API 호출 래퍼 ────────────────────────────────
function realInterstitial(onClosed) {
  let closed = false;
  const done = () => { if (closed) return; closed = true; onClosed(); };
  try {
    window.adBreak({
      type: 'next',
      name: 'restart',
      afterAd: done,                 // 광고 종료 후
      adBreakDone: () => done(),     // 항상 호출(광고 미노출 포함) — 흐름 보장
    });
  } catch { done(); }
}

function realRewarded(onReward, onDismiss) {
  let settled = false;
  const reward = () => { if (settled) return; settled = true; onReward(); };
  const dismiss = () => { if (settled) return; settled = true; if (onDismiss) onDismiss(); };
  try {
    window.adBreak({
      type: 'reward',
      name: 'reward',
      beforeReward: (showAdFn) => { showAdFn(); }, // 호출부가 유저 제스처에서 부름 → 즉시 표시
      adViewed: reward,                            // 끝까지 시청 → 보상
      adDismissed: dismiss,                        // 중도 이탈 → 보상 없음
      adBreakDone: () => { if (!settled) dismiss(); }, // 광고 없음/캡 → 보상 없음
    });
  } catch { dismiss(); }
}

export const Ads = {
  /** 게임오버 발생 시 1회 호출 — 카운터 갱신 + 1시간 휴식 시 스케줄 리셋 */
  registerGameOver() {
    const now = performance.now();
    if (now - state.lastGameOverAt > SCHEDULE_RESET_MS) {
      state.scheduleIdx = 0;
      state.gameOversSinceAd = 0;
    }
    state.lastGameOverAt = now;
    state.gameOvers++;
    state.gameOversSinceAd++;
  },

  get isDisabled() { return state.disabled; },
  get debugState() {
    return {
      gameOvers: state.gameOvers,
      sinceAd: state.gameOversSinceAd,
      interval: currentInterval(),
      scheduleIdx: state.scheduleIdx,
      realAds: realAdsReady(),
      adsLive: ADS_LIVE,
    };
  },

  canShowInterstitial() {
    if (state.disabled) return false;
    return state.gameOversSinceAd >= currentInterval()
      && performance.now() - state.lastRewardedAt >= AFTER_REWARDED_GAP_MS; // 리워드 직후 제외
  },

  /** 광고 시작(오디오 뮤트) 시 main.js가 호출 — 로딩 인디케이터 숨김(실제 광고가 뜸) */
  hideAdLoading,

  /** GameMonetize 심사 요건: "첫 게임 로드 후 또는 첫 Play 클릭 시 광고 노출" — GM 빌드 첫 Play에서만 true */
  get needsFirstPlayAd() { return GM.active && !state.disabled && !state.firstPlayAdDone; },

  /** 첫 Play 인터스티셜(GM 전용) — 일반 캐던스(3→2→1 스케줄)는 건드리지 않음 */
  showFirstPlayAd(onClosed) {
    state.firstPlayAdDone = true;
    state.lastInterstitialAt = performance.now();
    track('ad_impression', { format: 'interstitial', placement: 'first_play', real: true, portal: true });
    const closed = () => { hideAdLoading(); onClosed(); };
    showAdLoading(); // 무필이어도 어댑터 워치독(15s)이 closed 호출 → 게임 시작 보장
    GM.showInterstitial(closed);
  },

  showInterstitial(onClosed) {
    if (state.disabled) { onClosed(); return; }
    state.lastInterstitialAt = performance.now();
    state.gameOversSinceAd = 0;
    state.scheduleIdx++; // 다음 간격으로 진행: 3 → 2 → 1(매판 유지)
    track('ad_impression', { format: 'interstitial', real: CG.active || GD.active || GM.active || realAdsReady(), portal: CG.active || GD.active || GM.active });
    const closed = () => { hideAdLoading(); onClosed(); };
    // 포털 광고는 로드가 느려 로딩 인디케이터 표시(시작 시 뮤트 훅이 숨김)
    if (CG.active) { showAdLoading(); CG.showInterstitial(closed); return; } // CrazyGames 빌드
    if (GD.active) { showAdLoading(); GD.showInterstitial(closed); return; } // GameDistribution 빌드
    if (GM.active) { showAdLoading(); GM.showInterstitial(closed); return; } // GameMonetize 빌드
    if (realAdsReady()) realInterstitial(onClosed);                  // 자체 도메인 AdSense
    else playFakeAd('INTERSTITIAL AD PLAYING…', INTERSTITIAL_MS, onClosed); // 로컬·itch 폴백
  },

  showRewarded(onReward, onDismiss, placement = 'reward') {
    if (state.disabled) { onReward(); return; }
    state.lastRewardedAt = performance.now();
    track('ad_impression', { format: 'rewarded', placement, real: CG.active || GD.active || GM.active || realAdsReady(), portal: CG.active || GD.active || GM.active });
    const grant = () => { hideAdLoading(); track('ad_reward_complete', { placement }); onReward(); };
    const dismiss = () => { hideAdLoading(); if (onDismiss) onDismiss(); };
    // 포털 광고는 로드가 느려 로딩 인디케이터 표시(시작 시 뮤트 훅이 숨김)
    if (CG.active) { showAdLoading(); CG.showRewarded(grant, dismiss); return; }  // CrazyGames: 완주 시에만 보상
    if (GD.active) { showAdLoading(); GD.showRewarded(grant, dismiss); return; }  // GameDistribution: 완주 시에만 보상
    if (GM.active) { showAdLoading(); GM.showRewarded(grant, dismiss); return; }  // GameMonetize: 완주 시에만 보상
    if (realAdsReady()) realRewarded(grant, dismiss);               // 자체 도메인 AdSense
    else playFakeAd('REWARDED AD PLAYING…', REWARDED_MS, grant);      // 폴백은 항상 시청 성공 처리
  },
};

initAdSense();
