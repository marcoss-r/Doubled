/**
 * Doubled — pantalla de traspaso del móvil ("Pasa el móvil a X").
 *
 * Pantalla opaca a pantalla completa entre turnos: nadie ve el estado del
 * juego mientras se pasa el móvil, y evita jugadas accidentales durante el
 * traspaso. Inyecta su propio DOM (no requiere marcado previo en la
 * página) para poder reutilizarse en cualquier juego por turnos (Beer
 * Pong, Hundir la flota).
 *
 * ES5 + IIFE (ver docs/CONVENTIONS.md §5): global, sin módulos.
 */
(function (global) {
  'use strict';

  function createHandover() {
    var el = document.createElement('div');
    el.className = 'handover';
    el.hidden = true;
    el.innerHTML =
      '<div class="handover__content">' +
      '<p class="handover__title"></p>' +
      '<p class="handover__subtitle">Toca cuando estés listo</p>' +
      '<button class="handover__btn" type="button">Estoy listo</button>' +
      '</div>';
    document.body.appendChild(el);

    var titleEl = el.querySelector('.handover__title');
    var btn = el.querySelector('.handover__btn');
    var onReadyCallback = null;

    btn.addEventListener('click', function () {
      var callback = onReadyCallback;
      hide();
      if (callback) callback();
    });

    function show(title, onReady) {
      titleEl.textContent = title;
      onReadyCallback = onReady || null;
      el.hidden = false;
    }

    function hide() {
      el.hidden = true;
    }

    return { show: show, hide: hide };
  }

  global.DoubledHandover = { create: createHandover };
})(window);
