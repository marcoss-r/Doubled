/**
 * Doubled — registro del service worker.
 *
 * Se llama desde cada página (hub y juegos), no sólo desde el hub: cualquier
 * página puede ser la primera que visite un usuario (enlace directo a un
 * juego, PWA reabierta en su última pantalla), y sin registro no hay soporte
 * offline hasta que por casualidad pase por el hub. El registro es
 * idempotente y de scope raíz (lo fija la ubicación de service-worker.js, no
 * la de la página que llama), así que repetirlo no tiene coste real: el
 * navegador reutiliza el registro existente.
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): global, sin módulos.
 */
(function (global) {
  'use strict';

  function registerServiceWorker(swUrl) {
    if (!('serviceWorker' in global.navigator)) return;

    global.navigator.serviceWorker.register(swUrl).catch(function (error) {
      console.warn('[doubled] no se pudo registrar el service worker:', error);
    });
  }

  global.DoubledRegisterSW = registerServiceWorker;
})(window);
