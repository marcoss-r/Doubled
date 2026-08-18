# Changelog

Todas las versiones publicadas de Doubled. Formato `MAJOR.MINOR` según
[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md).

## [0.7] — Fase 1

### Añadido
- `js/shared/loop.js`: bucle de juego con paso de tiempo fijo (1/120 s) y
  acumulador, reutilizable por cualquier juego en tiempo real.
- Física base de Air Hockey: disco con fricción y velocidad máxima, rebote
  en las cuatro bandas, colisión elástica disco-mallet con transferencia de
  parte de la velocidad del mallet. Un único mallet, movido con el puntero
  por toda la mesa (la división en mitades llega en el hito 0.8).

## [0.6] — Fase 1

### Añadido
- Shell de Air Hockey (`games/air-hockey/`): página, mesa dibujada en canvas
  escalado a `devicePixelRatio` (tope 3), aviso de orientación en horizontal.
  Sin física ni entrada todavía. Alta del bloque `'air-hockey'` en el service
  worker.

## [0.5] — Fase 0

### Arreglado
- El badge «Próximamente» tapaba los nombres de juego largos en pantallas
  estrechas. Pasa a ser una etiqueta en flujo sobre el título, dentro del
  cuerpo de la tarjeta.

## [0.4] — Fase 0

### Añadido
- Planes de desarrollo individuales de los cuatro juegos en `docs/games/`:
  `air-hockey.md`, `beer-pong.md`, `pong.md` y `battleship.md`. Cada uno cubre
  reglas, orientación y layout, controles táctiles, mecánica, máquina de
  estados, ficheros y assets, hitos con su versión y riesgos abiertos.

## [0.3] — Fase 0

### Añadido
- `docs/CONVENTIONS.md`: versionado, Conventional Commits, checklist del
  service worker, estilo de código, criterios de cierre de fase y checklist de
  validación del shell PWA en dispositivos reales.
- `CHANGELOG.md` (este fichero).

## [0.2] — Fase 0

### Añadido
- Iconos PWA: 192/512 `any`, 192/512 `maskable` y `apple-touch-icon` 180.
- `scripts/gen-icons.mjs`, generador de los iconos sin dependencias externas.
- Referencias a los iconos en el manifest, en las meta tags de iOS y en el
  precacheo del service worker.

## [0.1] — Fase 0

### Añadido
- Scaffold del repo: estructura multi-página estática servida tal cual desde
  GitHub Pages.
- Hub (`index.html`, `css/hub.css`, `js/app.js`): cuatro tarjetas de juego en
  estado «próximamente», aviso de conexión y footer con la versión.
- `css/base.css`: reset, variables del tema oscuro neón y helpers de
  safe-area, incluida la superficie de juego `.game-stage`.
- `manifest.webmanifest` con rutas relativas para Project Pages.
- `service-worker.js`: cache-first con caché versionado, `skipWaiting()`,
  `clients.claim()` y limpieza de cachés antiguos.
- `js/shared/version.js` como única fuente de verdad de `APP_VERSION` y
  `CACHE_NAME`.
