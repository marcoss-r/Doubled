/**
 * Beer Pong — Doubled.
 * Fase 2, hito 1.5: shell del juego. Mesa estática en perspectiva falsa
 * con la formación inicial de 10 vasos, sin física ni entrada todavía
 * (llegan en el hito 1.6).
 */
(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var rotateWarning = document.getElementById('rotate-warning');

  var MAX_DPR = 3;
  var CUPS_ZONE_RATIO = 0.6; // fracción del alto dedicada a los vasos del rival

  var accent =
    getComputedStyle(document.documentElement).getPropertyValue('--c-beer-pong').trim() ||
    '#ffa227';

  var width = 0;
  var height = 0;
  var orientationBlocked = false;

  /**
   * Formación en triángulo: filas de atrás (más numerosa) hacia delante
   * (el vértice). rowSizesFor(10) = [4, 3, 2, 1].
   */
  function rowSizesFor(totalSlots) {
    if (totalSlots === 10) return [4, 3, 2, 1];
    if (totalSlots === 6) return [3, 2, 1];
    if (totalSlots === 3) return [2, 1];
    return [1];
  }

  /**
   * Construye la formación completa. `aliveCount` vasos quedan vivos,
   * repartidos de delante (vértice) hacia atrás; el resto se marcan ya
   * eliminados (para el caso en que se reagrupa con huecos, hito 1.7).
   */
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

  /**
   * Geometría de la mesa en perspectiva falsa: un trapecio que se
   * estrecha hacia el fondo (arriba). t=0 es la fila más lejana (borde
   * superior), t=1 la más cercana (linde con la zona de swipe).
   */
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

  /** t en [0,1] para cada fila, del fondo (0) al vértice (1). */
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
        positions.push({
          cup: cup,
          x: startX + cup.col * spacing,
          y: y,
          r: r
        });
      });
    });
    return positions;
  }

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

  /* -------------------------------------------------------------- render */

  function render() {
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, width, height);

    var geo = tableGeometry();

    // Mesa: trapecio con degradado sutil, más claro cerca del jugador.
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

    // Línea que separa la mesa del rival de la zona de swipe propia.
    ctx.beginPath();
    ctx.moveTo(0, geo.bottomY);
    ctx.lineTo(width, geo.bottomY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawCups(geo);
  }

  function drawCups(geo) {
    var positions = cupPositions(rival.cups, rival.rowCount, geo);

    positions.forEach(function (pos) {
      if (!pos.cup.alive) return;
      drawCup(pos.x, pos.y, pos.r);
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
})();
