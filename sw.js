// Offline support. Online: the newest files. Offline, or when the network takes over 3 s: the last ones seen.
// No version to bump; a new file only needs adding to FILES (npm test checks the list).
const CACHE = 'flight-plan';
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'plan.js',
  'manifest.webmanifest',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'plex-mono-500.woff2',
  'plex-mono-600.woff2',
  'plex-sans-500.woff2',
  'plex-sans-600.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const network = fetch(request).then(async response => {
    if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  event.respondWith(newestOrCached(request, network));
});

async function newestOrCached(request, network) {
  const cached = () => caches.match(request, { ignoreSearch: true });
  const slow = new Promise(resolve => setTimeout(resolve, 3000));
  try {
    return (await Promise.race([network, slow])) ?? (await cached()) ?? (await network);
  } catch {
    return (await cached()) ?? Response.error();
  }
}
