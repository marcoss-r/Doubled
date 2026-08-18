/**
 * Air Hockey — Doubled.
 * Fase 1, hito 0.8: entrada multitáctil real. Dos malletes, uno por
 * jugador, cada uno limitado a su mitad de la mesa mediante
 * DoubledInput.createHalfPointerTracker.
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

  // Jugador A abajo, jugador B arriba (B se lee al revés, ver hito 0.9).
  var mallets = {
    A: { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, active: false },
    B: { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, active: false }
  };
  var pointerTargets = { A: null, B: null };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resetMallet(id) {
    var m = mallets[id];
    m.x = width / 2;
    m.y = id === 'A' ? height * 0.82 : height * 0.18;
    m.prevX = m.x;
    m.prevY = m.y;
    m.vx = 0;
    m.vy = 0;
  }

  function clampMallet(id) {
    var m = mallets[id];
    m.x = clamp(m.x, malletRadius, width - malletRadius);
    if (id === 'A') {
      m.y = clamp(m.y, height / 2 + malletRadius, height - malletRadius);
    } else {
      m.y = clamp(m.y, malletRadius, height / 2 - malletRadius);
    }
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
      ['A', 'B'].forEach(function (id) {
        mallets[id].x *= sx;
        mallets[id].y *= sy;
        mallets[id].prevX = mallets[id].x;
        mallets[id].prevY = mallets[id].y;
        clampMallet(id);
      });
    } else {
      puck.x = width / 2;
      puck.y = height / 2;
      resetMallet('A');
      resetMallet('B');
    }
  }

  /* ------------------------------------------------------------- física */

  function update(dt) {
    if (orientationBlocked) return;

    updateMalletVelocity('A', dt);
    updateMalletVelocity('B', dt);

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
    handleMalletCollision('A');
    handleMalletCollision('B');
  }

  function updateMalletVelocity(id, dt) {
    var m = mallets[id];
    var target = pointerTargets[id];
    m.prevX = m.x;
    m.prevY = m.y;
    if (target) {
      m.x = target.x;
      m.y = target.y;
      clampMallet(id);
    }
    m.vx = (m.x - m.prevX) / dt;
    m.vy = (m.y - m.prevY) / dt;
  }

  function handleWalls() {
    if (puck.x < puckRadius) {
      puck.x = puckRadius;
      puck.vx = -puck.vx * RESTITUTION_WALL;
    } else if (puck.x > width - puckRadius) {
      puck.x = width - puckRadius;
      puck.vx = -puck.vx * RESTITUTION_WALL;
    }

    // Las porterías (goles) llegan en el hito 0.9; de momento arriba y abajo
    // también rebotan, como una banda más.
    if (puck.y < puckRadius) {
      puck.y = puckRadius;
      puck.vy = -puck.vy * RESTITUTION_WALL;
    } else if (puck.y > height - puckRadius) {
      puck.y = height - puckRadius;
      puck.vy = -puck.vy * RESTITUTION_WALL;
    }
  }

  function handleMalletCollision(id) {
    var m = mallets[id];
    var dx = puck.x - m.x;
    var dy = puck.y - m.y;
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    var minDist = puckRadius + malletRadius;
    if (dist >= minDist) return;

    var nx = dx / dist;
    var ny = dy / dist;
    puck.x = m.x + nx * minDist;
    puck.y = m.y + ny * minDist;

    var relVx = puck.vx - m.vx;
    var relVy = puck.vy - m.vy;
    var velAlongNormal = relVx * nx + relVy * ny;

    if (velAlongNormal < 0) {
      var j = -2 * velAlongNormal;
      puck.vx += j * nx;
      puck.vy += j * ny;
    }
    puck.vx += m.vx * 0.35;
    puck.vy += m.vy * 0.35;
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

    drawMallet('B', 'rgba(255, 62, 165, 0.85)');
    drawMallet('A', 'rgba(34, 229, 255, 0.85)');

    ctx.beginPath();
    ctx.arc(puck.x, puck.y, puckRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f7ff';
    ctx.fill();
  }

  function drawMallet(id, color) {
    var m = mallets[id];
    ctx.beginPath();
    ctx.arc(m.x, m.y, malletRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = m.active ? 1 : 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.stroke();
  }

  /* --------------------------------------------------------------- input */

  DoubledInput.createHalfPointerTracker(canvas, {
    onDown: function (half, nx, ny) {
      var id = half === 'top' ? 'B' : 'A';
      pointerTargets[id] = { x: nx * width, y: ny * height };
      mallets[id].active = true;
    },
    onMove: function (half, nx, ny) {
      var id = half === 'top' ? 'B' : 'A';
      if (!pointerTargets[id]) return;
      pointerTargets[id].x = nx * width;
      pointerTargets[id].y = ny * height;
    },
    onUp: function (half) {
      var id = half === 'top' ? 'B' : 'A';
      pointerTargets[id] = null;
      mallets[id].active = false;
    }
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
