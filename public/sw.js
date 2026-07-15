/* Service worker Timeline Project.
   Strategi anti-basi: navigasi & data selalu network-first; hanya aset ber-hash yang di-cache. */
const CACHE = 'timeline-cache-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // biarkan cross-origin (mis. API AI) apa adanya
  if (url.pathname.startsWith('/api/')) return;      // API: selalu jaringan, tak pernah di-cache

  // Aset Next ber-hash / gambar / ikon: cache-first (immutable, aman dari basi).
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/img/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try { const res = await fetch(req); const c = await caches.open(CACHE); c.put(req, res.clone()); return res; }
      catch { return cached || Response.error(); }
    })());
    return;
  }

  // Navigasi & lainnya: network-first, fallback ke cache saat offline.
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      const c = await caches.open(CACHE); c.put(req, res.clone());
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || (await caches.match('/')) || Response.error();
    }
  })());
});
