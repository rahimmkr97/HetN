/* H&N Packaging — service worker
   Change VERSION each time you update the site, so phones pick up the new files. */
const VERSION = 'v1';
const CACHE = 'hn-packaging-' + VERSION;
const FONT_CACHE = 'hn-packaging-fonts';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './support.js',
  './vendor/react.js',
  './vendor/react-dom.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/04b3600dbe48f64c0233c13817262929.jpg',
  './assets/20ba58ad44e3893cc33a2c7e7320977a.jpg',
  './assets/29e50fe909078f192a761605468d6171.jpg',
  './assets/44448e66f96159d384c5b1ff86c36dad.jpg',
  './assets/6f62d7f282afc02e7723fa9844b663af.jpg',
  './assets/9d45d3ffcb584278497339a52d3fca26.jpg',
  './assets/b4a1e87e64587d78ba08e4312dd730da.png',
  './assets/b53eb79fd2d52b019609017d37765363.jpg',
  './assets/bdd2185582c275f76a5ebd9322d4f1d8.jpg',
  './assets/c35a1ec27d3f81c2b0d60e4af94a0718.jpg',
  './assets/e47a9550d4c9f21cbe784675ac90db92.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: serve from cache, refresh in the background
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const net = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages: network first (always fresh when online), cache when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); }
          return res.ok ? res : caches.match('./index.html');
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else: cache first
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
