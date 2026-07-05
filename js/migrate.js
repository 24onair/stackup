// migrate.js — 도메인 전환(24onair.github.io → playchipchip.com) 시 최고점/기록 이전.
//
// 원리: localStorage는 origin(스킴+호스트) 기준이고 경로(path)는 무시한다. 따라서 구 origin
//   24onair.github.io 이 저장한 게임 기록(chromaStack.v1)은, 커스텀 도메인 리다이렉트 대상이
//   아닌 사용자페이지(24onair.github.io/chipchip-migrate.html)에서도 읽을 수 있다. 신 도메인은
//   그 페이지를 숨긴 iframe으로 불러와 postMessage로 기록을 넘겨받아 병합한다.
//
// 안전장치: 신 도메인에서만 동작 / 1회성(플래그) / 비파괴적 병합(큰 값 채택) / origin 검증.

import { Storage, showTitle } from './ui.js';

const OLD_ORIGIN = 'https://24onair.github.io';
const BRIDGE_URL = OLD_ORIGIN + '/chipchip-migrate.html';
const FLAG_KEY = 'chipchip.migrated';
const NEW_HOSTS = ['playchipchip.com', 'www.playchipchip.com'];
const TIMEOUT_MS = 5000;

export function runMigration() {
  // 신 도메인에서만 (로컬 개발·구 도메인·포털 임베드에선 건너뜀)
  if (!NEW_HOSTS.includes(location.hostname)) return;
  try { if (localStorage.getItem(FLAG_KEY)) return; } catch { return; }

  let done = false;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.src = BRIDGE_URL;

  const cleanup = () => {
    window.removeEventListener('message', onMsg);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  const onMsg = (e) => {
    if (done || e.origin !== OLD_ORIGIN) return;   // origin 검증
    const d = e.data;
    if (!d || d.type !== 'chipchip-migrate') return;
    done = true;
    const merged = Storage.mergeMigrated(d.payload);
    try { localStorage.setItem(FLAG_KEY, '1'); } catch { /* 무시 */ }
    cleanup();
    // 타이틀이 떠 있으면 이전된 기록으로 즉시 갱신 (없거나 숨김이면 건드리지 않음)
    if (merged) {
      const t = document.getElementById('title');
      if (t && t.style.display !== 'none') { try { showTitle(); } catch { /* 무시 */ } }
    }
  };

  window.addEventListener('message', onMsg);
  (document.body || document.documentElement).appendChild(iframe);

  // 응답 없으면(브릿지 미배포/네트워크) 플래그는 남기지 않아 다음 방문에 재시도
  setTimeout(() => { if (done) return; done = true; cleanup(); }, TIMEOUT_MS);
}
