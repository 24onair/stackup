// theme.js — CHIP! CHIP! 칩칩! 디자인 토큰 (design_handoff_chipchip 가이드)
// 규칙: 순수 #000/#FFF 금지, 그림자는 INK 단색 오프셋(블러 금지), 외곽선 2–3px INK,
//       오렌지(#E4572E)는 한 화면에 CTA 1곳만. 게임 5색은 UI 전용 — 칩 색은 colors.js 그라데이션.

export const T = {
  // 게임 5색 (UI/버튼/스탬프/포디움/와이프 전용)
  ORANGE: '#E4572E', MUSTARD: '#EDAA3C', AVOCADO: '#6E7F3C', TEAL: '#1F7A72', BRICK: '#A93B2A',
  GAME5: ['#E4572E', '#EDAA3C', '#6E7F3C', '#1F7A72', '#A93B2A'],
  // 중성색
  PAPER: '#F3E9D7', INK: '#33261A', CREAM: '#FBF4E6',
  INK_30: 'rgba(51,38,26,0.3)', INK_35: 'rgba(51,38,26,0.35)', INK_40: 'rgba(51,38,26,0.4)',
  CREAM_30: 'rgba(251,244,230,0.35)', CREAM_60: 'rgba(251,244,230,0.6)',
  SUBTLE: '#6b5947',
  // 존 배경색 (로드 전 폴백 / HUD 밤 전환 판정용 — 실제 배경은 도시별 픽셀 스트립)
  ZONE_BG: ['#EFE3CB', '#EAD9B4', '#D9E0D3', '#33261A'],
  ZONE_SUFFIX: ['지상', '스카이라인', '하늘', '성층권'],
  ZONE_BOUNDS: [16, 41, 71],              // 이 높이(칩)부터 다음 존
  ZONE_TOASTS: ['하늘로 올라가요!', '구름 위로!', '밤하늘을 넘었어요!'], // 전 도시 공통(도시 무관 문구)
  // 배경 오브젝트 페이퍼 톤 (채도 30% 이하)
  BG_TAN: '#C9B592', BG_TAN2: '#B3A07E', BG_GOLD: '#C9A84C', BASKET: '#C29B5F',
  GROUND: '#6E7F3C',
  // 캔버스 폰트 스택
  F_DISPLAY: '"Rammetto One", "Jua", sans-serif',        // 영문·숫자 디스플레이
  F_HEAD: '"Jua", "IBM Plex Sans KR", sans-serif',        // 한글 헤드라인
  F_MONO: '"IBM Plex Mono", monospace',                   // 칩 코드 라벨
};

// 스테이지(도시) — 배경 픽셀 스트립 6종. 성층권 구간은 전 도시 공통. 기본 서울.
export const STAGES = [
  { id: 'seoul',      name: '서울',     en: 'SEOUL' },
  { id: 'queenstown', name: '퀸즈타운', en: 'QUEENSTOWN' },
  { id: 'tokyo',      name: '도쿄',     en: 'TOKYO' },
  { id: 'paris',   name: '파리',   en: 'PARIS' },
  { id: 'london',  name: '런던',   en: 'LONDON' },
  { id: 'newyork', name: '뉴욕',   en: 'NEW YORK' },
  { id: 'cairo',   name: '카이로', en: 'CAIRO' },
];
export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
export const stageAsset = (id) => `assets/${stageById(id).id}-bg-pixel.png`;

/** HUD/결과 존 배지 문구 — "서울 · 스카이라인" */
export function zoneName(cityName, zoneIdx) { return `${cityName} · ${T.ZONE_SUFFIX[zoneIdx]}`; }

/** 칩 번호 포맷 — 가이드의 "점수=수집한 색" 시스템 (번호는 높이/순번 연동) */
export const chipCode = (n) => `CC ${String(Math.max(0, Math.min(999, n))).padStart(3, '0')}-C`;

/** OKLCH hue → 한글 색이름 (칩 라벨용, 그라데이션 유지 절충안) */
export function koreanColorName(hue) {
  const h = ((hue % 360) + 360) % 360;
  if (h < 20) return '자주';
  if (h < 40) return '벽돌';
  if (h < 70) return '주황';
  if (h < 100) return '겨자';
  if (h < 125) return '레몬';
  if (h < 165) return '올리브';
  if (h < 215) return '청록';
  if (h < 290) return '파랑';
  if (h < 330) return '보라';
  return '자주';
}

/** 존 인덱스 (0=지상 1=스카이라인 2=하늘 3=성층권) */
export function zoneIndex(heightChips) {
  const b = T.ZONE_BOUNDS;
  if (heightChips >= b[2]) return 3;
  if (heightChips >= b[1]) return 2;
  if (heightChips >= b[0]) return 1;
  return 0;
}

/** 캔버스 렌더 전 폰트 프리로드 — ctx.font는 로드를 트리거하지 않으므로 명시 호출 필수.
 *  CDN 실패 시 2.5초 후 폴백 스택으로 진행. */
export function loadFonts() {
  try {
    const wants = [
      '16px "Rammetto One"',
      '16px "Jua"',
      '500 16px "IBM Plex Mono"',
      '700 16px "IBM Plex Sans KR"',
    ];
    return Promise.race([
      Promise.allSettled(wants.map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    return Promise.resolve(); // document.fonts 미지원 — 폴백 스택으로 진행
  }
}
