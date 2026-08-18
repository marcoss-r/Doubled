/**
 * Fuente única de verdad de la versión de Doubled.
 *
 * Este fichero se carga en dos contextos distintos:
 *   - En las páginas (hub y juegos), como <script> normal antes de app.js.
 *   - En el service worker, vía importScripts('./js/shared/version.js').
 *
 * Por eso no puede tocar el DOM ni usar módulos ES: sólo define constantes
 * globales válidas tanto en `window` como en `self` (WorkerGlobalScope).
 *
 * Al bumpear APP_VERSION cambian los bytes de este fichero; como el navegador
 * compara también los scripts importados por el service worker, el bump basta
 * para que los clientes ya instalados detecten la actualización.
 *
 * Ver docs/CONVENTIONS.md → "Checklist de versionado".
 */
var APP_VERSION = '0.5';

/** Nombre del caché del service worker, derivado de la versión. */
var CACHE_NAME = 'doubled-v' + APP_VERSION;

if (typeof self !== 'undefined') {
  self.APP_VERSION = APP_VERSION;
  self.CACHE_NAME = CACHE_NAME;
}
