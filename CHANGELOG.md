# Changelog

Todas las versiones publicadas de Doubled. Formato `MAJOR.MINOR` según
[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md).

## [1.1] — Air Hockey: marcador lateral

### Cambiado
- El marcador deja el centro de la mesa (donde quedaba tapado por el disco
  y los malletes en cuanto había partida en marcha) y pasa a una franja fija
  en el lateral derecho, separada del área jugable por una línea divisoria.
  El área jugable se estrecha en consecuencia (reserva un 18% del lado corto
  para la franja).
- Los dígitos del marcador van rotados 90° en sentido horario: se leen del
  derecho girando el móvil a horizontal con el lateral derecho hacia arriba,
  en vez de plantados en vertical. Marcador de B arriba, de A abajo, mismo
  sentido de lectura para ambos (ya no van uno rotado 180° respecto al otro,
  al no compartir posición con la línea central).

## [1.0] — Air Hockey completo (cierre de Fase 1)

### Añadido
- Tarjeta de Air Hockey activa en el hub (deja de ser "próximamente").
- `js/shared/register-sw.js`: registro del service worker extraído a
  utilidad compartida y llamado desde **cada página**, no sólo desde el
  hub, para que cualquiera pueda ser la primera visitada sin perder
  soporte offline.

### Arreglado
- El service worker sólo registraba desde `js/app.js` (hub): entrar
  directamente a `/games/air-hockey/` no registraba nada, y sin registro
  previo el modo offline no funcionaba en absoluto para quien no hubiera
  pasado antes por el hub.
- Precacheo de páginas bajo su URL de directorio además de su nombre de
  fichero explícito (`.../index.html` → también `.../`): es la forma en la
  que realmente se navega (enlaces del hub, marcadores), y sin el
  duplicado una navegación offline a esa URL cae al fallback genérico y
  sirve el hub en vez de la página pedida. Detectado al validar Air Hockey
  offline entrando directamente al juego.

Validado en Chromium headless: partida completa (ready → countdown →
goles en ambas porterías → pausa → mute → gameover-path), navegación
hub↔juego, aviso de orientación en horizontal, y los tres escenarios
offline (hub, juego entrando directo, navegación hub→juego sin red).

## [0.10] — Fase 1

### Añadido
- `js/shared/storage.js`: helpers de `localStorage` con degradación
  silenciosa si no está disponible (modo privado de Safari, etc.).
- `js/shared/audio.js`: sonidos sintetizados con Web Audio (sin ficheros),
  vibración y mute persistido, con desbloqueo de audio en el primer toque.
- Pantalla `READY` («Toca para jugar») que desbloquea el audio y arranca la
  primera cuenta atrás.
- Pausa manual (botón) y automática (`visibilitychange`); siempre se
  reanuda con una nueva cuenta atrás, nunca en caliente.
- Fin de partida a 7 goles, con marcador ganador y opciones de «Revancha»
  (reinicia el marcador) o «Volver al hub».
- Botón de silenciar/activar sonido, con el icono reflejando el estado.
- Sonido y vibración al golpear el disco y al marcar gol.

## [0.9] — Fase 1

### Añadido
- Goles en Air Hockey: bocas de portería en el centro de los bordes superior
  e inferior; el disco que sale por ellas anota, y por el resto del borde
  rebota como una banda más.
- Cuenta atrás de 2 s tras cada gol, con saque automático hacia el jugador
  que ha encajado.
- Marcador dibujado en el canvas junto a la línea central, con el número de
  B rotado 180° para que se lea desde su lado.
- Recolocación del disco si queda casi parado más de 5 s en una mitad.

Sin límite de puntuación ni pantalla de fin de partida todavía: llegan en
el hito 0.10, junto con pausa, sonido y vibración.

## [0.8] — Fase 1

### Añadido
- `js/shared/input.js`: asignación de hasta dos punteros simultáneos por
  mitad de pantalla (`top`/`bottom`), reutilizable por cualquier juego con
  dos jugadores encarados.
- Segundo mallet en Air Hockey: cada jugador controla el suyo, limitado a su
  mitad de la mesa; el mallet no cruza la línea central aunque el dedo sí lo
  haga. Validado con dos toques simultáneos en Chromium headless.

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
