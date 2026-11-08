// Offline cache: the app shell is stored on first visit, so the app opens with no connection.
const VERSION = 'allowance-v55';
const LIB = 'allowance-lib'; // the pinned AI library from the CDN; it outlives app updates
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/app.js', 'js/engine.js', 'js/nlu.js', 'js/llm.js', 'js/state.js', 'js/ui.js', 'js/icons.js', 'js/charts.js', 'js/editors.js', 'js/parts.js', 'js/demo.js',
  'js/pages/home.js', 'js/pages/history.js', 'js/pages/analytics.js', 'js/pages/plan.js', 'js/pages/goals.js', 'js/pages/wallet.js', 'js/pages/ai.js', 'js/pages/settings.js', 'js/pages/swaps.js',
  'img/tiger_head.webp', 'img/tiger_mascot.webp', 'img/wallet_card_silver.webp', 'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
// Only delete OLD app caches. The on-device AI keeps its downloaded model in this same storage (caches named "webllm…");
// deleting those on every update would make people download about 1 GB again.
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('allowance-v') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// Network first so edits show up right away; the cache is the fallback when offline.
// cache: 'no-cache' makes the browser check with the server every time instead of reusing its own copy for minutes.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) {
    // Other sites are left alone (the model files are huge and WebLLM stores them itself), except the version-pinned AI library, kept so it loads offline.
    if (url.hostname === 'cdn.jsdelivr.net' && /@\d+\.\d+\.\d+/.test(url.pathname)) {
      e.respondWith(caches.open(LIB).then(async (c) => { const hit = await c.match(e.request); if (hit) return hit; const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; }));
    }
    return;
  }
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
