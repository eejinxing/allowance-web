// Offline cache: the app shell is stored on first visit, so the app opens with no connection.
const VERSION = 'allowance-v53';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/engine.js', 'js/state.js', 'js/ui.js', 'js/icons.js', 'js/charts.js', 'js/editors.js', 'js/parts.js', 'js/demo.js',
  'js/pages/home.js', 'js/pages/history.js', 'js/pages/analytics.js', 'js/pages/plan.js', 'js/pages/goals.js', 'js/pages/wallet.js', 'js/pages/ai.js', 'js/pages/settings.js', 'js/pages/swaps.js',
  'img/tiger_head.webp', 'img/tiger_mascot.webp', 'img/wallet_card_silver.webp', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first so edits show up right away; the cache is the fallback when offline.
// cache: 'no-cache' makes the browser check with the server every time instead of reusing its own copy for minutes.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
