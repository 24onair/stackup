// i18n.js — 다국어(ko/en). 언어는 페이지 로드 시 1회 결정(localStorage 우선 → navigator).
// 전환은 setLang()으로 저장 후 리로드(재렌더 배선 없이 단순·견고). UI 문자열 사전 + t() 제공.
// 데이터성 현지화(도시명·존·색이름·토스트)는 theme.js가 LANG을 참조해 처리한다.

function detect() {
  try { const s = localStorage.getItem('chipchip.lang'); if (s === 'ko' || s === 'en') return s; } catch { /* 무시 */ }
  try { return (navigator.language || 'en').toLowerCase().startsWith('ko') ? 'ko' : 'en'; } catch { return 'en'; }
}

export const LANG = detect();

export function setLang(l) {
  try { localStorage.setItem('chipchip.lang', l); } catch { /* 무시 */ }
  location.reload();
}

const STR = {
  ko: {
    tagline: '한 번의 터치로 쌓는 컬러의 탑',
    city_prompt: '어느 도시에 쌓을까요?',
    play: '쌓아 볼까?',
    ranking: '🏆 랭킹',
    ranking_plain: '랭킹',
    privacy: '개인정보처리방침',
    how_to_play: '게임 방법',
    about: '소개',
    home_blurb: '한 번의 터치로 컬러 칩을 쌓는 실물리 스태킹 게임. 서울·문경·파리·도쿄 등 8개 도시의 스카이라인을 성층권까지 등반하세요. 무료 · 설치 불필요.',
    crash: '와르르...!',
    points_collected: '점을 모았어요',
    perfect: '퍼펙트',
    max_combo: '최다 콤보',
    nick_ph: '닉네임 (2~12자)',
    save: '등록',
    revive: '❤️ 광고 보고 이어하기',
    double: '🎬 광고 보고 점수 2배',
    play_again: '다시 쌓기',
    share: '기록 공유',
    home: '홈으로',
    today: '오늘', week: '주간', all: '전체',
    sound_toggle: '사운드 켜기/끄기',
    lang_switch: 'EN',
    // 동적
    best: '🏆 BEST {score}점 · {height}칩',
    streak: '🔥 {days}일 연속 플레이',
    best_tag: ' · 최고 기록!',
    chips_unit: '{n}칩',
    board_empty: '아직 기록이 없습니다',
    board_error: '랭킹을 불러오지 못했습니다',
    board_loading: '불러오는 중…',
    me: '나 ({nick})',
    pts: '{score}점',
    tap_hint: '화면을 터치해서 칩을 떨어뜨려요!',
    nick_rule: '2~12자로 입력하세요',
    nick_taken: '이미 사용 중!',
    nick_renamed: '닉네임이 {s}(으)로 바뀌었어요',
    ad_loading: '광고 불러오는 중…',
    copied: '복사됨!',
    share_text: 'CHIP! CHIP! 칩칩! {city}에서 {height}칩 · {score}점을 쌓았어요! 🏙️',
  },
  en: {
    tagline: 'Stack a tower of color with one tap',
    city_prompt: 'Which city will you stack in?',
    play: 'Play',
    ranking: '🏆 Ranking',
    ranking_plain: 'Ranking',
    privacy: 'Privacy Policy',
    how_to_play: 'How to Play',
    about: 'About',
    home_blurb: 'A one-tap, real-physics color-stacking game. Climb the skylines of 8 cities — Seoul, Mungyeong, Paris, Tokyo and more — all the way to the stratosphere. Free, no install.',
    crash: 'Crash…!',
    points_collected: 'points',
    perfect: 'Perfect',
    max_combo: 'Max combo',
    nick_ph: 'Nickname (2–12)',
    save: 'Save',
    revive: '❤️ Continue (watch ad)',
    double: '🎬 Double score (watch ad)',
    play_again: 'Play again',
    share: 'Share',
    home: 'Home',
    today: 'Today', week: 'Week', all: 'All',
    sound_toggle: 'Toggle sound',
    lang_switch: '한',
    // 동적
    best: '🏆 BEST {score} · {height} chips',
    streak: '🔥 {days}-day streak',
    best_tag: ' · Best!',
    chips_unit: '{n} chips',
    board_empty: 'No scores yet',
    board_error: "Couldn't load ranking",
    board_loading: 'Loading…',
    me: 'You ({nick})',
    pts: '{score}',
    tap_hint: 'Tap the screen to drop the chip!',
    nick_rule: 'Enter 2–12 characters',
    nick_taken: 'Name taken!',
    nick_renamed: 'Renamed to {s}',
    ad_loading: 'Loading ad…',
    copied: 'Copied!',
    share_text: 'CHIP! CHIP! — I stacked {height} chips ({score} pts) in {city}! 🏙️',
  },
};

/** 문자열 조회 + {key} 치환. 미정의 키는 ko 폴백 → 그래도 없으면 key 그대로. */
export function t(key, params) {
  let s = (STR[LANG] && STR[LANG][key]) ?? STR.ko[key] ?? key;
  if (params) for (const k in params) s = s.split(`{${k}}`).join(params[k]);
  return s;
}

/** data-i18n / data-i18n-ph / data-i18n-aria 속성을 가진 정적 요소를 현재 언어로 치환. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  try { document.documentElement.lang = LANG; } catch { /* 무시 */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => applyI18n());
else applyI18n();
