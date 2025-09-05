// service-worker.js — PWA Loot Generator for D&D 5e
// Обновляй версию при каждом деплое:
const VERSION = 'v2025-09-05-1';
const CACHE_NAME = `lootgen-${VERSION}`;

// Если у тебя корень репо = корень сайта на Pages, оставь как есть.
// Если сайт раздаётся из подкаталога, например /pwa-loot/, пропиши базовый путь:
const BASE = self.registration.scope.replace(self.origin, ''); // напр. '/' или '/pwa-loot/'

// Критичные ассеты, которые хотим иметь офлайн сразу.
// Если переименуешь файлы/папки, обнови пути.
const STATIC_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}manifest.json`,
  // Не перечисляю data/*.json здесь — их кэшируем и обновляем "на лету" (runtime)
];

// ————— Ускоряем установку нового SW —————
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Важно: берём ассеты с обходом HTTP-кэша
      await cache.addAll(STATIC_ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    })()
  );
});

// ————— Чистим старые кэши и захватываем клиентов —————
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : undefined)));
      await self.clients.claim();
    })()
  );
});

// ————— Навигационный preload (ускоряет network-first для HTML) —————
self.addEventListener('activate', (event) => {
  if ('navigationPreload' in self.registration) {
    event.waitUntil(self.registration.navigationPreload.enable());
  }
});

// ————— Управление обновлением из страницы —————
// В приложении можно вызвать: navigator.serviceWorker.controller.postMessage({type:'SKIP_WAITING'})
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ————— Стратегии кеширования —————
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Только для нашего же домена
  const isSameOrigin = url.origin === self.origin;

  // 1) HTML/навигация — network-first (чтобы сразу схватывать новые билды)
  const acceptsHTML = req.headers.get('accept')?.includes('text/html');
  if (req.mode === 'navigate' || (req.method === 'GET' && acceptsHTML)) {
    event.respondWith(handleHTMLRequest(event));
    return;
  }

  // 2) Для нашего статика (css/js/img/json/woff и т.п.) — stale-while-revalidate
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

  // Остальное — без вмешательства
});

// ————— Реализации стратегий —————
async function handleHTMLRequest(event) {
  const cache = await caches.open(CACHE_NAME);

  // navigation preload может уже нести свежий ответ
  const preloaded = await event.preloadResponse;

  try {
    const net = await fetch(event.request, { cache: 'no-store' });
    // Кладём HTML копию в кэш
    cache.put(event.request, net.clone());
    return net;
  } catch (e) {
    // Если сеть недоступна — отдаём кэш, если есть
    const cached = await cache.match(event.request);
    if (cached) return cached;
    // Фолбек: пробуем index.html
    const fallback = await cache.match(`${BASE}index.html`);
    return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req).then((res) => {
    // Не кешируем ошибки
    if (!res || res.status !== 200 || res.type === 'opaque') return res;
    cache.put(req, res.clone());
    return res;
  }).catch(() => undefined);

  // Отдаём быстрое (кэш), а сеть — параллельно обновит
  return cached || networkPromise || fetch(req);
}
