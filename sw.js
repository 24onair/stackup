// sw.js — 최소 Service Worker (PWA 설치 요건 + 오프라인 폴백)
// 전략: 동일 출처만 처리. HTML/JS는 network-first(배포 즉시 반영 우선),
// 이미지/오디오는 cache-first(대용량 재다운로드 방지).
// 광고·분석·폰트 등 크로스오리진 요청은 절대 가로채지 않는다.

const CACHE = 'chipchip-v1';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;

  const isStatic = /\.(png|jpg|mp3|woff2?)$/.test(url.pathname);
  if (isStatic) {
    // cache-first: 배경 스트립·사운드는 바뀌면 파일명이 바뀌는 편이라 안전
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
  } else {
    // network-first: HTML/JS는 항상 최신 우선, 오프라인 시 캐시 폴백
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
