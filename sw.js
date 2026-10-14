// H&N Packaging - service worker (offline support)
const VERSION = 'hn-v14';
const PRECACHE = [
  "./",
  "index.html",
  "en.html",
  "ar.html",
  "app.js",
  "manifest.webmanifest",
  "assets/img/complexage.jpg",
  "assets/img/etiquettes.jpg",
  "assets/img/films-complexes.jpg",
  "assets/img/films-imprimes.jpg",
  "assets/img/gamme.jpg",
  "assets/img/impression.jpg",
  "assets/img/logo.png",
  "assets/img/refente.jpg",
  "assets/img/sachets-machine.jpg",
  "assets/img/sachets.jpg",
  "assets/img/sleeves-pvc.jpg",
  "assets/icons/apple-touch-icon.png",
  "assets/icons/favicon-48.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png",
  "assets/js/hn3d.js",
  "assets/js/pdf.min.js",
  "assets/js/pdf.worker.min.js"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.mp4')) return;   // videos stream straight from the network (range requests)
  // pages: network first, fall back to the cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  // Google Fonts and our own files: cache first, then refresh in the background
  if (url.origin === location.origin || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
