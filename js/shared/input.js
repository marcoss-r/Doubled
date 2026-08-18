/**
 * Doubled — asignación de punteros por mitad de pantalla.
 *
 * Pensado para juegos en tiempo real con dos jugadores encarados en los
 * extremos verticales de la pantalla (air hockey, pong): asigna hasta dos
 * punteros simultáneos, uno por mitad ('top' o 'bottom'), y mantiene esa
 * asignación aunque el dedo cruce la línea central. Un tercer puntero, o un
 * segundo dedo de un jugador que ya tiene uno activo, se ignora sin más:
 * como sólo hay dos mitades, esa regla sale gratis de "una asignación por
 * mitad".
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): global, sin módulos.
 */
(function (global) {
  'use strict';

  function createHalfPointerTracker(element, callbacks) {
    var assignments = {}; // pointerId -> 'top' | 'bottom'

    function normalize(event) {
      var rect = element.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height
      };
    }

    function halfFor(y) {
      return y < 0.5 ? 'top' : 'bottom';
    }

    function halfTaken(half) {
      for (var id in assignments) {
        if (assignments.hasOwnProperty(id) && assignments[id] === half) return true;
      }
      return false;
    }

    function onPointerDown(event) {
      var pos = normalize(event);
      var half = halfFor(pos.y);
      if (halfTaken(half)) return;

      assignments[event.pointerId] = half;
      element.setPointerCapture(event.pointerId);
      if (callbacks.onDown) callbacks.onDown(half, pos.x, pos.y);
    }

    function onPointerMove(event) {
      var half = assignments[event.pointerId];
      if (!half) return;
      var pos = normalize(event);
      if (callbacks.onMove) callbacks.onMove(half, pos.x, pos.y);
    }

    function release(event) {
      var half = assignments[event.pointerId];
      if (!half) return;
      delete assignments[event.pointerId];
      if (callbacks.onUp) callbacks.onUp(half);
    }

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);

    return {
      destroy: function () {
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointermove', onPointerMove);
        element.removeEventListener('pointerup', release);
        element.removeEventListener('pointercancel', release);
      }
    };
  }

  global.DoubledInput = { createHalfPointerTracker: createHalfPointerTracker };
})(window);
