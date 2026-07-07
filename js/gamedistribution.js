// gamedistribution.js — GameDistribution HTML5 SDK 어댑터.
//
// 포털 전용 빌드에서만 활성화된다. build-portal.sh gamedistribution 이 index.html에
// GD_OPTIONS(게임ID·이벤트 라우팅) + SDK 로더(https://html5.api.gamedistribution.com/main.min.js)를
// 주입한 빌드를 GameDistribution에 제출한다. 자체 도메인·CrazyGames·itch 빌드엔 GD_OPTIONS가
// 없어 _active=false → ads.js가 기존 경로(AdSense/폴백/CrazyGames)를 그대로 쓴다.
//
// 주입 스니펫은 GD_OPTIONS.onEvent에서 window.__gdOnEvent(e)로 이벤트를 넘기고,
// 이 어댑터가 __gdOnEvent를 등록해 처리한다 (SDK가 모듈보다 먼저 로드되므로 이 분리가 필요).
//
// GD 광고 모델 (CrazyGames와 다름 — 더 단순):
//  - 인터스티셜: gdsdk.showAd()  → Promise
//  - 리워드:     gdsdk.preloadAd('rewarded') → gdsdk.showAd('rewarded'); 완주 시 SDK_REWARDED_WATCH_COMPLETE 이벤트
//  - 오디오:     광고 시작 SDK_GAME_PAUSE(뮤트) / 종료 SDK_GAME_START(언뮤트)
//  ⚠️ 대시보드(developer.gamedistribution.com)에서 게임의 REWARDED ADS 플래그를 켜야 리워드 요청 가능.

let _active = false;
let _mute = null, _unmute = null;
let _pendingReward = null; // { onReward, onDismiss, settled } — 리워드 진행 중 상태

const sdk = () => window.gdsdk || null;
const safe = (fn) => { try { return fn(); } catch { /* SDK 미로드/차단 등 무시 */ } };

export const GD = {
  get active() { return _active; },

  /** 부팅 시 1회 — GD 빌드(GD_OPTIONS 주입)이면 이벤트 라우터 등록 후 활성화 */
  async init() {
    if (!window.GD_OPTIONS) return false; // GD 빌드 아님
    _active = true;
    // 주입 스니펫이 GD_OPTIONS.onEvent → window.__gdOnEvent 로 넘겨준 이벤트 처리
    window.__gdOnEvent = (e) => {
      switch (e && e.name) {
        case 'SDK_GAME_PAUSE': // 광고 시작 → 게임 오디오 뮤트
          safe(() => _mute && _mute());
          break;
        case 'SDK_GAME_START': // 광고 종료(또는 초기) → 언뮤트
          safe(() => _unmute && _unmute());
          break;
        case 'SDK_REWARDED_WATCH_COMPLETE': // 완주 → 보상 (권위 신호)
          if (_pendingReward && !_pendingReward.settled) {
            _pendingReward.settled = true;
            safe(() => _pendingReward.onReward());
          }
          break;
      }
    };
    // 리워드 미리 로드 (fill 개선 — 실패해도 무시)
    safe(() => sdk() && sdk().preloadAd && sdk().preloadAd('rewarded').catch(() => {}));
    return true;
  },

  /** main.js가 오디오 뮤트/언뮤트 훅 주입 (광고 재생 중 게임 사운드 정지) */
  setAudioHooks(mute, unmute) { _mute = mute; _unmute = unmute; },

  /** 인터스티셜 — 항상 onClosed로 흐름 보장 */
  showInterstitial(onClosed) {
    if (!_active || !sdk()) { onClosed(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; onClosed(); };
    try {
      const p = sdk().showAd(); // 기본 = 인터스티셜
      if (p && p.then) p.then(finish).catch(finish); else finish();
    } catch { finish(); }
  },

  /** 리워드 — 완주(SDK_REWARDED_WATCH_COMPLETE)에만 보상, 스킵/실패는 onDismiss */
  showRewarded(onReward, onDismiss) {
    if (!_active || !sdk()) { onReward(); return; } // ads.js가 _active일 때만 호출
    const p = { onReward, onDismiss, settled: false };
    _pendingReward = p;
    const preloadNext = () => safe(() => sdk().preloadAd && sdk().preloadAd('rewarded').catch(() => {}));
    // 완주 이벤트가 안 온 채 광고 흐름이 끝나면(스킵/에러) 보상 없이 종료
    const endWithoutReward = () => { if (!p.settled) { p.settled = true; safe(() => onDismiss && onDismiss()); } preloadNext(); };
    try {
      const ad = sdk().showAd('rewarded');
      if (ad && ad.then) ad.then(endWithoutReward).catch(endWithoutReward);
      else endWithoutReward();
    } catch { endWithoutReward(); }
  },
};
