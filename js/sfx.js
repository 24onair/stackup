// sfx.js — 샘플(mp3) 기반 효과음 원샷 플레이어 + 고도별 바람 앰비언스 루프
// Web Audio AudioBufferSourceNode 사용. 신스(main.js의 Sfx)와 같은 AudioContext를 공유받아
// 첫 유저 제스처 이후에만 소리가 난다(브라우저 자동재생 정책). BGM(bgm.js)과는 별개 모듈.
// 원샷은 호출마다 새 소스를 만들어 겹쳐 재생 → 연속 재생 시 끊김이 없다.

const DIR = 'assets/sounds/';
const FILES = {
  chip_drop:     'chip_drop.mp3',
  land_normal:   'land_normal.mp3',
  land_perfect:  'land_perfect.mp3',
  combo_fire:    'combo_fire.mp3',
  altitude_up:   'altitude_up.mp3',
  fail_collapse: 'fail_collapse.mp3',
  new_record:    'new_record.mp3',
};

// 원샷별 볼륨 + 재생 상한(초). 긴 클립은 앞부분만 잘라 씀(꼬리 5ms 페이드로 클릭 방지).
const CFG = {
  chip_drop:     { gain: 0.9, maxDur: 0.7 },
  land_normal:   { gain: 1.0, maxDur: 0.5 },
  land_perfect:  { gain: 1.0, maxDur: 0.9 },
  combo_fire:    { gain: 0.9, maxDur: 1.6 },
  altitude_up:   { gain: 0.8, maxDur: 1.6 },
  fail_collapse: { gain: 1.0, maxDur: 1.2 },
  new_record:    { gain: 0.9, maxDur: 2.6 },
};

// 앰비언스: 3분짜리 파일에서 2:30~2:45(150~165초) 15초 구간만 무한 루프.
const AMB_FILE = 'ambience_wind.mp3';
const AMB_LOOP_START = 150;
const AMB_LOOP_END = 165;
// 고도 존별 바람 질감(0 지상 → 3 성층권): lowpass cutoff·볼륨으로 한 소스에서 다르게.
const ZONE_AMB = [
  { gain: 0.12, cutoff: 500 },  // 지상 — 먹먹하고 작게
  { gain: 0.20, cutoff: 1200 }, // 스카이라인
  { gain: 0.30, cutoff: 3000 }, // 하늘 — 바람이 세짐
  { gain: 0.40, cutoff: 6000 }, // 성층권 — 가장 밝고 크게
];

const LS_KEY = 'chromaStack.bgmOn'; // BGM과 동일 키 — 뮤트 상태 공유

export const Sample = {
  ctx: null,
  master: null,          // 마스터(뮤트) 게인
  buffers: {},
  enabled: localStorage.getItem(LS_KEY) !== '0',
  // 앰비언스 노드
  ambBuf: null,
  ambSrc: null,
  ambGain: null,
  ambFilter: null,
  zone: 0,

  /** 첫 유저 제스처에서 audio()가 호출 — AudioContext 공유받아 버퍼 디코드 + 앰비언스 시작 */
  async start(ctx) {
    if (this.ctx) { if (this.enabled) this._startAmbience(); return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);
    // 앰비언스 필터/게인 체인 (버퍼는 아래서 로드)
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'lowpass';
    this.ambFilter.frequency.value = ZONE_AMB[this.zone].cutoff;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = ZONE_AMB[this.zone].gain;
    this.ambFilter.connect(this.ambGain).connect(this.master);

    await Promise.all([
      ...Object.entries(FILES).map(([k, f]) => this._load(k, DIR + f)),
      this._loadAmbience(),
    ]);
    if (this.enabled) this._startAmbience();
  },

  async _load(name, url) {
    try {
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      this.buffers[name] = await this.ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn('효과음 로드 실패:', name, e);
    }
  },

  async _loadAmbience() {
    try {
      const res = await fetch(DIR + AMB_FILE);
      const arr = await res.arrayBuffer();
      this.ambBuf = await this.ctx.decodeAudioData(arr);
    } catch (e) {
      console.warn('앰비언스 로드 실패:', e);
    }
  },

  /** 원샷 재생. rate로 피치(=속도) 조절(퍼펙트 콤보 반음 상승). 매번 새 소스 → 겹침 허용. */
  play(name, { rate = 1 } = {}) {
    if (!this.enabled || !this.ctx || !this.buffers[name]) return;
    try {
      const cfg = CFG[name] || { gain: 1, maxDur: 3 };
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      // 실제 재생 길이 = min(상한, 원본길이/속도). 꼬리 5ms 페이드아웃.
      const dur = Math.min(cfg.maxDur, this.buffers[name].duration / rate);
      const fade = Math.min(0.05, dur * 0.2);
      g.gain.setValueAtTime(cfg.gain, now);
      g.gain.setValueAtTime(cfg.gain, now + dur - fade);
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
      src.connect(g).connect(this.master);
      src.start(now);
      src.stop(now + dur + 0.02);
    } catch { /* 오디오 불가 환경 무시 */ }
  },

  _startAmbience() {
    if (!this.ctx || !this.ambBuf || this.ambSrc) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.ambBuf;
      src.loop = true;
      src.loopStart = AMB_LOOP_START;
      src.loopEnd = AMB_LOOP_END;
      src.connect(this.ambFilter);
      src.start(0, AMB_LOOP_START); // 루프 구간 시작점부터 재생
      this.ambSrc = src;
    } catch { /* 무시 */ }
  },

  _stopAmbience() {
    if (this.ambSrc) { try { this.ambSrc.stop(); } catch { /* 이미 정지 */ } }
    this.ambSrc = null;
  },

  /** 고도 존 전환 — 앰비언스 필터/볼륨을 부드럽게 바꿔 분위기 전환 */
  setZone(z) {
    this.zone = Math.max(0, Math.min(ZONE_AMB.length - 1, z));
    if (!this.ctx || !this.ambGain) return;
    const p = ZONE_AMB[this.zone];
    const t = this.ctx.currentTime;
    this.ambGain.gain.cancelScheduledValues(t);
    this.ambGain.gain.setValueAtTime(this.ambGain.gain.value, t);
    this.ambGain.gain.linearRampToValueAtTime(p.gain, t + 0.4);
    this.ambFilter.frequency.cancelScheduledValues(t);
    this.ambFilter.frequency.setValueAtTime(this.ambFilter.frequency.value, t);
    this.ambFilter.frequency.linearRampToValueAtTime(p.cutoff, t + 0.4);
  },

  // 마스터 뮤트 — bgm.js와 동일한 WebView-세이프 방식(게인 0/1 + 앰비언스 정지/재시작).
  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx || !this.master) return;
    if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch { /* */ } }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(on ? 1 : 0, t);
    if (on) this._startAmbience();
    else this._stopAmbience();
  },
};
