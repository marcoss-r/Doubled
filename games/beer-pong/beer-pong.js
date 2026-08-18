/**
 * Beer Pong — Doubled.
 * Fase 2, hito 1.6: gesto de swipe con previsualización y física de
 * parábola. La pelota vuela y aterriza, pero todavía sin detectar
 * aciertos contra los vasos (llega en el hito 1.7): tras aterrizar,
 * simplemente vuelve a la posición de saque.
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var rotateWarning = document.getElementById('rotate-warning');

  var MAX_DPR = 3;
  var STEP = 1 / 120;
  var CUPS_ZONE_RATIO = 0.6;
  var MIN_SWIPE_DISTANCE = 24; // px, por debajo se considera toque accidental
  var MIN_SWIPE_SPEED = 800; // px/s → potencia 0
  var MAX_SWIPE_SPEED = 4500; // px/s → potencia 1
  var MAX_ANGLE = (65 * Math.PI) / 180; // más inclinado que esto: gesto cancelado
  var SAMPLE_WINDOW_MS = 80;
  var LANDED_PAUSE_MS = 700;

  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-beer-pong').trim() ||
    '#ffa227';

  var width = 0;
  var height = 0;
  var ballRadius = 0;
  var orientationBlocked = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /* --------------------------------------------------------- formación */

  function rowSizesFor(totalSlots) {
    if (totalSlots === 10) return [4, 3, 2, 1];
    if (totalSlots === 6) return [3, 2, 1];
    if (totalSlots === 3) return [2, 1];
    return [1];
  }

  function buildFormation(totalSlots, aliveCount) {
    var rows = rowSizesFor(totalSlots);
    var order = [];
    for (var r = rows.length - 1; r >= 0; r--) {
      for (var c = 0; c < rows[r]; c++) order.push({ row: r, col: c });
    }
    var aliveSet = {};
    for (var i = 0; i < order.length && i < aliveCount; i++) {
      aliveSet[order[i].row + '_' + order[i].col] = true;
    }
    var cups = [];
    for (var r2 = 0; r2 < rows.length; r2++) {
      for (var c2 = 0; c2 < rows[r2]; c2++) {
        cups.push({ row: r2, col: c2, alive: !!aliveSet[r2 + '_' + c2] });
      }
    }
    return cups;
  }

  var rival = { cups: buildFormation(10, 10), rowCount: 4 };

  /* -------------------------------------------------------------- layout */

  function tableGeometry() {
    var topY = height * 0.08;
    var bottomY = height * CUPS_ZONE_RATIO;
    var farHalfWidth = width * 0.24;
    var nearHalfWidth = width * 0.4;
    var basis = Math.min(width, height);

    return {
      topY: topY,
      bottomY: bottomY,
      farHalfWidth: farHalfWidth,
      nearHalfWidth: nearHalfWidth,
      yAt: function (t) {
        return topY + (bottomY - topY) * t;
      },
      halfWidthAt: function (t) {
        return farHalfWidth + (nearHalfWidth - farHalfWidth) * t;
      },
      cupRadiusAt: function (t) {
        return basis * (0.028 + (0.058 - 0.028) * t);
      }
    };
  }

  function rowT(rowIndex, rowCount) {
    var first = 0.16;
    var last = 0.86;
    if (rowCount <= 1) return last;
    return first + ((last - first) * rowIndex) / (rowCount - 1);
  }

  function cupPositions(cups, rowCount, geo) {
    var byRow = {};
    cups.forEach(function (cup) {
      byRow[cup.row] = byRow[cup.row] || [];
      byRow[cup.row].push(cup);
    });

    var positions = [];
    Object.keys(byRow).forEach(function (rowKey) {
      var row = Number(rowKey);
      var t = rowT(row, rowCount);
      var y = geo.yAt(t);
      var r = geo.cupRadiusAt(t);
      var rowCups = byRow[row];
      var n = rowCups.length;
      var spacing = r * 2.15;
      var rowWidth = spacing * (n - 1);
      var startX = width / 2 - rowWidth / 2;

      rowCups.forEach(function (cup) {
        positions.push({ cup: cup, x: startX + cup.col * spacing, y: y, r: r });
      });
    });
    return positions;
  }

  /* ------------------------------------------------------------ la bola */

  var ballRest = { x: 0, y: 0 };
  var ball = { x: 0, y: 0, z: 0, phase: 'idle' };

  function resetBall() {
    ball.phase = 'idle';
    ball.x = ballRest.x;
    ball.y = ballRest.y;
    ball.z = 0;
  }

  function launchBall(vx, vy, speed) {
    var geo = tableGeometry();
    var depth = geo.bottomY - geo.topY;
    var power = clamp((speed - MIN_SWIPE_SPEED) / (MAX_SWIPE_SPEED - MIN_SWIPE_SPEED), 0, 1);

    var rangeY = depth * (0.35 + 0.7 * power);
    var ratio = vx / -vy;
    var landingX = ball.x + rangeY * ratio;
    var landingY = ball.y - rangeY;

    var duration = 0.55 + 0.3 * power;
    var gravity = Math.min(width, height) * 3.2;

    ball.phase = 'flight';
    ball.startX = ball.x;
    ball.startY = ball.y;
    ball.flightVX = (landingX - ball.x) / duration;
    ball.flightVY = (landingY - ball.y) / duration;
    ball.flightVZ = 0.5 * gravity * duration;
    ball.gravity = gravity;
    ball.flightDuration = duration;
    ball.flightElapsed = 0;
  }

  /* --------------------------------------------------------------- input */

  var activePointerId = null;
  var drag = null;

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function computeSwipeVelocity(samples) {
    if (samples.length < 2) return null;
    var last = samples[samples.length - 1];
    var windowStart = last.t - SAMPLE_WINDOW_MS;
    var base = samples[0];
    for (var i = samples.length - 1; i >= 0; i--) {
      base = samples[i];
      if (samples[i].t <= windowStart) break;
    }
    var dt = Math.max(1, last.t - base.t);
    return { vx: ((last.x - base.x) / dt) * 1000, vy: ((last.y - base.y) / dt) * 1000 };
  }

  function isValidDirection(vx, vy) {
    if (-vy <= 0) return false; // hacia abajo o plano
    return Math.abs(Math.atan2(vx, -vy)) < MAX_ANGLE; // no demasiado horizontal
  }

  canvas.addEventListener('pointerdown', function (event) {
    if (activePointerId !== null || ball.phase !== 'idle') return; // un solo puntero, sin lanzar en pleno vuelo
    var pos = pointFromEvent(event);
    var geo = tableGeometry();
    if (pos.y < geo.bottomY) return; // el gesto arranca en la zona de swipe

    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    drag = { samples: [{ x: pos.x, y: pos.y, t: performance.now() }] };
  });

  canvas.addEventListener('pointermove', function (event) {
    if (event.pointerId !== activePointerId || !drag) return;
    var pos = pointFromEvent(event);
    var now = performance.now();
    drag.samples.push({ x: pos.x, y: pos.y, t: now });

    var cutoff = now - SAMPLE_WINDOW_MS * 2.5;
    while (drag.samples.length > 2 && drag.samples[0].t < cutoff) drag.samples.shift();
  });

  function finishDrag() {
    var d = drag;
    drag = null;
    activePointerId = null;
    if (!d || d.samples.length < 2) return;

    var first = d.samples[0];
    var last = d.samples[d.samples.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < MIN_SWIPE_DISTANCE) return;

    var v = computeSwipeVelocity(d.samples);
    if (!v || !isValidDirection(v.vx, v.vy)) return;

    launchBall(v.vx, v.vy, Math.hypot(v.vx, v.vy));
  }

  canvas.addEventListener('pointerup', function (event) {
    if (event.pointerId !== activePointerId) return;
    finishDrag();
  });
  canvas.addEventListener('pointercancel', function (event) {
    if (event.pointerId !== activePointerId) return;
    drag = null;
    activePointerId = null;
  });

  /* ------------------------------------------------------------------ update */

  function update(dt) {
    if (orientationBlocked) return;

    if (ball.phase === 'flight') {
      ball.flightElapsed += dt;
      var t = Math.min(ball.flightElapsed, ball.flightDuration);
      ball.x = ball.startX + ball.flightVX * t;
      ball.y = ball.startY + ball.flightVY * t;
      ball.z = Math.max(0, ball.flightVZ * t - 0.5 * ball.gravity * t * t);

      if (ball.flightElapsed >= ball.flightDuration) {
        ball.phase = 'landed';
        ball.landedAt = performance.now();
      }
    } else if (ball.phase === 'landed') {
      if (performance.now() - ball.landedAt > LANDED_PAUSE_MS) resetBall();
    }
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ballRadius = Math.min(width, height) * 0.035;
    var geo = tableGeometry();
    ballRest = { x: width / 2, y: geo.bottomY + (height - geo.bottomY) * 0.42 };
    if (ball.phase !== 'flight') resetBall();
  }

  /* -------------------------------------------------------------- render */

  function render() {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, width, height);

    var geo = tableGeometry();

    ctx.beginPath();
    ctx.moveTo(width / 2 - geo.farHalfWidth, geo.topY);
    ctx.lineTo(width / 2 + geo.farHalfWidth, geo.topY);
    ctx.lineTo(width / 2 + geo.nearHalfWidth, geo.bottomY);
    ctx.lineTo(width / 2 - geo.nearHalfWidth, geo.bottomY);
    ctx.closePath();
    var gradient = ctx.createLinearGradient(0, geo.topY, 0, geo.bottomY);
    gradient.addColorStop(0, 'rgba(255, 162, 39, 0.05)');
    gradient.addColorStop(1, 'rgba(255, 162, 39, 0.14)');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, geo.bottomY);
    ctx.lineTo(width, geo.bottomY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawCups(geo);
    drawAimPreview();
    drawBall();
  }

  function drawCups(geo) {
    var positions = cupPositions(rival.cups, rival.rowCount, geo);
    positions.forEach(function (pos) {
      if (pos.cup.alive) drawCup(pos.x, pos.y, pos.r);
    });
  }

  function drawCup(x, y, r) {
    var gradient = ctx.createRadialGradient(x, y - r * 0.2, r * 0.2, x, y, r);
    gradient.addColorStop(0, 'rgba(255, 216, 168, 0.95)');
    gradient.addColorStop(1, accent);

    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.stroke();
  }

  function drawAimPreview() {
    if (!drag || ball.phase !== 'idle') return;
    var v = computeSwipeVelocity(drag.samples);
    if (!v) return;

    var speed = Math.hypot(v.vx, v.vy);
    var valid = isValidDirection(v.vx, v.vy);
    var power = clamp((speed - MIN_SWIPE_SPEED) / (MAX_SWIPE_SPEED - MIN_SWIPE_SPEED), 0, 1);

    ctx.save();
    ctx.strokeStyle = valid ? accent : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    var previewLen = Math.min(width, height) * (0.15 + 0.35 * power);
    var norm = speed > 0 ? previewLen / speed : 0;
    ctx.lineTo(ball.x + v.vx * norm, ball.y + v.vy * norm);
    ctx.stroke();
    ctx.setLineDash([]);

    // Anillo de potencia alrededor de la bola.
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ballRadius * 1.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
    ctx.lineWidth = 3;
    ctx.strokeStyle = valid ? accent : 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    var basis = Math.min(width, height);
    var shadowScale = 1 - Math.min(ball.z / (basis * 0.5), 0.6);

    ctx.beginPath();
    ctx.ellipse(
      ball.x,
      ball.y,
      ballRadius * 0.9 * shadowScale,
      ballRadius * 0.4 * shadowScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    var screenY = ball.y - ball.z;
    ctx.beginPath();
    ctx.arc(ball.x, screenY, ballRadius, 0, Math.PI * 2);
    var gradient = ctx.createRadialGradient(
      ball.x - ballRadius * 0.3,
      screenY - ballRadius * 0.3,
      ballRadius * 0.1,
      ball.x,
      screenY,
      ballRadius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#d8dcec');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.stroke();
  }

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
  DoubledRegisterSW('../../service-worker.js');

  var loop = DoubledLoop.createFixedLoop({ step: STEP, update: update, render: render });
  loop.start();
})();
