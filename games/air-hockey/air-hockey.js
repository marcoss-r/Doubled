/**
 * Air Hockey — Doubled.
 * Fase 1, hito 0.7: física base. Un disco rebota en las bandas y en un
 * único mallet, que sigue el puntero por toda la mesa (todavía sin dividir
 * en mitades: eso llega en el hito 0.8 con la entrada multitáctil real).
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var rotateWarning = document.getElementById('rotate-warning');

  var MAX_DPR = 3;
  var STEP = 1 / 120;
  var FRICTION = 0.995;
  var RESTITUTION_WALL = 0.92;

  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-air-hockey').trim() ||
    '#22e5ff';

  var width = 0;
  var height = 0;
  var malletRadius = 0;
  var puckRadius = 0;
  var goalHalfWidth = 0;
  var maxPuckSpeed = 0;
  var orientationBlocked = false;

  var puck = { x: 0, y: 0, vx: 0, vy: 0 };
  var mallet = { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, target: null };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    var oldWidth = width;
    var oldHeight = height;

    width = rect.width;
    height = rect.height;

    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    malletRadius = Math.min(width, height) * 0.085;
    puckRadius = Math.min(width, height) * 0.045;
    goalHalfWidth = width * 0.17;
    maxPuckSpeed = Math.min(width, height) * 1.6;

    if (oldWidth && oldHeight) {
      var sx = width / oldWidth;
      var sy = height / oldHeight;
      puck.x *= sx;
      puck.y *= sy;
      mallet.x *= sx;
      mallet.y *= sy;
      mallet.prevX = mallet.x;
      mallet.prevY = mallet.y;
    } else {
      puck.x = width / 2;
      puck.y = height * 0.3;
      mallet.x = width / 2;
      mallet.y = height * 0.75;
      mallet.prevX = mallet.x;
      mallet.prevY = mallet.y;
    }
  }

  /* ------------------------------------------------------------- física */

  function update(dt) {
    if (orientationBlocked) return;

    mallet.prevX = mallet.x;
    mallet.prevY = mallet.y;
    if (mallet.target) {
      mallet.x = clamp(mallet.target.x, malletRadius, width - malletRadius);
      mallet.y = clamp(mallet.target.y, malletRadius, height - malletRadius);
    }
    mallet.vx = (mallet.x - mallet.prevX) / dt;
    mallet.vy = (mallet.y - mallet.prevY) / dt;

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;
    puck.vx *= FRICTION;
    puck.vy *= FRICTION;

    var speed = Math.hypot(puck.vx, puck.vy);
    if (speed > maxPuckSpeed) {
      var scale = maxPuckSpeed / speed;
      puck.vx *= scale;
      puck.vy *= scale;
    }

    handleWalls();
    handleMalletCollision();
  }

  function handleWalls() {
    if (puck.x < puckRadius) {
      puck.x = puckRadius;
      puck.vx = -puck.vx * RESTITUTION_WALL;
    } else if (puck.x > width - puckRadius) {
      puck.x = width - puckRadius;
      puck.vx = -puck.vx * RESTITUTION_WALL;
    }

    if (puck.y < puckRadius) {
      puck.y = puckRadius;
      puck.vy = -puck.vy * RESTITUTION_WALL;
    } else if (puck.y > height - puckRadius) {
      puck.y = height - puckRadius;
      puck.vy = -puck.vy * RESTITUTION_WALL;
    }
  }

  function handleMalletCollision() {
    var dx = puck.x - mallet.x;
    var dy = puck.y - mallet.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var minDist = puckRadius + malletRadius;
    if (dist >= minDist) return;

    var nx = dx / dist;
    var ny = dy / dist;
    puck.x = mallet.x + nx * minDist;
    puck.y = mallet.y + ny * minDist;

    var relVx = puck.vx - mallet.vx;
    var relVy = puck.vy - mallet.vy;
    var velAlongNormal = relVx * nx + relVy * ny;

    if (velAlongNormal < 0) {
      var j = -2 * velAlongNormal;
      puck.vx += j * nx;
      puck.vy += j * ny;
    }
    puck.vx += mallet.vx * 0.35;
    puck.vy += mallet.vy * 0.35;
  }

  /* -------------------------------------------------------------- render */

  function render() {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(width / 2 - goalHalfWidth, 2);
    ctx.lineTo(width / 2 + goalHalfWidth, 2);
    ctx.moveTo(width / 2 - goalHalfWidth, height - 2);
    ctx.lineTo(width / 2 + goalHalfWidth, height - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mallet.x, mallet.y, malletRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 229, 255, 0.85)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puckRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f7ff';
    ctx.fill();
  }

  /* --------------------------------------------------------------- input */

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener('pointerdown', function (event) {
    canvas.setPointerCapture(event.pointerId);
    mallet.target = pointFromEvent(event);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!mallet.target) return;
    mallet.target = pointFromEvent(event);
  });
  canvas.addEventListener('pointerup', function () {
    mallet.target = null;
  });
  canvas.addEventListener('pointercancel', function () {
    mallet.target = null;
  });

  /* -------------------------------------------------------- orientación */

  function checkOrientation() {
    orientationBlocked = window.innerWidth > window.innerHeight;
    rotateWarning.hidden = !orientationBlocked;
  }

  window.addEventListener('resize', function () {
    checkOrientation();
    resize();
  });
  window.addEventListener('orientationchange', function () {
    checkOrientation();
    resize();
  });

  /* ------------------------------------------------------------------ init */

  checkOrientation();
  resize();

  var loop = DoubledLoop.createFixedLoop({ step: STEP, update: update, render: render });
  loop.start();
})();
