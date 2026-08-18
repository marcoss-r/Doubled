/**
 * Doubled — bucle de juego con paso de tiempo fijo.
 *
 * update(dt) se llama con un dt constante (segundos) tantas veces como haga
 * falta para consumir el tiempo real transcurrido entre frames; render() se
 * llama una vez por frame, después de agotar los pasos pendientes.
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): se expone como global, sin
 * módulos, para poder cargarse con un <script> normal en cualquier juego.
 */
(function (global) {
  'use strict';

  function createFixedLoop(options) {
    var step = options.step;
    var update = options.update;
    var render = options.render;
    var maxStepsPerFrame = options.maxStepsPerFrame || 6;

    var rafId = null;
    var lastTime = null;
    var accumulator = 0;

    function frame(time) {
      rafId = global.requestAnimationFrame(frame);

      if (lastTime === null) {
        lastTime = time;
        return;
      }

      var delta = (time - lastTime) / 1000;
      lastTime = time;
      // Tope de 250 ms: evita una ráfaga de pasos de golpe tras volver de
      // segundo plano (pestaña oculta, llamada entrante...).
      if (delta > 0.25) delta = 0.25;

      accumulator += delta;

      var steps = 0;
      while (accumulator >= step && steps < maxStepsPerFrame) {
        update(step);
        accumulator -= step;
        steps++;
      }

      render();
    }

    return {
      start: function () {
        if (rafId !== null) return;
        lastTime = null;
        accumulator = 0;
        rafId = global.requestAnimationFrame(frame);
      },
      stop: function () {
        if (rafId === null) return;
        global.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  global.DoubledLoop = { createFixedLoop: createFixedLoop };
})(window);
