// ads.js — 광고 스텁 + 노출 캐던스 게이팅
// 게임 코드는 이 인터페이스만 호출한다. 실제 SDK(AdMob via Capacitor 등) 교체 시 이 파일만 수정.
//
// 캐던스 규칙:
//  - 인터스티셜: 줄어드는 스케줄 — 3판 → 광고 → 2판 → 광고 → 이후 매판.
//    (초반은 보호하고, 세션이 깊어질수록 노출 빈도 상승)
//    1시간 이상 쉬었다 돌아오면 스케줄이 처음(3판)으로 리셋.
//    리워드 광고 직후(10초 이내) 제외. 결과 화면에서 RESTART 탭 후에만 노출.
//  - 리워드(이어하기): 판당 1회 — 판 단위 제한은 main.js의 continueUsed가 관리.
//  - `?noads` URL 파라미터로 전체 비활성화(디버그).

const REWARDED_MS = 1500;       // 가짜 리워드 광고 재생 시간
const INTERSTITIAL_MS = 1000;   // 가짜 인터스티셜 재생 시간
const INTERSTITIAL_SCHEDULE = [3, 2, 1]; // 광고 사이 판 수 — 마지막 값(1 = 매판)이 계속 반복
const SCHEDULE_RESET_MS = 3_600_000;     // 1시간 쉬면 스케줄 리셋
const AFTER_REWARDED_GAP_MS = 10_000;

const state = {
  disabled: new URLSearchParams(location.search).has('noads'),
  gameOvers: 0,
  gameOversSinceAd: 0,   // 마지막 인터스티셜 이후 판 수
  scheduleIdx: 0,        // INTERSTITIAL_SCHEDULE 진행 위치
  lastGameOverAt: -Infinity,
  lastInterstitialAt: -Infinity,
  lastRewardedAt: -Infinity,
};

const currentInterval = () =>
  INTERSTITIAL_SCHEDULE[Math.min(state.scheduleIdx, INTERSTITIAL_SCHEDULE.length - 1)];

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
    };
  },

  canShowInterstitial() {
    if (state.disabled) return false;
    return state.gameOversSinceAd >= currentInterval()
      && performance.now() - state.lastRewardedAt >= AFTER_REWARDED_GAP_MS; // 리워드 직후 제외
  },

  showInterstitial(onClosed) {
    if (state.disabled) { onClosed(); return; }
    state.lastInterstitialAt = performance.now();
    state.gameOversSinceAd = 0;
    state.scheduleIdx++; // 다음 간격으로 진행: 3 → 2 → 1(매판 유지)
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
