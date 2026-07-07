// gamemonetize.js — GameMonetize HTML5 SDK 어댑터.
//
// GameMonetize는 GameDistribution과 같은 SDK 계보(애그리게이터)라 구조가 거의 동일하다.
// 다른 점만: 전역이 GD_OPTIONS/gdsdk → SDK_OPTIONS/window.sdk, 인터스티셜 호출이 showBanner().
//
// 포털 전용 빌드에서만 활성화된다. build-portal.sh gamemonetize 가 index.html에
// SDK_OPTIONS(게임ID·이벤트 라우팅) + SDK 로더(https://api.gamemonetize.com/sdk.js)를
// 주입한 빌드를 GameMonetize에 제출한다. 자체 도메인·CrazyGames·GD·itch 빌드엔 SDK_OPTIONS가
// 없어 _active=false → ads.js가 기존 경로(AdSense/폴백/CrazyGames/GD)를 그대로 쓴다.
//
// 주입 스니펫은 SDK_OPTIONS.onEvent에서 window.__gmOnEvent(e)로 이벤트를 넘기고,
// 이 어댑터가 __gmOnEvent를 등록해 처리한다 (SDK가 모듈보다 먼저 로드되므로 이 분리가 필요).
//
// ⚠️ SDK 변형 대비 방어 설계:
//  - 광고 메서드는 자동 감지(showRewarded/showAd/showBanner 중 존재하는 것).
//  - 완료 신호는 이벤트(SDK_REWARDED_WATCH_COMPLETE / SDK_GAME_START) + 프로미스 + 타임아웃 3중.
//    → 어떤 변형에서도 게임 흐름이 멈추지 않고, 리워드는 완주 이벤트로만 지급.
//  ⚠️ 대시보드(gamemonetize.com)에서 게임의 REWARDED ADS 플래그를 켜야 리워드 요청 가능.

let _active = false;
let _mute = null, _unmute = null;
let _pendingReward = null;       // { onReward, onDismiss, settled, end } — 리워드 진행 중
let _pendingInterstitial = null; // finish() — 인터스티셜 종료 시 흐름 복귀 콜백

const sdk = () => window.sdk || null;
const safe = (fn) => { try { return fn(); } catch { /* SDK 미로드/차단 등 무시 */ } };

// 리워드 프리로드 — SDK 변형별 메서드 자동 감지 (실패 무시)
const preloadReward = () => safe(() => {
  const s = sdk(); if (!s) return;
  if (s.preloadRewarded) return s.preloadRewarded('rewarded').catch(() => {});
  if (s.preloadAd) return s.preloadAd('rewarded').catch(() => {});
});

export const GM = {
  get active() { return _active; },

  /** 부팅 시 1회 — GameMonetize 빌드(SDK_OPTIONS 주입)이면 이벤트 라우터 등록 후 활성화 */
  async init() {
    if (!window.SDK_OPTIONS) return false; // GameMonetize 빌드 아님
    _active = true;
    // 주입 스니펫이 SDK_OPTIONS.onEvent → window.__gmOnEvent 로 넘겨준 이벤트 처리
    window.__gmOnEvent = (e) => {
      switch (e && e.name) {
        case 'SDK_GAME_PAUSE': // 광고 시작 → 게임 오디오 뮤트
          safe(() => _mute && _mute());
          break;
        // ⚠️ GameMonetize는 GD의 SDK_REWARDED_WATCH_COMPLETE를 쓰지 않고 IMA/VAST 이벤트를
        //    낸다. 광고 완주 신호는 'COMPLETE'(모든 quartile 통과 후). 이게 리워드의 권위 신호.
        //    (SDK_REWARDED_WATCH_COMPLETE도 혹시 모를 변형 대비해 함께 처리)
        case 'COMPLETE':
        case 'SDK_REWARDED_WATCH_COMPLETE':
          if (_pendingReward && !_pendingReward.settled) {
            _pendingReward.settled = true;
            const p = _pendingReward; _pendingReward = null;
            safe(() => p.onReward());
            preloadReward();
          }
          break;
        case 'SDK_GAME_START': // 광고 종료(또는 초기 준비) → 언뮤트 + 대기 흐름 복귀
          safe(() => _unmute && _unmute());
          if (_pendingInterstitial) { const done = _pendingInterstitial; _pendingInterstitial = null; safe(done); }
          // COMPLETE 없이 재개됐으면(스킵/무필/중도이탈) 보상 없이 종료
          if (_pendingReward && !_pendingReward.settled) safe(() => _pendingReward.end());
          break;
      }
    };
    preloadReward(); // 부팅 시 미리 로드 (fill 개선)
    return true;
  },

  /** main.js가 오디오 뮤트/언뮤트 훅 주입 (광고 재생 중 게임 사운드 정지) */
  setAudioHooks(mute, unmute) { _mute = mute; _unmute = unmute; },

  /** 인터스티셜 — 프로미스/이벤트/타임아웃 중 무엇이 와도 onClosed 1회 보장 */
  showInterstitial(onClosed) {
    if (!_active || !sdk()) { onClosed(); return; }
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      _pendingInterstitial = null;
      safe(onClosed);
    };
    _pendingInterstitial = finish;       // SDK_GAME_START(재개)로 종료 신호
    setTimeout(finish, 30000);           // 안전망 — SDK 무응답 시 게임 hang 방지
    try {
      const p = sdk().showBanner();      // GameMonetize: showBanner() = 인터스티셜
      if (p && p.then) p.then(finish).catch(finish); // 프로미스 지원 변형이면 즉시 종료
    } catch { finish(); }
  },

  /** 리워드 — 완주(SDK_REWARDED_WATCH_COMPLETE)에만 보상, 스킵/실패/무응답은 onDismiss */
  showRewarded(onReward, onDismiss) {
    if (!_active || !sdk()) { onReward(); return; } // ads.js가 _active일 때만 호출
    const p = { onReward, onDismiss, settled: false };
    // 완주 없이 광고가 끝났을 때(스킵/에러/무필) — 보상 없이 종료
    p.end = () => {
      if (!p.settled) { p.settled = true; safe(() => onDismiss && onDismiss()); }
      if (_pendingReward === p) _pendingReward = null;
      preloadReward();
    };
    _pendingReward = p;
    // 리워드 광고 호출 — SDK 변형별 메서드 자동 감지
    const call = () => {
      const s = sdk();
      if (s.showRewarded) return s.showRewarded('rewarded');
      if (s.showAd) return s.showAd('rewarded');
      return s.showBanner('rewarded');
    };
    // 안전망 — 완주/스킵 신호가 전혀 안 오면 흐름 복귀(보상은 완주 이벤트가 이미 처리).
    // 실제 리워드 광고는 ≤30s라 120s면 정상 완주를 자르지 않음.
    setTimeout(() => safe(() => p.end()), 120000);
    try {
      const ad = safe(call);
      if (ad && ad.then) ad.then(() => safe(() => p.end())).catch(() => safe(() => p.end()));
    } catch { p.end(); }
  },
};
