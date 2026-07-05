// analytics.js — GA4(gtag) 연동 + 게임 이벤트 트래킹.
// 프로덕션 도메인(또는 ?ga)에서만 gtag를 로드해 로컬·포털 데이터 오염을 막는다.
// track()은 gtag 부재 시 안전하게 무시하며, QA용으로 최근 이벤트를 버퍼에 남긴다.

const GA_ID = 'G-RE4HV9B51W';
const PROD_HOSTS = ['playchipchip.com', 'www.playchipchip.com'];

const params = new URLSearchParams(location.search);
const recent = []; // QA 디버그 버퍼(최근 50개)

function initAnalytics() {
  const allowed = PROD_HOSTS.includes(location.hostname) || params.has('ga');
  if (!allowed || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.gtag('js', new Date());
  window.gtag('config', GA_ID);
}

/** 커스텀 이벤트 전송 — gtag 부재 시 무시(폴백), 항상 QA 버퍼에 기록. */
export function track(name, data = {}) {
  try { if (window.gtag) window.gtag('event', name, data); } catch { /* 무시 */ }
  recent.push({ name, data, t: Date.now() });
  if (recent.length > 50) recent.shift();
}

// QA 훅 — 콘솔에서 window.__analytics.recent()
window.__analytics = { recent: () => recent.slice(), id: GA_ID, active: () => !!window.gtag };

initAnalytics();
