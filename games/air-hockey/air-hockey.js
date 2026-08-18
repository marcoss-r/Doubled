/**
 * Air Hockey — Doubled.
 * Fase 1, hito 0.9: goles, marcador rotado, saques con cuenta atrás y
 * recolocación del disco si se queda parado. Pausa, gameover, revancha,
 * sonido y vibración llegan en el hito 0.10.
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
  var SERVE_COUNTDOWN = 2;
  var STALL_LIMIT = 5;
  var STALL_SPEED_FACTOR = 0.02;

  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-air-hockey').trim() ||
    '#22e5ff';
  var fontFamily =
    getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() ||
    'system-ui, sans-serif';

  var width = 0;
  var height = 0;
  var malletRadius = 0;
  var puckRadius = 0;
  var goalHalfWidth = 0;
  var maxPuckSpeed = 0;
  var orientationBlocked = false;

  var puck = { x: 0, y: 0, vx: 0, vy: 0 };
  var mallets = {
    A: { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, active: false },
    B: { x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, active: false }
  };
  var pointerTargets = { A: null, B: null };

  // 'countdown' | 'playing'. El resto de fases (ready/paused/gameover)
  // llegan en el hito 0.10.
  var phase = 'countdown';
  var score = { A: 0, B: 0 };
  var serveTo = Math.random() < 0.5 ? 'A' : 'B';
  var countdown = SERVE_COUNTDOWN;
  var stallTimer = 0;

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

  function centerPuck() {
    puck.x = width / 2;
    puck.y = height / 2;
    puck.vx = 0;
    puck.vy = 0;
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
      centerPuck();
      resetMallet('A');
      resetMallet('B');
    }
  }

  /* ------------------------------------------------------------- física */

  function update(dt) {
    if (orientationBlocked) return;

    updateMalletVelocity('A', dt);
    updateMalletVelocity('B', dt);

    if (phase === 'countdown') {
      countdown -= dt;
      if (countdown <= 0) launchPuck();
      return;
    }

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
    handleStall(dt, speed);
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

    var inGoalRange = Math.abs(puck.x - width / 2) < goalHalfWidth;

    if (puck.y < puckRadius) {
      if (inGoalRange) {
        if (puck.y < -puckRadius) scoreGoal('A'); // salió por la portería de B
        return;
      }
      puck.y = puckRadius;
      puck.vy = -puck.vy * RESTITUTION_WALL;
    } else if (puck.y > height - puckRadius) {
      if (inGoalRange) {
        if (puck.y > height + puckRadius) scoreGoal('B'); // salió por la de A
        return;
      }
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

    stallTimer = 0;
  }

  function handleStall(dt, speed) {
    if (speed < Math.min(width, height) * STALL_SPEED_FACTOR) {
      stallTimer += dt;
      if (stallTimer >= STALL_LIMIT) {
        var half = puck.y < height / 2 ? 'B' : 'A';
        puck.x = width / 2;
        puck.y = half === 'A' ? height * 0.75 : height * 0.25;
        puck.vx = 0;
        puck.vy = 0;
        stallTimer = 0;
      }
    } else {
      stallTimer = 0;
    }
  }

  function scoreGoal(scoringPlayer) {
    score[scoringPlayer]++;
    var concededBy = scoringPlayer === 'A' ? 'B' : 'A';
    serveTo = concededBy;
    phase = 'countdown';
    countdown = SERVE_COUNTDOWN;
    stallTimer = 0;
    centerPuck();
    resetMallet('A');
    resetMallet('B');
  }

  function launchPuck() {
    var baseSpeed = Math.min(width, height) * 0.5;
    var angle = Math.random() * 0.6 - 0.3; // ±0.3 rad respecto a la vertical
    var dir = serveTo === 'A' ? 1 : -1; // hacia abajo (A) o hacia arriba (B)
    puck.vx = Math.sin(angle) * baseSpeed;
    puck.vy = Math.cos(angle) * baseSpeed * dir;
    phase = 'playing';
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

    drawScore();
    if (phase === 'countdown') drawCountdown();

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

  function drawScore() {
    var fontSize = Math.min(width, height) * 0.08;
    var offset = fontSize * 1.5;

    ctx.font = '700 ' + fontSize + 'px ' + fontFamily;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Jugador A (abajo), lectura normal.
    ctx.fillText(String(score.A), width / 2, height / 2 + offset);

    // Jugador B (arriba), rotado 180° para que se lea desde su lado.
    ctx.save();
    ctx.translate(width / 2, height / 2 - offset);
    ctx.rotate(Math.PI);
    ctx.fillText(String(score.B), 0, 0);
    ctx.restore();
  }

  function drawCountdown() {
    var value = Math.max(Math.ceil(countdown), 1);
    ctx.font = '700 ' + Math.min(width, height) * 0.16 + 'px ' + fontFamily;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(value), width / 2, height / 2);
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
