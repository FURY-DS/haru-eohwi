/* 하루어휘 service worker
 * - 같은 출처 GET 요청은 "네트워크 우선, 실패하면 캐시" 로 처리합니다.
 *   (새 데이터/새 코드는 항상 최신, 오프라인이면 마지막으로 본 내용)
 */
const CACHE = 'haru-eohwi-v5';
const SHELL = [
  './', 'index.html', 'css/style.css', 'js/app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'data/config.json', 'data/index.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;   // 동기화 API 는 캐시하지 않고 그대로 네트워크로

  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        // 404 는 캐시하지 않음 (자료 없는 날짜가 영구히 "없음"으로 굳는 것을 방지). 206(부분 응답)도 캐시하지 않음
        if (res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())
        )
      )
  );
});
