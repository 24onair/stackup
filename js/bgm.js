// bgm.js — 배경음악 로더/루퍼
// Web Audio AudioBufferSourceNode(loop)로 재생 — <audio> 태그와 달리 루프 이음새 무음이 없다.
// 트랙 추가 시 TRACKS에 파일만 등록하면 됨 (예: tension, title)

const TRACKS = {
  main: 'audio/bgm-main.mp3',
  // tension: 'audio/bgm-tension.mp3',  // 후반 페이즈용 — 파일 추가 시 주석 해제
  // title:   'audio/bgm-title.mp3',
};

const VOLUME = 0.22;          // SFX(0.05~0.15)를 덮지 않는 기본 볼륨
const LS_KEY = 'chromaStack.bgmOn';

export const Bgm = {
  ctx: null,
  gain: null,        // 마스터(음소거) 게인
  duckGain: null,    // 덕킹(게임오버 감쇠) 게인
  src: null,
  buffers: {},
  current: null,
  enabled: localStorage.getItem(LS_KEY) !== '0',

  /** 첫 유저 제스처에서 호출 — AudioContext를 공유받아 초기화 후 메인 루프 재생 */
  async start(ctx) {
    if (this.ctx) { this.play('main'); return; }
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.gain.gain.value = this.enabled ? VOLUME : 0;
    this.duckGain.connect(this.gain);
    this.gain.connect(ctx.destination);
    await this._load('main');
    this.play('main');
  },

  async _load(name) {
    if (this.buffers[name] || !TRACKS[name]) return;
    try {
      const res = await fetch(TRACKS[name]);
      const arr = await res.arrayBuffer();
      this.buffers[name] = await this.ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn('BGM 로드 실패:', name, e);
    }
  },

  play(name) {
    if (!this.ctx || !this.buffers[name] || this.current === name) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = true;
    src.connect(this.duckGain);
    src.start();
    this.src = src;
    this.current = name;
  },

  stop() {
    if (this.src) { try { this.src.stop(); } catch { /* 이미 정지 */ } }
    this.src = null;
    this.current = null;
  },

  /** 게임오버 등에서 볼륨을 잠시 낮춤. factor 1 = 원복 */
  duck(factor, sec = 0.6) {
    if (!this.duckGain) return;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, t);
    this.duckGain.gain.linearRampToValueAtTime(factor, t + sec);
  },

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* 무시 */ }
    if (!this.ctx) return;
    // 언뮤트: 컨텍스트가 잠들어 있으면 깨우고, 소스가 죽었으면 재기동 (사파리/iOS 인터럽트 대응)
    if (on && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch { /* */ } }
    if (on && !this.src && this.buffers.main) this.play('main');
    if (this.gain) {
      const t = this.ctx.currentTime;
      const cur = this.gain.gain.value;
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setValueAtTime(cur, t); // 램프 앵커 — 없으면 브라우저별 동작 불일치
      this.gain.gain.linearRampToValueAtTime(on ? VOLUME : 0.0001, t + 0.3);
      this.gain.gain.setValueAtTime(on ? VOLUME : 0, t + 0.32); // 최종값 확정 스냅
    }
  },
};
