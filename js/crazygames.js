// crazygames.js — CrazyGames HTML5 SDK v3 어댑터.
//
// 포털 전용 빌드에서만 활성화된다. build-portal.sh가 index.html에 SDK 스크립트
// (https://sdk.crazygames.com/crazygames-sdk-v3.js)를 주입한 빌드를 CrazyGames에 제출한다.
// 자체 도메인(playchipchip.com)·itch 빌드엔 SDK가 없어 _active=false → ads.js가
// 기존 AdSense/폴백 경로를 그대로 쓴다. 모든 SDK 호출은 try/catch로 감싸 'disabled'
// 환경(예외 발생)에서도 게임이 죽지 않게 한다.
//
// 환경(SDK.environment): 'crazygames'(실서비스) | 'local'(localhost 데모광고) | 'disabled'(그 외)
// 광고 정책: adStarted에 게임 사운드 뮤트, adFinished/adError에 언뮤트(문서 요구).

let _active = false;
let _mute = null, _unmute = null, _onPlatformMute = null;

const sdk = () => (window.CrazyGames && window.CrazyGames.SDK) || null;
const safe = (fn) => { try { return fn(); } catch { /* disabled 환경 등 무시 */ } };

export const CG = {
  get active() { return _active; },

  /** 부팅 시 1회 — SDK가 주입돼 있으면 init하고 활성 환경인지 판정 */
  async init() {
    const s = sdk();
    if (!s) return false; // 포털 빌드 아님
    try {
      await s.init();
      const env = s.environment; // 'crazygames' | 'local' | 'disabled'
      _active = env === 'crazygames' || env === 'local';
      if (_active) {
        safe(() => s.game.loadingStart());
        // 플랫폼 muteAudio 연동 — 설정 변경 리스너 등록 + 초기 상태 반영.
        // (settings.muteAudio가 true면 게임 오디오를 꺼야 하며 인게임 설정보다 우선)
        safe(() => {
          const apply = (settings) => {
            const st = settings || sdk().game.settings || {};
            if (_onPlatformMute) _onPlatformMute(!!st.muteAudio);
          };
          sdk().game.addSettingsChangeListener(apply);
          apply(); // 초기 muteAudio 상태 즉시 반영
        });
      }
      return _active;
    } catch { _active = false; return false; }
  },

  /** main.js가 오디오 뮤트/언뮤트 훅 주입 (광고 재생 중 게임 사운드 정지) */
  setAudioHooks(mute, unmute) { _mute = mute; _unmute = unmute; },

  /** main.js가 플랫폼 muteAudio 변경 훅 주입 — fn(muted:boolean). 등록 즉시 현재 상태로 1회 호출 */
  setMuteHook(fn) {
    _onPlatformMute = fn;
    if (_active && fn) safe(() => fn(!!(sdk().game.settings || {}).muteAudio));
  },

  loadingDone()   { if (_active) safe(() => sdk().game.loadingStop()); },
  gameplayStart() { if (_active) safe(() => sdk().game.gameplayStart()); },
  gameplayStop()  { if (_active) safe(() => sdk().game.gameplayStop()); },
  happytime()     { if (_active) safe(() => sdk().game.happytime()); },

  /** 인터스티셜(midgame) — 항상 onClosed로 흐름 보장 */
  showInterstitial(onClosed) {
    if (!_active) { onClosed(); return; }
    let done = false;
    const finish = () => { if (done) return; done = true; safe(() => _unmute && _unmute()); onClosed(); };
    try {
      sdk().ad.requestAd('midgame', {
        adStarted: () => safe(() => _mute && _mute()),
        adFinished: finish,
        adError: finish, // 광고 없음/실패 → 그냥 진행
      });
    } catch { finish(); }
  },

  /** 리워드 — 완주(adFinished)에만 보상, 실패/스킵(adError)은 onDismiss */
  showRewarded(onReward, onDismiss) {
    if (!_active) { onReward(); return; } // ads.js가 _active일 때만 호출하므로 실사용 안 됨
    let settled = false;
    const reward  = () => { if (settled) return; settled = true; safe(() => _unmute && _unmute()); onReward(); };
    const dismiss = () => { if (settled) return; settled = true; safe(() => _unmute && _unmute()); onDismiss && onDismiss(); };
    try {
      sdk().ad.requestAd('rewarded', {
        adStarted: () => safe(() => _mute && _mute()),
        adFinished: reward,
        adError: dismiss,
      });
    } catch { dismiss(); }
  },
};
