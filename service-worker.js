// service-worker.js — PWA Loot Generator
// ↑ Меняй номер версии при каждом деплое (достаточно +1)
const VERSION = 'v2025-09-05-1';
const CACHE_NAME = `lootgen-${VERSION}`;

// Если сайт из корня (https://username.github.io/REPO/), оставь как есть.
// Если у тебя подкаталог, код сам поймёт базовый путь.
const BASE = self.registration.scope.replace(self.origin, ''); // напр. '/' или '/REPO/'

const STATIC_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css?v=${VERSION}`,
  `${BASE}app.js?v=${VERSION}`,
  `${BASE}manifest.json`,
];

// — Установка нового SW
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(STATIC_ASSETS.map(u => new Request(u, { cache: 'reload' })));
  })());
});

// — Активация: чистим старые кэши + захватываем клиентов
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

// — Возможность принудительно активировать новую версию из страницы
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// — Стратегии кеширования
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isSameOrigin = url.origin === self.origin;
  const acceptsHTML = req.headers.get('accept')?.includes('text/html');

  // HTML / переходы — network-first
  if (req.mode === 'navigate' || (req.method === 'GET' && acceptsHTML)) {
    event.respondWith(handleHTMLRequest(event));
    return;
  }

  // Наш статик и data/*.json — stale-while-revalidate
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
  // Остальное — пропускаем
});

async function handleHTMLRequest(event) {
  const cache = await caches.open(CACHE_NAME);
  const preloaded = await event.preloadResponse; // может дать свежую сеть
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
