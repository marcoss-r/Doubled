/**
 * Doubled — generador de iconos PWA.
 *
 * Genera los PNG de assets/icons/ sin dependencias externas: dibuja en un
 * búfer RGBA con supermuestreo (antialiasing) y lo codifica como PNG usando
 * sólo `zlib` de Node.
 *
 * Uso:  node scripts/gen-icons.mjs
 *
 * El icono es el logo del hub: dos círculos solapados (cian + magenta) sobre
 * fondo oscuro; el solape suma color y queda casi blanco. Son placeholders
 * geométricos: cuando haya branding real basta con sustituir los PNG o ajustar
 * la paleta de abajo y volver a ejecutar el script.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'icons');

/** Factor de supermuestreo: se dibuja a SSx y se promedia al reducir. */
const SS = 4;

const COLOR = {
  bg: [0x0b, 0x0d, 0x16],
  cyan: [0x22, 0xe5, 0xff],
  magenta: [0xff, 0x3e, 0xa5]
};

/* ------------------------------------------------------------------ dibujo */

function createCanvas(size) {
  return { size, data: new Float64Array(size * size * 4) }; // RGBA 0..255
}

/** Fondo: cuadrado con esquinas redondeadas (radius en fracción del lado). */
function fillRoundedRect(canvas, radiusRatio, [r, g, b]) {
  const { size, data } = canvas;
  const radius = radiusRatio * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distancia a la esquina redondeada más cercana.
      const dx = Math.max(radius - (x + 0.5), x + 0.5 - (size - radius), 0);
      const dy = Math.max(radius - (y + 0.5), y + 0.5 - (size - radius), 0);
      if (Math.hypot(dx, dy) > radius) continue;

      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
}

/** Círculo con mezcla aditiva (el solape de los dos círculos se ilumina). */
function addCircle(canvas, cx, cy, radius, [r, g, b]) {
  const { size, data } = canvas;
  const r2 = radius * radius;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;

      const i = (y * size + x) * 4;
      data[i] = Math.min(255, data[i] + r);
      data[i + 1] = Math.min(255, data[i + 1] + g);
      data[i + 2] = Math.min(255, data[i + 2] + b);
      data[i + 3] = 255;
    }
  }
}

/** Reduce el canvas supermuestreado al tamaño final promediando bloques. */
function downsample(canvas, size) {
  const out = Buffer.alloc(size * size * 4);
  const { data, size: big } = canvas;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          const alpha = data[i + 3] / 255;
          // Se promedia en premultiplicado para no ensuciar los bordes.
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += data[i + 3];
        }
      }

      const n = SS * SS;
      const avgA = a / n;
      const o = (y * size + x) * 4;
      const unpremul = avgA > 0 ? 255 / avgA : 0;
      out[o] = Math.round(Math.min(255, (r / n) * unpremul));
      out[o + 1] = Math.round(Math.min(255, (g / n) * unpremul));
      out[o + 2] = Math.round(Math.min(255, (b / n) * unpremul));
      out[o + 3] = Math.round(avgA);
    }
  }

  return out;
}

/* -------------------------------------------------------------- PNG encoder */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Codifica un búfer RGBA de size×size como PNG de 8 bits con canal alfa. */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // sin entrelazado

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filtro None por fila
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------------- composición */

/**
 * @param {number} size        lado final en px
 * @param {object} options
 * @param {number} options.radiusRatio  redondeo del fondo (0 = cuadrado)
 * @param {number} options.contentScale tamaño del logo respecto al lienzo
 */
function renderIcon(size, { radiusRatio, contentScale }) {
  const big = size * SS;
  const canvas = createCanvas(big);

  fillRoundedRect(canvas, radiusRatio, COLOR.bg);

  const circleRadius = big * 0.26 * contentScale;
  const offset = big * 0.13 * contentScale;
  const center = big / 2;

  addCircle(canvas, center - offset, center, circleRadius, COLOR.cyan);
  addCircle(canvas, center + offset, center, circleRadius, COLOR.magenta);

  return encodePng(downsample(canvas, size), size);
}

const ICONS = [
  // Icono "any": cuadrado redondeado, el sistema lo muestra tal cual.
  { file: 'icon-192.png', size: 192, radiusRatio: 0.22, contentScale: 1 },
  { file: 'icon-512.png', size: 512, radiusRatio: 0.22, contentScale: 1 },
  // Maskable: fondo a sangre y contenido dentro de la zona segura (círculo
  // central del 80%), porque Android recorta el icono con formas variables.
  { file: 'maskable-192.png', size: 192, radiusRatio: 0, contentScale: 0.68 },
  { file: 'maskable-512.png', size: 512, radiusRatio: 0, contentScale: 0.68 },
  // iOS aplica su propia máscara redondeada: el PNG va a sangre.
  { file: 'apple-touch-icon-180.png', size: 180, radiusRatio: 0, contentScale: 0.82 }
];

mkdirSync(OUT_DIR, { recursive: true });

for (const icon of ICONS) {
  const png = renderIcon(icon.size, icon);
  writeFileSync(join(OUT_DIR, icon.file), png);
  console.log(`assets/icons/${icon.file} — ${icon.size}×${icon.size}, ${png.length} B`);
}
