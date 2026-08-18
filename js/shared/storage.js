/**
 * Doubled — helpers de localStorage.
 *
 * Envuelve el acceso en try/catch porque localStorage puede lanzar en modo
 * privado de Safari o con las cookies bloqueadas; en ese caso se degrada a
 * los valores por defecto en vez de romper el juego.
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): global, sin módulos.
 */
(function (global) {
  'use strict';

  function getBoolean(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw === null ? fallback : raw === '1';
    } catch (e) {
      return fallback;
    }
  }

  function setBoolean(key, value) {
    try {
      global.localStorage.setItem(key, value ? '1' : '0');
    } catch (e) {
      // Sin persistencia disponible: la preferencia sólo dura la sesión.
    }
  }

  global.DoubledStorage = { getBoolean: getBoolean, setBoolean: setBoolean };
})(window);
