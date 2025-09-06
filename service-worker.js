// service-worker.js — PWA Loot Generator
importScripts('version.js');

const CACHE_NAME = `lootgen-${APP_VERSION}`;

const BASE = self.registration.scope.replace(self.origin, '');

const STATIC_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css?v=${APP_VERSION}`,
  `${BASE}background.css?v=${APP_VERSION}`,   // ← если файла нет — не страшно
  `${BASE}app.js?v=${APP_VERSION}`,
  `${BASE}items.js?v=${APP_VERSION}`,
  `${BASE}pricing.js?v=${APP_VERSION}`,         // ← новый модуль с загрузкой базы
  `${BASE}manifest.json`,
  `${BASE}data/items.json`,                   // ← БАЗА ПРЕДМЕТОВ ДЛЯ ОФФЛАЙНА
];

// install
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' })));
  })());
});

// activate
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : undefined)));
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

// skipWaiting из страницы
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// стратегии
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isSameOrigin = url.origin === self.origin;
  const acceptsHTML = req.headers.get('accept')?.includes('text/html');

  if (req.mode === 'navigate' || (req.method === 'GET' && acceptsHTML)) {
    event.respondWith(handleHTMLRequest(event));
    return;
  }

  if (isSameOrigin) {
    const pathname = url.pathname;
    const isStatic =
      pathname.startsWith(BASE) &&
      (/\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json|woff2?|ttf|otf|mp3|wav)$/i.test(pathname) ||
       pathname.startsWith(`${BASE}data/`));

    if (req.method === 'GET' && isStatic) {
      event.respondWith(staleWhileRevalidate(req));
      return;
    }
  }
});

async function handleHTMLRequest(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const net = await fetch(event.request, { cache: 'no-store' });
    cache.put(event.request, net.clone());
    return net;
  } catch {
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const fallback = await cache.match(`${BASE}index.html`);
    return fallback || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(res => {
    if (!res || res.status !== 200) return res;
    cache.put(req, res.clone());
    return res;
  }).catch(() => undefined);
  return cached || networkPromise || fetch(req);
}
