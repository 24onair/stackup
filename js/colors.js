// colors.js — 팬톤 영감 앵커 팔레트 + OKLCH 보간
// 칩 컬러는 항상 L∈[0.62,0.78], C∈[0.08,0.15]로 클램프해 "팬톤 칩" 톤을 유지한다.

// ─── 튜닝 상수 ───────────────────────────────────────────
export const CHIPS_PER_SEGMENT = 10;   // 앵커 하나에서 다음 앵커까지 칩 개수
export const CHIP_L_MIN = 0.62, CHIP_L_MAX = 0.78;
export const CHIP_C_MIN = 0.08, CHIP_C_MAX = 0.15;

// 팬톤 Color of the Year 계열 영감 앵커 (색상환 순서로 정렬, 순환)
export const ANCHORS = [
  '#F5DF4D', // Illuminating 계열
  '#EFC050', // Mimosa 계열
  '#DD4124', // Tangerine Tango 계열
  '#FF6F61', // Living Coral 계열
  '#BB2649', // Viva Magenta 계열
  '#B565A7', // Radiant Orchid 계열
  '#5F4B8B', // Ultra Violet 계열
  '#34568B', // Classic Blue 계열
  '#0F4C81', // Deep Classic Blue 계열
  '#009499', // Teal 계열
  '#88B04B', // Greenery 계열
  '#C9A227', // Golden Olive 계열 → 노랑으로 순환 복귀
];

// ─── sRGB ↔ OKLab/OKLCH 변환 (Björn Ottosson 공개 수식) ───
function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function linearToSrgb(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

function rgbToOklab(r, g, b) {
  r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function oklabToRgb(L, a, b) {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}

export function hexToOklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lab = rgbToOklab(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  const c = Math.hypot(lab.a, lab.b);
  let h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { l: lab.L, c, h };
}

export function oklchToHex({ l, c, h }) {
  // 감마 밖이면 채도를 줄여가며 클램프
  for (let cc = c; cc >= 0; cc -= 0.005) {
    const rad = h * Math.PI / 180;
    const rgb = oklabToRgb(l, cc * Math.cos(rad), cc * Math.sin(rad));
    if (rgb.r >= -0.001 && rgb.r <= 1.001 && rgb.g >= -0.001 && rgb.g <= 1.001 && rgb.b >= -0.001 && rgb.b <= 1.001) {
      const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
      return '#' + [rgb.r, rgb.g, rgb.b].map((v) => to255(v).toString(16).padStart(2, '0')).join('');
    }
  }
  return '#808080';
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpHue(a, b, t) {
  let d = ((b - a + 540) % 360) - 180; // 최단 경로
  return (a + d * t + 360) % 360;
}

export function oklchLerp(A, B, t) {
  return { l: lerp(A.l, B.l, t), c: lerp(A.c, B.c, t), h: lerpHue(A.h, B.h, t) };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── 게임용 컬러 프로바이더 ─────────────────────────────
const anchorLch = ANCHORS.map(hexToOklch);

export function randomStartIndex() {
  return Math.floor(Math.random() * ANCHORS.length);
}

/** n번째 칩(0-base)의 컬러. startIdx는 매 판 랜덤 앵커 시작점. */
export function chipColor(n, startIdx) {
  const seg = Math.floor(n / CHIPS_PER_SEGMENT);
  const t = (n % CHIPS_PER_SEGMENT) / CHIPS_PER_SEGMENT;
  const a = anchorLch[(startIdx + seg) % anchorLch.length];
  const b = anchorLch[(startIdx + seg + 1) % anchorLch.length];
  const c = oklchLerp(a, b, t);
  c.l = clamp(c.l, CHIP_L_MIN, CHIP_L_MAX);
  c.c = clamp(c.c, CHIP_C_MIN, CHIP_C_MAX);
  return c; // {l,c,h} — hex는 oklchToHex로
}

/** 현재 칩 hue에 연동된 배경(저채도 보색) / 바닥 / 텍스트 컬러 */
export function bgColorFor(hue)    { return { l: 0.955, c: 0.015, h: (hue + 180) % 360 }; }
export function floorColorFor(hue) { return { l: 0.30,  c: 0.02,  h: hue }; }
export function textColorFor(hue)  { return { l: 0.35,  c: 0.03,  h: hue }; }
