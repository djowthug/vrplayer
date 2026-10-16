// Service worker: guarda o app em cache para abrir offline.
// Aumente a versão sempre que publicar mudanças.
const CACHE = 'vrplayer-v16';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/cloud.js',
  'js/renderer.js',
  'js/projections.js',
  'js/environments.js',
  'js/controls.js',
  'js/gamepad.js',
  'js/cursor.js',
  'js/detect.js',
  'js/utils/format.js',
  'js/ui/codecs-modal.js',
  'js/ui/batch-modal.js',
  'js/vendor/three.module.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (para receber atualizações), cache como reserva offline.
// Não faz cache de endpoints de API dinâmica nem de streams de vídeo pesados.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Bypass imediato para qualquer requisição com header Range (evita travar Safari iOS)
  if (req.headers && req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const pathname = url.pathname.toLowerCase();
  // Bypass total para rotas de mídia e streams de mídia
  if (
    pathname.startsWith('/video/') ||
    pathname.startsWith('/stream/') ||
    pathname.startsWith('/api/stream') ||
    pathname.startsWith('/hls/') ||
    pathname.startsWith('/api/') ||
    pathname.endsWith('.m3u8') ||
    pathname.endsWith('.ts') ||
    pathname.endsWith('.mp4') ||
    pathname.endsWith('.mkv')
  ) {
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
