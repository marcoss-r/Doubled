/**
 * Doubled — lógica del hub y registro del service worker.
 *
 * Depende de js/shared/version.js, que debe cargarse antes (define APP_VERSION).
 */
(function () {
  'use strict';

  /**
   * Registro de juegos. Cada fase de desarrollo activa el suyo poniendo
   * `ready: true`; el hub se encarga del resto (quita el badge "Próximamente"
   * y hace la tarjeta pulsable).
   */
  var GAMES = [
    { slug: 'air-hockey', path: './games/air-hockey/', ready: true },
    { slug: 'beer-pong', path: './games/beer-pong/', ready: true },
    { slug: 'pong', path: './games/pong/', ready: false },
    { slug: 'battleship', path: './games/battleship/', ready: false }
  ];

  var noticeEl = document.getElementById('hub-notice');

  /* ---------------------------------------------------------------- versión */

  function renderVersion() {
    var el = document.getElementById('app-version');
    if (el) el.textContent = APP_VERSION;
  }

  /* ------------------------------------------------------------------ hub */

  function renderGameCards() {
    GAMES.forEach(function (game) {
      var card = document.querySelector('.game-card[data-game="' + game.slug + '"]');
      if (!card || !game.ready) return;

      card.classList.remove('game-card--soon');
      card.classList.add('game-card--ready');

      var badge = card.querySelector('.game-card__badge');
      if (badge) badge.remove();

      // Enlace que cubre toda la tarjeta: navegable con teclado y accesible,
      // sin necesidad de reestructurar el marcado.
      var name = card.querySelector('.game-card__name');
      var link = document.createElement('a');
      link.className = 'game-card__link';
      link.href = game.path;
      link.setAttribute('aria-label', 'Jugar a ' + (name ? name.textContent : game.slug));
      card.appendChild(link);
    });
  }

  /* -------------------------------------------------------------- conexión */

  function showNotice(message) {
    if (!noticeEl) return;
    noticeEl.textContent = message;
    noticeEl.hidden = false;
  }

  function hideNotice() {
    if (!noticeEl) return;
    noticeEl.hidden = true;
    noticeEl.textContent = '';
  }

  function syncConnectionNotice() {
    if (navigator.onLine) {
      hideNotice();
    } else {
      showNotice('Sin conexión. Los juegos ya descargados siguen funcionando.');
    }
  }

  /* ------------------------------------------------------------------ init */

  renderVersion();
  renderGameCards();
  syncConnectionNotice();
  DoubledRegisterSW('./service-worker.js');

  window.addEventListener('online', syncConnectionNotice);
  window.addEventListener('offline', syncConnectionNotice);
})();
