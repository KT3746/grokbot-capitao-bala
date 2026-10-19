// CAPITÃO BALA — service worker (offline).
// O cache é versionado pelo mesmo v= do cache-bust (sw.js?v=...). Cada versão nova registra um
// sw.js com URL nova, instala o seu cache, assume na hora e apaga os caches antigos.
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'cb-' + V;
const CORE = [
  './', './index.html', './manifest.webmanifest', './favicon.svg',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  `./css/style.css?v=${V}`, `./js/main.js?v=${V}`, `./js/audio.js?v=${V}`,
  './js/vendor/three.module.js',
  './js/vendor/addons/postprocessing/EffectComposer.js', './js/vendor/addons/postprocessing/MaskPass.js',
  './js/vendor/addons/postprocessing/OutputPass.js', './js/vendor/addons/postprocessing/Pass.js',
  './js/vendor/addons/postprocessing/RenderPass.js', './js/vendor/addons/postprocessing/ShaderPass.js',
  './js/vendor/addons/postprocessing/UnrealBloomPass.js', './js/vendor/addons/shaders/CopyShader.js',
  './js/vendor/addons/shaders/LuminosityHighPassShader.js', './js/vendor/addons/shaders/OutputShader.js',
  './js/vendor/addons/utils/BufferGeometryUtils.js',
];
self.addEventListener('install', (e) => {
  // cache: 'reload' ignora o cache HTTP do navegador, para não guardar arquivo velho na versão nova
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('cb-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // página: rede primeiro (sempre pega a versão nova quando há internet), cache só offline
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    e.respondWith(fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); } return r; })
      .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))));
    return;
  }
  if (url.pathname.endsWith('/sw.js')) return;
  // arquivos versionados (?v=) e da biblioteca: cache primeiro, rede como reserva
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && (url.search.includes('v=') || url.pathname.includes('/vendor/') || url.pathname.includes('/icons/'))) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
