// ads.js — 광고 스텁 + 노출 캐던스 게이팅
// 게임 코드는 이 인터페이스만 호출한다. 실제 SDK(AdMob via Capacitor 등) 교체 시 이 파일만 수정.
//
// 캐던스 규칙:
//  - 인터스티셜: 3번째 게임오버마다, 최소 간격 90초, 세션 첫 게임오버 제외,
//    리워드 광고 직후(10초 이내) 제외. 결과 화면에서 RESTART 탭 후에만 노출.
//  - 리워드(이어하기): 판당 1회 — 판 단위 제한은 main.js의 continueUsed가 관리.
//  - `?noads` URL 파라미터로 전체 비활성화(디버그).

const REWARDED_MS = 1500;       // 가짜 리워드 광고 재생 시간
const INTERSTITIAL_MS = 1000;   // 가짜 인터스티셜 재생 시간
const INTERSTITIAL_EVERY = 3;   // N번째 게임오버마다
const INTERSTITIAL_GAP_MS = 90_000;
const AFTER_REWARDED_GAP_MS = 10_000;

const state = {
  disabled: new URLSearchParams(location.search).has('noads'),
  gameOvers: 0,
  lastInterstitialAt: -Infinity,
  lastRewardedAt: -Infinity,
};

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
  el.querySelector('.ad-text').textContent = text;
  const fill = el.querySelector('.ad-bar-fill');
  el.style.display = 'flex';
  const start = performance.now();
  (function tick(now) {
    const t = Math.min(1, (now - start) / durationMs);
    fill.style.width = (t * 100).toFixed(1) + '%';
    if (t < 1) requestAnimationFrame(tick);
    else { el.style.display = 'none'; onDone(); }
  })(start);
}

export const Ads = {
  /** 게임오버 발생 시 1회 호출 — 인터스티셜 카운터 갱신 */
  registerGameOver() { state.gameOvers++; },

  get isDisabled() { return state.disabled; },
  get debugState() {
    return {
      gameOvers: state.gameOvers,
      nextInterstitialAt: Math.ceil(Math.max(2, state.gameOvers + 1) / INTERSTITIAL_EVERY) * INTERSTITIAL_EVERY,
      gapRemainMs: Math.max(0, INTERSTITIAL_GAP_MS - (performance.now() - state.lastInterstitialAt)),
    };
  },

  canShowInterstitial() {
    if (state.disabled) return false;
    const now = performance.now();
    return state.gameOvers >= 2                                   // 세션 첫 게임오버 제외
      && state.gameOvers % INTERSTITIAL_EVERY === 0               // 3번째마다
      && now - state.lastInterstitialAt >= INTERSTITIAL_GAP_MS    // 90초 캡
      && now - state.lastRewardedAt >= AFTER_REWARDED_GAP_MS;     // 리워드 직후 제외
  },

  showInterstitial(onClosed) {
    if (state.disabled) { onClosed(); return; }
    state.lastInterstitialAt = performance.now();
    playFakeAd('INTERSTITIAL AD PLAYING…', INTERSTITIAL_MS, onClosed);
  },

  showRewarded(onReward, onDismiss) {
    if (state.disabled) { onReward(); return; }
    state.lastRewardedAt = performance.now();
    // 스텁은 항상 끝까지 시청 성공으로 처리. 실제 SDK에선 중도 이탈 시 onDismiss.
    playFakeAd('REWARDED AD PLAYING…', REWARDED_MS, onReward);
    void onDismiss;
  },
};
