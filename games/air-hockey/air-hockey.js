/**
 * Air Hockey — Doubled.
 * Fase 1, hito 0.6: shell del juego. Mesa estática, sin física ni entrada
 * todavía (llegan en los hitos 0.7 y 0.8).
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var rotateWarning = document.getElementById('rotate-warning');

  var MAX_DPR = 3;
  var width = 0;
  var height = 0;
  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-air-hockey').trim() ||
    '#22e5ff';

  function resize() {
    var rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    render();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, width, height);

    // Línea central.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Círculo central.
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    // Bocas de portería, arriba y abajo.
    var goalHalfWidth = width * 0.17;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(width / 2 - goalHalfWidth, 2);
    ctx.lineTo(width / 2 + goalHalfWidth, 2);
    ctx.moveTo(width / 2 - goalHalfWidth, height - 2);
    ctx.lineTo(width / 2 + goalHalfWidth, height - 2);
    ctx.stroke();
  }

  function checkOrientation() {
    rotateWarning.hidden = window.innerWidth <= window.innerHeight;
  }

  window.addEventListener('resize', function () {
    checkOrientation();
    resize();
  });
  window.addEventListener('orientationchange', function () {
    checkOrientation();
    resize();
  });

  checkOrientation();
  resize();
})();
