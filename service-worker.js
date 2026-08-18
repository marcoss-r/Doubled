/**
 * Doubled — service worker.
 *
 * Estrategia: cache-first sobre un caché con nombre versionado.
 * El nombre (CACHE_NAME = 'doubled-v<APP_VERSION>') viene de
 * js/shared/version.js, que es la única fuente de verdad de la versión.
 *
 * REGLA DE ORO: cualquier commit que cambie un asset cacheado (HTML/CSS/JS/
 * iconos) debe bumpear APP_VERSION. Al cambiar los bytes de version.js —que el
 * navegador compara junto a los de este fichero— los clientes ya instalados
 * detectan la nueva versión, la instalan y borran el caché anterior.
 * Ver docs/CONVENTIONS.md.
 */

importScripts('./js/shared/version.js');

/**
 * Assets agrupados por bloque. El shell se precachea en `install`; cada juego
 * añade su propio bloque en su fase de desarrollo.
 */
var ASSET_BLOCKS = {
  shell: [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/base.css',
    './css/hub.css',
    './js/app.js',
    './js/shared/version.js',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/icons/maskable-192.png',
    './assets/icons/maskable-512.png',
    './assets/icons/apple-touch-icon-180.png'
  ],
  'air-hockey': [
    './games/air-hockey/index.html',
    './games/air-hockey/air-hockey.css',
    './games/air-hockey/air-hockey.js',
    './js/shared/loop.js',
    './js/shared/input.js',
    './js/shared/storage.js',
    './js/shared/audio.js'
  ]
  // 'beer-pong':  [...]                          ← Fase 2
  // 'pong':       [...]                          ← Fase 3
  // 'battleship': [...]                          ← Fase 4
};

function allAssets() {
  return Object.keys(ASSET_BLOCKS).reduce(function (list, block) {
    return list.concat(ASSET_BLOCKS[block]);
  }, []);
}

/**
 * Precachea uno a uno en vez de con `cache.addAll`, para que un único asset
 * caído (404, red inestable) no aborte la instalación completa.
 */
function precache(cache, urls) {
  return Promise.all(
    urls.map(function (url) {
      return cache.add(new Request(url, { cache: 'reload' })).catch(function (error) {
        console.warn('[doubled][sw] no se pudo precachear', url, error);
      });
    })
  );
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return precache(cache, allAssets());
      })
      .then(function () {
        // La nueva versión toma el relevo sin esperar a cerrar pestañas.
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              // Sólo se limpian cachés propios de Doubled de versiones anteriores.
              return name.indexOf('doubled-v') === 0 && name !== CACHE_NAME;
            })
            .map(function (name) {
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;

      return fetch(request)
        .then(function (response) {
          // Sólo se guardan respuestas propias y completas.
          if (response && response.ok && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          // Sin red y sin caché: para una navegación, se sirve el hub.
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return Response.error();
        });
    })
  );
});
