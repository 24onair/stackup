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
let _pendingReward = null;       // { onReward, onDismiss, settled, started, end } — 리워드 진행 중
let _pendingInterstitial = null; // finish() — 인터스티셜 종료 시 흐름 복귀 콜백
let _interStarted = false;       // 인터스티셜 광고가 실제로 시작(SDK_GAME_PAUSE)됐는지 — 무필/스로틀 워치독용

// ⚠️ GameMonetize 광고는 로드~시작까지 ~10s 걸리는 걸 실측함. 그래서 시작 워치독은 그보다
//    넉넉한 15s로 둬야 정상 광고를 조기 종료시키지 않음. (명시적 *ERROR* 이벤트는 즉시 처리.)
const AD_START_MS = 15000;       // 이 시간 안에 광고가 시작 안 되면 무필/스로틀로 보고 흐름 복귀
const AD_MAX_MS = 120000;        // 최종 안전망(정상 완주 광고를 자르지 않도록 넉넉히)

const sdk = () => window.sdk || null;
const safe = (fn) => { try { return fn(); } catch { /* SDK 미로드/차단 등 무시 */ } };

// 리워드 프리로드 — SDK 변형별 메서드 자동 감지 (실패 무시)
const preloadReward = () => safe(() => {
  const s = sdk(); if (!s) return;
  if (s.preloadRewarded) return s.preloadRewarded('rewarded').catch(() => {});
  if (s.preloadAd) return s.preloadAd('rewarded').catch(() => {});
});

// ⚠️ GameMonetize에는 리워드(rewarded) 포맷이 없다 — showBanner() 하나뿐이고 SDK에 rewarded
//    개념 자체가 없어 "끝까지 봤는지"를 검증할 수 없다. 게다가 두 번째 광고는 빈도제한으로
//    무필(이벤트 0개)이 잦다. 그래서 GM 리워드는 업계 표준(무필 시 지급)대로 "광고 요청 후
//    흐름이 끝나면 무조건 보상" — 광고가 떴으면 보고 나서, 무필이면 그냥. 사용자를 벌하지 않고
//    이어하기/점수2배가 항상 동작하게 한다(수익은 실제 뜬 광고에서 발생). CG·GD는 진짜 리워드라
//    완주 검증 유지(이 파일과 무관).
function grantPendingReward() {
  if (_pendingReward && !_pendingReward.settled) {
    _pendingReward.settled = true;
    const p = _pendingReward; _pendingReward = null;
    safe(() => p.onReward());
    preloadReward();
  }
}

export const GM = {
  get active() { return _active; },

  /** 부팅 시 1회 — GameMonetize 빌드(SDK_OPTIONS 주입)이면 이벤트 라우터 등록 후 활성화 */
  async init() {
    if (!window.SDK_OPTIONS) return false; // GameMonetize 빌드 아님
    _active = true;
    // 주입 스니펫이 SDK_OPTIONS.onEvent → window.__gmOnEvent 로 넘겨준 이벤트 처리
    window.__gmOnEvent = (e) => {
      const name = e && e.name;
      switch (name) {
        case 'SDK_GAME_PAUSE': // 광고 시작 → 뮤트 + 시작 표시(무필/스로틀 워치독 해제)
          safe(() => _mute && _mute());
          if (_pendingReward) _pendingReward.started = true;
          _interStarted = true;
          break;
        // 비디오형 광고 완주(모든 quartile 통과) → 보상. (GD의 SDK_REWARDED_WATCH_COMPLETE도 호환)
        case 'COMPLETE':
        case 'SDK_REWARDED_WATCH_COMPLETE':
          grantPendingReward();
          break;
        case 'SDK_GAME_START': // 광고 종료(비디오/디스플레이 무관) 또는 초기 준비 → 언뮤트 + 흐름 복귀
          safe(() => _unmute && _unmute());
          if (_pendingInterstitial) { const done = _pendingInterstitial; _pendingInterstitial = null; safe(done); }
          grantPendingReward(); // 광고가 떴다가 닫힘 → 보상(디스플레이형은 COMPLETE가 없음)
          break;
        default:
          // 광고 에러/무필/스로틀(*ERROR*) — 광고가 안 떴어도 대기 리워드는 지급(GM 무필 정책),
          // 인터스티셜은 흐름 복귀.
          if (typeof name === 'string' && /ERROR/i.test(name)) {
            if (_pendingInterstitial) { const done = _pendingInterstitial; _pendingInterstitial = null; safe(done); }
            grantPendingReward();
          }
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
    _interStarted = false;
    const finish = () => {
      if (done) return; done = true;
      _pendingInterstitial = null;
      safe(onClosed);
    };
    _pendingInterstitial = finish;       // SDK_GAME_START(재개)로 종료 신호
    // 시작 워치독 — 광고가 제때 시작 안 되면(무필/스로틀) 곧바로 게임 진행
    setTimeout(() => { if (!done && !_interStarted) finish(); }, AD_START_MS);
    setTimeout(finish, AD_MAX_MS);       // 최종 안전망 — SDK 무응답 시 게임 hang 방지
    try {
      const p = sdk().showBanner();      // GameMonetize: showBanner() = 인터스티셜
      if (p && p.then) p.then(finish).catch(finish); // 프로미스 지원 변형이면 즉시 종료
    } catch { finish(); }
  },

  /** 리워드 — 광고 요청 후 종료(또는 무필) 시 보상 지급. onDismiss는 GM에선 미사용(항상 지급). */
  showRewarded(onReward, onDismiss) { // eslint-disable-line no-unused-vars
    if (!_active || !sdk()) { onReward(); return; } // ads.js가 _active일 때만 호출
    const p = { onReward, settled: false, started: false };
    _pendingReward = p;
    // 무필 워치독 — 광고가 AD_START_MS 안에 시작(SDK_GAME_PAUSE)조차 안 되면 무필로 보고 보상.
    //   (광고가 이미 시작됐으면 started=true → 여기서 안 끊고 종료 이벤트/COMPLETE를 기다림.)
    //   AD_START_MS(15s)는 실측 광고 시작지연(~10s)보다 커서 정상 광고를 조기 지급하지 않음.
    setTimeout(() => { if (_pendingReward === p && !p.started) grantPendingReward(); }, AD_START_MS);
    // 최종 안전망 — 광고가 떴는데 종료 신호가 끝내 안 와도 보상(먹통 방지).
    setTimeout(() => { if (_pendingReward === p) grantPendingReward(); }, AD_MAX_MS);
    try {
      const ad = safe(() => sdk().showBanner()); // GameMonetize: 광고 메서드는 showBanner() 하나뿐
      if (ad && ad.then) ad.catch(() => grantPendingReward()); // 프로미스 변형이 즉시 실패하면 보상
    } catch { grantPendingReward(); }
  },
};
