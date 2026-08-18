/**
 * Beer Pong — Doubled.
 * Fase 2, hito 1.9: redención, muerte súbita, gameover y revancha.
 * El pulido final, el sonido/vibración y el alta en el hub llegan en el
 * hito 2.0.
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var rotateWarning = document.getElementById('rotate-warning');
  var hudStatus = document.getElementById('hud-status');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlay-title');
  var overlaySubtitle = document.getElementById('overlay-subtitle');
  var rematchBtn = document.getElementById('rematch-btn');
  var handover = DoubledHandover.create();

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

  var REGROUP_SIZES = [10, 6, 3, 1];
  var CUP_ACCEPT_RATIO = 1.15; // radio de acierto: +15% sobre el vaso dibujado
  var CUP_REMOVE_ANIM_MS = 260;
  var TURN_SHOTS = 2;

  function newPlayer(name) {
    return { name: name, cups: buildFormation(10, 10), rowCount: 4, cupsRemaining: 10 };
  }

  var players = { A: newPlayer('Jugador 1'), B: newPlayer('Jugador 2') };
  var currentPlayer = 'A'; // quien tira ahora
  var shotsThisTurn = 0;
  var turnHits = 0;
  var ballBackGranted = false;
  var turnShotsLimit = TURN_SHOTS;
  var turnPhase = 'handover'; // 'handover' | 'playing' | 'gameover'
  var redemptionActive = false; // el turno que viene es el tiro de redención
  var suddenDeath = false;
  var winner = null;

  function opponentOf(id) {
    return id === 'A' ? 'B' : 'A';
  }

  function targetPlayer() {
    return players[opponentOf(currentPlayer)];
  }

  /**
   * Reagrupa a la formación estándar más pequeña en la que quepan todos los
   * vasos vivos (10→6→3→1). Si sobran huecos, se pre-eliminan empezando por
   * la fila de atrás (la más numerosa), dejando el vértice intacto el mayor
   * tiempo posible. Ver la nota de reagrupación en docs/games/beer-pong.md.
   */
  function maybeRegroup(player) {
    var remaining = player.cupsRemaining;
    if (remaining <= 0) return;
    var candidates = REGROUP_SIZES.filter(function (n) {
      return n >= remaining;
    });
    var target = candidates[candidates.length - 1];
    if (target < player.cups.length) {
      player.cups = buildFormation(target, remaining);
      player.rowCount = rowSizesFor(target).length;
    }
  }

  /**
   * Retira los vasos marcados como acertados durante el turno que acaba de
   * terminar. Se hace de golpe al cerrar el turno (no tiro a tiro): así el
   * jugador ve durante todo su turno cuáles ya ha tocado (atenuados en
   * drawCups) sin que la formación cambie a mitad de turno.
   */
  function retirePendingHits(player) {
    var now = performance.now();
    player.cups.forEach(function (cup) {
      if (!cup.pendingHit) return;
      cup.pendingHit = false;
      cup.alive = false;
      cup.removedAt = now;
      player.cupsRemaining--;
    });
    maybeRegroup(player);
  }

  function findHitCup(x, y, geo, player) {
    var positions = cupPositions(player.cups, player.rowCount, geo);
    var best = null;
    var bestDist = Infinity;
    positions.forEach(function (pos) {
      if (!pos.cup.alive || pos.cup.pendingHit) return;
      var dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist <= pos.r * CUP_ACCEPT_RATIO && dist < bestDist) {
        bestDist = dist;
        best = pos;
      }
    });
    return best;
  }

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
    ball.bounced = false;
    ball.wasHit = false;
  }

  /**
   * Se llama cuando la bola vuelve a quedar en reposo tras un lanzamiento
   * (acierto o fallo): cuenta el tiro, concede el balls back si toca, y
   * cierra el turno si ya no quedan tiros.
   */
  function finishShot() {
    var wasHit = ball.wasHit;
    resetBall();

    shotsThisTurn++;
    if (wasHit) turnHits++;

    if (turnHits === 2 && shotsThisTurn === 2 && !ballBackGranted) {
      ballBackGranted = true;
      turnShotsLimit = TURN_SHOTS + 1;
    }

    refreshHud();

    if (shotsThisTurn >= turnShotsLimit) endTurn();
  }

  /**
   * Cierra el turno. Si el objetivo se ha quedado sin vasos:
   *  - En un turno normal, no se acaba la partida todavía: el objetivo
   *    (que es a quien le toca tirar a continuación, por la alternancia
   *    normal) recibe un tiro de redención.
   *  - Si el turno que se cierra ERA la redención y también deja al líder
   *    sin vasos, empieza la muerte súbita (3 vasos por bando).
   *  - Si el turno que se cierra ERA la redención y no lo consigue, gana
   *    el líder.
   *  - En muerte súbita, el primero que deja al otro sin vasos gana, sin
   *    otra redención.
   */
  function endTurn() {
    var shooter = currentPlayer; // quien acaba de tirar este turno
    var target = targetPlayer(); // a quien atacaba, capturado antes de girar turno
    var wasRedemptionTurn = redemptionActive;

    retirePendingHits(target);
    var targetWipedOut = target.cupsRemaining <= 0;

    if (wasRedemptionTurn) {
      redemptionActive = false;
      if (targetWipedOut) {
        startSuddenDeath();
        return;
      }
      winner = opponentOf(shooter); // el líder resistió la redención
      showGameOver();
      return;
    }

    if (suddenDeath && targetWipedOut) {
      winner = shooter;
      showGameOver();
      return;
    }

    if (targetWipedOut) {
      // Whiteout normal: el objetivo recibe un tiro de redención en su
      // próximo turno, que le toca de todas formas por la alternancia.
      redemptionActive = true;
    }

    currentPlayer = opponentOf(currentPlayer);
    shotsThisTurn = 0;
    turnHits = 0;
    ballBackGranted = false;
    turnShotsLimit = TURN_SHOTS;
    turnPhase = 'handover';

    var subtitle = redemptionActive ? '¡Tiro de redención! Toca cuando estés listo' : undefined;
    handover.show(
      'Pasa el móvil a ' + players[currentPlayer].name,
      function () {
        turnPhase = 'playing';
      },
      subtitle
    );
    refreshHud();
  }

  function startSuddenDeath() {
    suddenDeath = true;
    ['A', 'B'].forEach(function (id) {
      players[id].cups = buildFormation(3, 3);
      players[id].rowCount = rowSizesFor(3).length;
      players[id].cupsRemaining = 3;
    });

    currentPlayer = opponentOf(currentPlayer);
    shotsThisTurn = 0;
    turnHits = 0;
    ballBackGranted = false;
    turnShotsLimit = TURN_SHOTS;
    turnPhase = 'handover';

    handover.show(
      'Pasa el móvil a ' + players[currentPlayer].name,
      function () {
        turnPhase = 'playing';
      },
      '¡Muerte súbita! 3 vasos por bando'
    );
    refreshHud();
  }

  function showGameOver() {
    var loserId = opponentOf(winner);
    overlayTitle.textContent = players[winner].name + ' gana';
    overlaySubtitle.textContent = players[loserId].name + ' se quedó sin vasos';
    overlay.hidden = false;
    turnPhase = 'gameover';
  }

  function resetGame() {
    players.A = newPlayer('Jugador 1');
    players.B = newPlayer('Jugador 2');
    currentPlayer = 'A';
    shotsThisTurn = 0;
    turnHits = 0;
    ballBackGranted = false;
    turnShotsLimit = TURN_SHOTS;
    redemptionActive = false;
    suddenDeath = false;
    winner = null;
    resetBall();
    overlay.hidden = true;
    turnPhase = 'handover';

    handover.show('Pasa el móvil a ' + players[currentPlayer].name, function () {
      turnPhase = 'playing';
    });
    refreshHud();
  }

  rematchBtn.addEventListener('click', function () {
    resetGame();
  });

  function refreshHud() {
    if (!hudStatus) return;
    hudStatus.textContent =
      'Turno de ' + players[currentPlayer].name + ' · quedan ' + targetPlayer().cupsRemaining;
  }

  function launchBall(vx, vy, speed) {
    var geo = tableGeometry();
    var depth = geo.bottomY - geo.topY;
    var power = clamp((speed - MIN_SWIPE_SPEED) / (MAX_SWIPE_SPEED - MIN_SWIPE_SPEED), 0, 1);

    // El rango va de "corto, se queda antes del vértice" (potencia 0) a
    // "sobrepasa la fila de atrás" (potencia 1): con la bola de descanso a
    // ballRest.y, hace falta más de 1×depth para alcanzar el fondo de la
    // mesa (topY), así que el multiplicador máximo no puede quedarse en 1.
    var rangeY = depth * (0.33 + 1.07 * power);
    var ratio = vx / -vy;
    var landingX = ball.x + rangeY * ratio;
    var landingY = ball.y - rangeY;

    var duration = 0.5 + 0.45 * power;
    var gravity = Math.min(width, height) * 3.2;

    ball.phase = 'flight';
    ball.bounced = false;
    ball.startX = ball.x;
    ball.startY = ball.y;
    ball.flightVX = (landingX - ball.x) / duration;
    ball.flightVY = (landingY - ball.y) / duration;
    ball.flightVZ = 0.5 * gravity * duration;
    ball.gravity = gravity;
    ball.flightDuration = duration;
    ball.flightElapsed = 0;
  }

  /**
   * Al terminar un vuelo: si hay un vaso vivo dentro del radio de acierto,
   * se retira (con animación) y se comprueba la reagrupación. Si falla, da
   * un pequeño bote amortiguado antes de asentarse (un único bote, no una
   * simulación completa: es cosmético, el resultado ya está decidido).
   */
  function handleLanding() {
    var geo = tableGeometry();
    var hit = findHitCup(ball.x, ball.y, geo, targetPlayer());

    if (hit) {
      hit.cup.pendingHit = true;
      ball.wasHit = true;
      ball.x = hit.x;
      ball.y = hit.y;
      ball.phase = 'sunk';
      ball.landedAt = performance.now();
      return;
    }

    if (!ball.bounced) {
      ball.bounced = true;
      ball.phase = 'flight';
      ball.startX = ball.x;
      ball.startY = ball.y;
      ball.flightVX = 0;
      ball.flightVY = 0;
      ball.flightVZ = ball.flightVZ * 0.22;
      ball.flightDuration = 0.22;
      ball.flightElapsed = 0;
      return;
    }

    ball.phase = 'landed';
    ball.landedAt = performance.now();
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
    if (activePointerId !== null || ball.phase !== 'idle' || turnPhase !== 'playing') return;
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

      if (ball.flightElapsed >= ball.flightDuration) handleLanding();
    } else if (ball.phase === 'landed' || ball.phase === 'sunk') {
      if (performance.now() - ball.landedAt > LANDED_PAUSE_MS) finishShot();
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

    drawCups(geo, targetPlayer());
    drawAimPreview();
    drawBall();
  }

  function drawCups(geo, player) {
    var positions = cupPositions(player.cups, player.rowCount, geo);
    var now = performance.now();

    positions.forEach(function (pos) {
      if (pos.cup.alive && !pos.cup.pendingHit) {
        drawCup(pos.x, pos.y, pos.r, 1);
        return;
      }
      // Ya tocado este turno, pendiente de retirarse al cerrarlo: se
      // atenúa para que se vea cuáles ya se han acertado.
      if (pos.cup.alive && pos.cup.pendingHit) {
        drawCup(pos.x, pos.y, pos.r, 0.4);
        return;
      }
      // Animación de retirada: encoge y se desvanece durante
      // CUP_REMOVE_ANIM_MS tras cerrar el turno; luego deja de dibujarse.
      if (!pos.cup.removedAt) return;
      var elapsed = now - pos.cup.removedAt;
      if (elapsed >= CUP_REMOVE_ANIM_MS) return;
      var t = elapsed / CUP_REMOVE_ANIM_MS;
      drawCup(pos.x, pos.y, pos.r * (1 - t), 1 - t);
    });
  }

  function drawCup(x, y, r, alpha) {
    var gradient = ctx.createRadialGradient(x, y - r * 0.2, r * 0.2, x, y, r);
    gradient.addColorStop(0, 'rgba(255, 216, 168, 0.95)');
    gradient.addColorStop(1, accent);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.78, 0, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.stroke();
    ctx.restore();
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

  refreshHud();
  handover.show('Pasa el móvil a ' + players[currentPlayer].name, function () {
    turnPhase = 'playing';
  });

  var loop = DoubledLoop.createFixedLoop({ step: STEP, update: update, render: render });
  loop.start();
})();
