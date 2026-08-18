/**
 * Beer Pong — Doubled.
 * Fase 2, hito 2.0: sonido, vibración, pulido y alta en el hub. Cierra la
 * Fase 2.
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
  var muteBtn = document.getElementById('mute-btn');
  var handover = DoubledHandover.create();

  var MAX_DPR = 3;
  var STEP = 1 / 120;
  var CUPS_ZONE_RATIO = 0.6;
  var MIN_SWIPE_DISTANCE = 24; // px, por debajo se considera toque accidental
  var MIN_SWIPE_SPEED = 800; // px/s → potencia 0
  var MAX_SWIPE_SPEED = 4500; // px/s → potencia 1
  var MAX_ANGLE = (65 * Math.PI) / 180; // más inclinado que esto: gesto cancelado
  var SAMPLE_WINDOW_MS = 80;
  var LANDED_PAUSE_MS = 450; // pausa antes de devolver la pelota al saque

  // --- Vasos con volumen (tronco de cono en perspectiva falsa) -------------
  var SQUASH = 0.78; // achatamiento vertical de las elipses: da la perspectiva
  var CUP_HEIGHT_RATIO = 2.0; // alto del vaso respecto al radio de su boca
  var CUP_BASE_RATIO = 0.72; // radio de la base respecto al de la boca
  var CUP_SPACING_RATIO = 2.04; // separación dentro de una fila, en radios de boca

  // Franja de mesa que ocupa la formación (0 = fondo, 1 = borde cercano).
  // Agrupada arriba a propósito: el resto de la mesa queda libre para que la
  // pelota pueda botar en ella antes de llegar a los vasos.
  var ROWS_T_FIRST = 0.13;
  var ROWS_T_LAST = 0.33;

  // --- Arco del lanzamiento ------------------------------------------------
  // Altura de la cúspide, en fracción del lado corto. Con vasos que ahora
  // tienen volumen, el arco no puede salir de la propia distancia del tiro:
  // los tiros cortos quedaban tan rasos que se estrellaban contra la pared
  // del vaso más cercano en vez de sobrevolarlo. Se fija alto (unas 2-3
  // veces la altura del vaso más grande) y sólo sube un poco con la potencia.
  // El tiro va bombeado a propósito: además de caer sobre los vasos desde
  // arriba, deja al bote en la mesa altura de sobra para superar el borde de
  // un vaso, que es lo que hace viables los tiros de bote.
  var ARC_APEX_BASE = 0.4;
  var ARC_APEX_POWER = 0.14;

  // --- Rebotes -------------------------------------------------------------
  // Tras botar, la altura que recupera la pelota es RESTITUTION_TABLE² veces
  // la que traía: con 0.58 conserva un tercio, más que la altura de un vaso,
  // así que un bote bien medido puede entrar. Con 0.5 se quedaba en un cuarto
  // y ningún bote llegaba a superar el borde.
  var RESTITUTION_TABLE = 0.58;
  var RESTITUTION_CUP = 0.62; // ... y al chocar con el borde o la pared
  var TABLE_FRICTION = 0.86; // pérdida horizontal en cada bote
  // Tras esto la pelota se amortigua y se detiene. Con el arco bombeado el
  // vuelo ya dura más de un segundo, y encadenar cuatro botes dejaba tiros
  // de más de tres segundos: demasiado tiempo muerto entre lanzamientos.
  var MAX_BOUNCES = 3;

  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-beer-pong').trim() ||
    '#ffa227';

  var width = 0;
  var height = 0;
  var ballRadius = 0;
  var gravity = 0;
  var orientationBlocked = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /** Componentes del acento, para poder modular su alfa en los degradados. */
  function parseHex(hex) {
    var match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!match) return { r: 255, g: 162, b: 39 };
    var value = parseInt(match[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }

  var accentRGB = parseHex(accent);

  function accentAlpha(alpha) {
    return 'rgba(' + accentRGB.r + ', ' + accentRGB.g + ', ' + accentRGB.b + ', ' + alpha + ')';
  }

  /**
   * Distancia en el plano de la mesa. Las elipses de los vasos están
   * achatadas por la perspectiva, así que una separación vertical en
   * pantalla equivale a `dy / SQUASH` sobre la mesa: con esta métrica un
   * vaso vuelve a ser un círculo de radio `r` y las colisiones se pueden
   * resolver como tales.
   */
  function tableDistance(dx, dy) {
    return Math.hypot(dx, dy / SQUASH);
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

  /** Callback de handover.show(): desbloquea el audio en cada toque de
   * "Estoy listo" (gesto de usuario, requisito de iOS Safari) y habilita
   * la entrada táctil del turno. */
  function onTurnReady() {
    DoubledAudio.unlock();
    turnPhase = 'playing';
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
   * drawScene) sin que la formación cambie a mitad de turno.
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
        // Los vasos viven ahora en el fondo, donde la perspectiva los
        // empequeñece: se parte de un radio mayor y se atenúa cuánto
        // encoge con la distancia, para que sigan siendo apuntables.
        return basis * (0.04 + 0.022 * t);
      }
    };
  }

  /**
   * Posición de cada fila a lo largo de la mesa (0 = fondo, 1 = borde
   * cercano). La formación se agrupa en el fondo y deja libre el resto de
   * la mesa: es la superficie sobre la que la pelota puede botar antes de
   * llegar a los vasos.
   */
  function rowT(rowIndex, rowCount) {
    var first = ROWS_T_FIRST;
    var last = ROWS_T_LAST;
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
      var spacing = r * CUP_SPACING_RATIO;
      var rowWidth = spacing * (n - 1);
      var startX = width / 2 - rowWidth / 2;

      rowCups.forEach(function (cup) {
        positions.push({
          cup: cup,
          x: startX + cup.col * spacing, // centro del vaso, a ras de mesa
          y: y,
          r: r, // radio de la boca
          baseR: r * CUP_BASE_RATIO, // radio de la base (el vaso se estrecha)
          h: r * CUP_HEIGHT_RATIO // altura, en las mismas unidades que ball.z
        });
      });
    });
    return positions;
  }

  /**
   * Posiciones del rival, cacheadas: la física las consulta en cada paso
   * (120/s) y recalcularlas allocaría un array de objetos por paso.
   *
   * La clave del caché es la identidad del array `cups` más las dimensiones:
   * al reagrupar (`buildFormation` devuelve un array nuevo), al cambiar de
   * turno (se pasa al array del otro jugador) o al redimensionar, el caché
   * se invalida solo. Los flags `alive`/`pendingHit` se leen en vivo desde
   * `pos.cup`, que apunta al mismo objeto, así que no hace falta invalidarlo
   * al acertar un vaso.
   */
  var cupCache = { cups: null, w: 0, h: 0, positions: null };

  function targetCupPositions() {
    var player = targetPlayer();
    if (cupCache.cups === player.cups && cupCache.w === width && cupCache.h === height) {
      return cupCache.positions;
    }
    cupCache.positions = cupPositions(player.cups, player.rowCount, tableGeometry());
    cupCache.cups = player.cups;
    cupCache.w = width;
    cupCache.h = height;
    return cupCache.positions;
  }

  /* ------------------------------------------------------------ la bola */

  var ballRest = { x: 0, y: 0 };

  /**
   * La bola es un proyectil 2.5D: `(x, y)` es su posición sobre el plano de
   * la mesa y `z` su altura; en pantalla se dibuja en `(x, y - z)`. Las
   * velocidades se integran de verdad (no hay trayectoria guionizada), que
   * es lo que permite que rebote contra la mesa, el borde de un vaso o su
   * pared exterior y siga volando.
   */
  var ball = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    // 'idle' | 'flight' | 'falling' | 'sinking' | 'sunk' | 'settled' | 'gone'
    phase: 'idle',
    bounces: 0,
    sinkCup: null,
    wasHit: false,
    enteredTable: false
  };

  function resetBall() {
    ball.phase = 'idle';
    ball.x = ballRest.x;
    ball.y = ballRest.y;
    ball.z = 0;
    ball.vx = 0;
    ball.vy = 0;
    ball.vz = 0;
    ball.bounces = 0;
    ball.sinkCup = null;
    ball.wasHit = false;
    ball.enteredTable = false;
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
      DoubledAudio.beep(320, 0.22, 'triangle');
      DoubledAudio.vibrate([15, 40, 15]);
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
      onTurnReady,
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
    DoubledAudio.beep(300, 0.16, 'sawtooth');
    setTimeout(function () {
      DoubledAudio.beep(300, 0.16, 'sawtooth');
    }, 180);
    DoubledAudio.vibrate([20, 60, 20, 60, 20]);

    currentPlayer = opponentOf(currentPlayer);
    shotsThisTurn = 0;
    turnHits = 0;
    ballBackGranted = false;
    turnShotsLimit = TURN_SHOTS;
    turnPhase = 'handover';

    handover.show(
      'Pasa el móvil a ' + players[currentPlayer].name,
      onTurnReady,
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

    // Pequeño arpegio ascendente: tres beeps encadenados con setTimeout, ya
    // que DoubledAudio.beep() no admite retraso propio.
    DoubledAudio.beep(440, 0.16, 'triangle');
    setTimeout(function () {
      DoubledAudio.beep(554, 0.16, 'triangle');
    }, 130);
    setTimeout(function () {
      DoubledAudio.beep(659, 0.28, 'triangle');
    }, 260);
    DoubledAudio.vibrate([30, 50, 30, 50, 80]);
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

    handover.show('Pasa el móvil a ' + players[currentPlayer].name, onTurnReady);
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

    // El rango va de "cae en mesa abierta, bastante antes del vértice"
    // (potencia 0) a "sobrepasa la fila del fondo" (potencia 1). Con la
    // formación agrupada al fondo, todos los vasos quedan en una franja
    // estrecha de distancias: si el mínimo fuese mucho más corto, la banda
    // útil de potencia se comprimiría contra el máximo y el tiro sería
    // imposible de dosificar.
    // Recalibrado para el arco bombeado: al caer más vertical, el punto por
    // el que la pelota cruza la boca del vaso queda casi sobre el punto de
    // caída, así que apuntar es más directo que con el arco raso anterior.
    var rangeY = depth * (0.49 + 0.72 * power);
    var ratio = vx / -vy;

    // La altura del arco la fija ARC_APEX_*, no el alcance; el tiempo de
    // vuelo sale de ella y la velocidad horizontal se ajusta para recorrer
    // `rangeY` en ese tiempo. Así la relación gesto→alcance se mantiene,
    // pero la bola siempre cae sobre los vasos desde arriba.
    var apex = Math.min(width, height) * (ARC_APEX_BASE + ARC_APEX_POWER * power);
    var launchVZ = Math.sqrt(2 * gravity * apex);
    var duration = (2 * launchVZ) / gravity;

    ball.phase = 'flight';
    ball.bounces = 0;
    ball.sinkCup = null;
    ball.wasHit = false;
    ball.vx = (rangeY * ratio) / duration;
    ball.vy = -rangeY / duration;
    ball.vz = launchVZ;
  }

  /* ------------------------------------------------------------- colisiones */

  /**
   * Refleja la velocidad horizontal contra la normal radial de un vaso.
   * El cálculo se hace en coordenadas de mesa (la `y` de pantalla dividida
   * por SQUASH) y se convierte de vuelta al final: reflejar directamente en
   * pantalla desviaría la bola en un ángulo equivocado, porque las elipses
   * están achatadas.
   */
  function reflectOffCup(dx, dy, restitution) {
    var nx = dx;
    var ny = dy / SQUASH;
    var len = Math.hypot(nx, ny) || 1e-4;
    nx /= len;
    ny /= len;

    var wvx = ball.vx;
    var wvy = ball.vy / SQUASH;
    var dot = wvx * nx + wvy * ny;
    if (dot >= 0) return false; // ya se aleja del vaso: no rebota otra vez

    wvx -= (1 + restitution) * dot * nx;
    wvy -= (1 + restitution) * dot * ny;
    ball.vx = wvx;
    ball.vy = wvy * SQUASH;
    return true;
  }

  function sinkBall(pos) {
    pos.cup.pendingHit = true;
    ball.wasHit = true;
    ball.sinkCup = pos;
    ball.phase = 'sinking';
    // Dentro del vaso ya no rebota: cae al fondo perdiendo lateral.
    ball.vx *= 0.15;
    ball.vy *= 0.15;
    ball.vz = -Math.abs(ball.vz) * 0.35;
    DoubledAudio.beep(560, 0.14, 'sine');
    DoubledAudio.vibrate(18);
  }

  function settleBall() {
    ball.phase = 'settled';
    ball.z = 0;
    ball.landedAt = performance.now();
  }

  /**
   * Cruce del plano de la boca de los vasos, comprobado entre la posición
   * anterior y la actual: si la bola baja atravesando ese plano, o entra
   * (queda dentro de la boca) o golpea el borde. Sin este test de cruce la
   * bola podría atravesar la boca en un solo paso a velocidades altas.
   */
  function checkCupMouth(prevX, prevY, prevZ) {
    var positions = targetCupPositions();

    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      if (!pos.cup.alive) continue;
      if (!(prevZ > pos.h && ball.z <= pos.h)) continue;

      // Posición interpolada en el instante exacto del cruce.
      var f = (prevZ - pos.h) / (prevZ - ball.z || 1e-4);
      var cx = prevX + (ball.x - prevX) * f;
      var cy = prevY + (ball.y - prevY) * f;
      var dist = tableDistance(cx - pos.x, cy - pos.y);

      // Un vaso ya acertado este turno sigue en la mesa hasta que el turno
      // se cierre: estorba como cualquier otro, pero no se puede volver a
      // encestar (la bola rebota en su boca como si estuviera tapada).
      // Radio de acierto algo mayor que la boca dibujada: el plan lo pide
      // así a propósito, para perdonar la imprecisión del dedo en una
      // pantalla pequeña. Exigir que la pelota entrase limpia (r menos su
      // propio radio) dejaba una ventana de apenas medio grado de potencia.
      if (!pos.cup.pendingHit && dist <= pos.r + ballRadius * 0.25) {
        ball.x = cx;
        ball.y = cy;
        ball.z = pos.h;
        sinkBall(pos);
        return true;
      }

      if (dist <= pos.r + ballRadius) {
        // Golpe en el borde: sale despedida hacia fuera y hacia arriba.
        ball.x = cx;
        ball.y = cy;
        ball.z = pos.h;
        reflectOffCup(cx - pos.x, cy - pos.y, RESTITUTION_CUP);
        ball.vz = Math.abs(ball.vz) * RESTITUTION_CUP;
        ball.bounces++;
        DoubledAudio.beep(420, 0.07, 'square');
        return true;
      }
    }
    return false;
  }

  /** Choque contra la pared exterior del vaso (el tronco de cono). */
  function collideWithCupWalls() {
    var positions = targetCupPositions();

    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      if (!pos.cup.alive) continue; // ya retirado: deja de estar en la mesa
      if (ball.z >= pos.h || ball.z < 0) continue;

      var dx = ball.x - pos.x;
      var dy = ball.y - pos.y;
      var dist = tableDistance(dx, dy);
      // El vaso se estrecha hacia abajo: su radio depende de la altura.
      var radiusHere = pos.baseR + (pos.r - pos.baseR) * (ball.z / pos.h);
      var minDist = radiusHere + ballRadius;
      if (dist >= minDist) continue;

      if (reflectOffCup(dx, dy, RESTITUTION_CUP)) {
        ball.bounces++;
        DoubledAudio.beep(300, 0.06, 'square');
      }
      // Se saca del vaso aunque no rebotase, para no quedar encajada.
      var scale = minDist / (dist || 1e-4);
      ball.x = pos.x + dx * scale;
      ball.y = pos.y + dy * scale;
    }
  }

  function bounceOnTable() {
    ball.z = 0;

    var impact = Math.abs(ball.vz);
    if (impact < gravity * 0.06 || ball.bounces >= MAX_BOUNCES) {
      ball.vz = 0;
      ball.vx *= 0.5;
      ball.vy *= 0.5;
      return;
    }

    ball.vz = impact * RESTITUTION_TABLE;
    ball.vx *= TABLE_FRICTION;
    ball.vy *= TABLE_FRICTION;
    ball.bounces++;
    // Cada bote suena un poco más agudo y más flojo que el anterior.
    DoubledAudio.beep(150 + ball.bounces * 25, 0.09, 'triangle');
  }

  /**
   * ¿Está la pelota sobre el tablero? El borde cercano no cuenta como salir:
   * por delante de la mesa está el suelo del jugador, y además el saque
   * arranca justo ahí (en la zona de swipe), así que tratarlo como vacío
   * daría por caída cualquier lanzamiento en su primer paso.
   */
  function isOverTable(geo, x, y) {
    if (y < geo.topY) return false;
    if (y > geo.bottomY) return true;
    var t = (y - geo.topY) / (geo.bottomY - geo.topY);
    return Math.abs(x - width / 2) <= geo.halfWidthAt(t);
  }

  function startFalling() {
    ball.phase = 'falling';
    ball.sinkCup = null;
    DoubledAudio.beep(120, 0.18, 'sine');
  }

  function ballHasStopped(geo) {
    var basis = Math.min(width, height);
    // Volver por delante sólo cuenta si ya ha botado en algo, por el mismo
    // motivo que arriba: el saque está por debajo del borde cercano.
    var cameBack = ball.bounces > 0 && ball.y > geo.bottomY + ballRadius * 8;
    var atRest = ball.z <= 0.5 && ball.vz <= 0 && Math.hypot(ball.vx, ball.vy) < basis * 0.05;
    return cameBack || atRest;
  }

  /** Un paso de simulación de la bola en vuelo. */
  function stepBall(dt) {
    var prevX = ball.x;
    var prevY = ball.y;
    var prevZ = ball.z;

    ball.vz -= gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    if (ball.vz < 0 && checkCupMouth(prevX, prevY, prevZ)) return;

    collideWithCupWalls();

    var geo = tableGeometry();
    if (isOverTable(geo, ball.x, ball.y)) {
      ball.enteredTable = true;
    } else if (ball.enteredTable) {
      // Se ha pasado del fondo o de un lateral: ahí ya no hay mesa que la
      // sostenga, así que cae al vacío en vez de quedarse flotando.
      startFalling();
      return;
    }

    if (ball.z <= 0) bounceOnTable();

    if (ballHasStopped(geo)) settleBall();
  }

  /** Profundidad de caída tras la que la pelota se da por perdida. */
  function fallDepth() {
    return Math.min(width, height) * 0.35;
  }

  /**
   * Fuera de la mesa: cae sin nada que la frene. Se da por perdida al bajar
   * `fallDepth()` por debajo del plano de la mesa, no al salir de la
   * pantalla: quien se pasa del fondo se sale por arriba, y esperar a que
   * cruzase todo el alto tardaría varios segundos.
   */
  function stepFallingBall(dt) {
    ball.vz -= gravity * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    if (ball.z < -fallDepth() || ball.y - ball.z > height + ballRadius * 6) {
      ball.phase = 'gone';
      ball.landedAt = performance.now();
    }
  }

  /** La bola ya está dentro de un vaso: cae al fondo y se queda. */
  function stepSinkingBall(dt) {
    var pos = ball.sinkCup;

    ball.vz -= gravity * dt;
    ball.z += ball.vz * dt;
    // Se centra suavemente en el vaso mientras baja.
    ball.x += (pos.x - ball.x) * Math.min(1, dt * 10);
    ball.y += (pos.y - ball.y) * Math.min(1, dt * 10);

    if (ball.z <= 0) {
      ball.z = 0;
      ball.phase = 'sunk';
      ball.landedAt = performance.now();
    }
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
      stepBall(dt);
    } else if (ball.phase === 'falling') {
      stepFallingBall(dt);
    } else if (ball.phase === 'sinking') {
      stepSinkingBall(dt);
    } else if (ball.phase === 'settled' || ball.phase === 'sunk' || ball.phase === 'gone') {
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

    // La bola era demasiado grande frente a la boca del vaso (0.65 de su
    // radio); en una mesa real la proporción ronda 0.42, y con los vasos ya
    // en volumen esa desproporción hacía casi imposible colarla.
    ballRadius = Math.min(width, height) * 0.026;
    gravity = Math.min(width, height) * 3.2;
    var geo = tableGeometry();
    // Saque pegado al borde cercano de la mesa: con los vasos al fondo, cada
    // píxel que la pelota no tiene que recorrer desde abajo es alcance útil.
    ballRest = { x: width / 2, y: geo.bottomY + (height - geo.bottomY) * 0.22 };
    if (ball.phase !== 'flight' && ball.phase !== 'sinking') resetBall();
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

    drawScene();
  }

  /**
   * Vasos y bola, dibujados de atrás hacia delante (algoritmo del pintor):
   * un vaso cercano tapa a los de detrás, que es lo que vende el volumen.
   * La bola se ordena por su posición en la mesa, salvo cuando está cayendo
   * dentro de un vaso: entonces se dibuja justo antes que él, para que la
   * pared cercana la oculte según entra.
   */
  function drawScene() {
    var positions = targetCupPositions();
    var now = performance.now();
    var items = [];

    positions.forEach(function (pos) {
      var alpha = 1;
      var scale = 1;

      if (!pos.cup.alive) {
        // Animación de retirada: encoge y se desvanece durante
        // CUP_REMOVE_ANIM_MS tras cerrar el turno.
        if (!pos.cup.removedAt) return;
        var elapsed = now - pos.cup.removedAt;
        if (elapsed >= CUP_REMOVE_ANIM_MS) return;
        var t = elapsed / CUP_REMOVE_ANIM_MS;
        alpha = 1 - t;
        scale = 1 - t;
      } else if (pos.cup.pendingHit) {
        // Ya tocado este turno, pendiente de retirarse al cerrarlo.
        alpha = 0.4;
      }

      items.push({ depth: pos.y, kind: 'cup', pos: pos, alpha: alpha, scale: scale });
    });

    items.push({
      depth: ball.sinkCup ? ball.sinkCup.y - 0.5 : ball.y,
      kind: 'ball'
    });

    items.sort(function (a, b) {
      return a.depth - b.depth;
    });

    items.forEach(function (item) {
      if (item.kind === 'cup') drawCup(item.pos, item.alpha, item.scale);
      else drawBall();
    });
  }

  /**
   * Vaso con volumen: tronco de cono (más ancho en la boca que en la base),
   * cuerpo oscuro translúcido y boca perfilada en neón — el borde por el que
   * rebota la bola es exactamente el que se ve encendido.
   */
  function drawCup(pos, alpha, scale) {
    var x = pos.x;
    var y = pos.y;
    var r = pos.r * scale;
    var baseR = pos.baseR * scale;
    var h = pos.h * scale;
    var rimY = y - h;
    var rimRY = r * SQUASH;
    var baseRY = baseR * SQUASH;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Sombra en la mesa, para asentar el vaso.
    ctx.beginPath();
    ctx.ellipse(x, y, baseR * 1.15, baseRY * 1.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    // Cuerpo: base (frente de la elipse inferior) → laterales → labio trasero.
    ctx.beginPath();
    ctx.moveTo(x + r, rimY);
    ctx.lineTo(x + baseR, y);
    ctx.ellipse(x, y, baseR, baseRY, 0, 0, Math.PI, false);
    ctx.lineTo(x - r, rimY);
    ctx.ellipse(x, rimY, r, rimRY, 0, Math.PI, Math.PI * 2, false);
    ctx.closePath();

    var body = ctx.createLinearGradient(0, rimY, 0, y);
    body.addColorStop(0, accentAlpha(0.3));
    body.addColorStop(0.45, accentAlpha(0.13));
    body.addColorStop(1, 'rgba(12, 15, 26, 0.92)');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = accentAlpha(0.35);
    ctx.stroke();

    // Interior de la boca: hueco oscuro, más claro al fondo para dar cavidad.
    ctx.beginPath();
    ctx.ellipse(x, rimY, r * 0.88, rimRY * 0.88, 0, 0, Math.PI * 2);
    var mouth = ctx.createLinearGradient(0, rimY - rimRY, 0, rimY + rimRY);
    mouth.addColorStop(0, accentAlpha(0.22));
    mouth.addColorStop(1, 'rgba(5, 7, 14, 0.95)');
    ctx.fillStyle = mouth;
    ctx.fill();

    // Borde neón: la superficie de rebote.
    ctx.beginPath();
    ctx.ellipse(x, rimY, r, rimRY, 0, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, r * 0.11);
    ctx.strokeStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = r * 0.7;
    ctx.stroke();

    ctx.restore();
  }

  function drawBall() {
    if (ball.phase === 'gone') return; // se ha caído fuera de la mesa

    var basis = Math.min(width, height);
    var shadowScale = 1 - Math.min(ball.z / (basis * 0.5), 0.6);

    // Ni dentro de un vaso ni cayéndose al vacío hay suelo que reciba la
    // sombra: quitarla es lo que hace legible que la pelota se ha salido.
    if (!ball.sinkCup && ball.phase !== 'falling') {
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
    }

    var screenY = ball.y - ball.z;
    ctx.save();
    // Al caerse de la mesa se va apagando conforme baja, para que se lea
    // como que se pierde de vista y no como que atraviesa el fondo.
    if (ball.phase === 'falling') {
      ctx.globalAlpha = clamp(1 + ball.z / fallDepth(), 0, 1);
    }
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
    ctx.restore();
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

  /* ---------------------------------------------------------------- mute */

  function refreshMuteButton() {
    var isMuted = DoubledAudio.isMuted();
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', isMuted ? 'Activar sonido' : 'Silenciar');
  }

  muteBtn.addEventListener('click', function () {
    DoubledAudio.setMuted(!DoubledAudio.isMuted());
    refreshMuteButton();
  });

  /* ------------------------------------------------------------------ init */

  checkOrientation();
  resize();
  DoubledRegisterSW('../../service-worker.js');

  refreshHud();
  refreshMuteButton();
  handover.show('Pasa el móvil a ' + players[currentPlayer].name, onTurnReady);

  var loop = DoubledLoop.createFixedLoop({ step: STEP, update: update, render: render });
  loop.start();
})();
