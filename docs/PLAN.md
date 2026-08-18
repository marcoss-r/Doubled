# Doubled — Plan de desarrollo general

PWA de minijuegos para dos personas en un solo móvil (iPhone y Android), desplegada en GitHub Pages desde el repo `Doubled` (Project Pages → `https://<usuario>.github.io/Doubled/`).

Stack: **HTML + CSS + JS vanilla**, sin build step ni frameworks (todo se sirve tal cual desde `main`). Idioma de la interfaz: **español**.

Orden de los juegos y versión que cierran:
1. **Air Hockey** → v1.0
2. **Beer Pong** → v2.0
3. **Pong** → v3.0
4. **Hundir la flota** → v4.0

---

## 1. Arquitectura técnica

### 1.1 Estructura de carpetas (multi-página estática)

Cada juego es una página HTML independiente con su propio CSS/JS. Evita la complejidad de un router SPA y hace que cada Fase de desarrollo sea autocontenida.

```
/ (raíz del repo, se sirve tal cual en GitHub Pages)
├── index.html                  # Hub: menú de selección de juego
├── manifest.webmanifest
├── service-worker.js
├── /css
│   ├── base.css                 # reset, variables, tipografía, safe-area helpers
│   └── hub.css
├── /js
│   ├── app.js                   # registro del service worker, lógica del hub
│   └── /shared                  # utilidades comunes (storage, sonido, vibración, etc.)
├── /assets
│   └── /icons                   # iconos PWA (192/512/maskable) + apple-touch-icon
├── /games
│   ├── /air-hockey
│   │   ├── index.html
│   │   ├── air-hockey.css
│   │   └── air-hockey.js
│   ├── /beer-pong
│   ├── /pong
│   └── /battleship
└── /docs
    ├── PLAN.md                  # este documento
    ├── CONVENTIONS.md           # commits, versionado, checklist del service worker
    └── /games
        ├── air-hockey.md        # plan de desarrollo del juego (se escribe en Fase 0)
        ├── beer-pong.md
        ├── pong.md
        └── battleship.md
```

Todas las rutas dentro del código (manifest, service worker, `<link>`, `fetch`) se referencian en **relativo** (`./`, `../`), nunca con `/` inicial, porque el sitio vive en un subpath (`/Doubled/`) en Project Pages.

### 1.2 PWA shell y safe areas (iOS + Android)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` en todas las páginas — imprescindible para que `env(safe-area-inset-*)` funcione y el contenido no quede debajo del notch/Dynamic Island/home indicator.
- En `base.css`, el contenedor raíz de cada página aplica:
  ```css
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
  ```
  y las zonas de juego a pantalla completa (air hockey, pong) tratan esos insets como límites de la mesa/tablero, no solo como padding cosmético — importante porque el layout exacto (orientación, mitades rotadas, etc.) lo decide cada juego en su propia Fase 0.
- Meta tags iOS para instalación: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon` (varios tamaños), `theme-color`.
- `manifest.webmanifest`: `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `background_color`, `theme_color`, iconos 192/512 + versión `maskable` (obligatoria para Android adaptive icons).
- `orientation` del manifest se deja en `"any"` a nivel global; si un juego concreto necesita forzar landscape lo hace con CSS/JS propio (Screen Orientation API donde esté disponible, con fallback porque iOS Safari no la soporta bien), definido en su plan individual.

### 1.3 Service worker

- Cache-first para el app shell (hub + assets comunes) y por-juego (cada carpeta de juego se cachea como su propio bloque de assets).
- **Cache con nombre versionado**: `CACHE_NAME = 'doubled-v<versión>'`. En `activate`, se borran cachés antiguos que no coincidan con el nombre actual.
- **Regla de oro: el service worker se toca en cada commit que cambie cualquier asset cacheado** (HTML/CSS/JS/icons) — como mínimo hay que bumpear `CACHE_NAME` para que los clientes ya instalados reciban la versión nueva. Esto se documenta como checklist obligatorio en `docs/CONVENTIONS.md` y se recuerda en la plantilla de PR/commit.
- `skipWaiting()` + `clients.claim()` en el SW para que la nueva versión tome control sin esperar a cerrar todas las pestañas; opcional (backlog) mostrar un toast "nueva versión disponible, recarga" en el hub.

---

## 2. Versionado y commits

### 2.1 Esquema de versión

Formato `MAJOR.MINOR` (sin patch):

- **MAJOR** = número de juegos completados y publicados (0 mientras no hay ninguno terminado).
- **MINOR** = hitos dentro de la fase en curso (setup, mecánica base, controles, pulido...), se resetea a 0 al cerrar un MAJOR.

| Hito | Versión |
|---|---|
| Fase 0: scaffold inicial del repo (hub, manifest, SW vacíos) | 0.1 |
| Fase 0: resto de hitos de setup (planes de cada juego, iconos, shell offline) | 0.2, 0.3... |
| Fase 1: hitos de desarrollo de Air Hockey | 0.x (continúa) |
| Fase 1: Air Hockey completo | **1.0** |
| Fase 2: hitos de Beer Pong | 1.1, 1.2... |
| Fase 2: Beer Pong completo | **2.0** |
| Fase 3: hitos de Pong | 2.1, 2.2... |
| Fase 3: Pong completo | **3.0** |
| Fase 4: hitos de Hundir la flota | 3.1, 3.2... |
| Fase 4: Hundir la flota completo | **4.0** |

La versión actual vive en un único sitio de verdad para evitar desincronización: constante `APP_VERSION` en `js/app.js`, usada para generar `CACHE_NAME` en el service worker y mostrada en el footer del hub. `docs/CONVENTIONS.md` incluye un `CHANGELOG.md` en la raíz que se actualiza junto a cada bump.

### 2.2 Conventional Commits

Formato `tipo(scope): descripción`, tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `perf`, `build`, `ci`. Scope sugerido: `hub`, `pwa`, `sw`, `air-hockey`, `beer-pong`, `pong`, `battleship`.

Checklist antes de cada commit que toque assets cacheados (definido con detalle en `docs/CONVENTIONS.md`):
1. ¿Cambié HTML/CSS/JS/iconos? → bump de `APP_VERSION` y `CACHE_NAME` en el service worker.
2. ¿El bump de versión corresponde a un hito de MINOR o cierra un juego (MAJOR)? → actualizar `CHANGELOG.md`.
3. Mensaje de commit en formato conventional commits.

---

## 3. Fases de desarrollo

### Fase 0 — Fundaciones del proyecto
- Scaffold del repo: estructura de carpetas de la sección 1.1.
- Hub (`index.html` + `hub.css` + `app.js`): menú con las 4 tarjetas de juego, footer con versión, registro del service worker.
- `manifest.webmanifest` + iconos (192/512/maskable/apple-touch-icon) — placeholders simples si no hay branding definido todavía.
- `base.css` con reset, variables de diseño y helpers de safe-area.
- `service-worker.js` con cacheo del app shell y estrategia de versionado (sección 1.3).
- `docs/CONVENTIONS.md`: commits, versionado, checklist del service worker.
- **Plan de desarrollo individual de cada juego** (`docs/games/*.md`): reglas, mecánica de turnos/tiempo real, controles táctiles, orientación/layout específico, assets necesarios, estructura de estados. Se escriben los 4 antes de empezar a programar ningún juego, en el orden air-hockey → beer-pong → pong → battleship.
- Validación del shell PWA: instalación en iOS Safari y Android Chrome, funcionamiento offline del hub, Lighthouse PWA audit.
- Cierra en torno a v0.3–0.5 (varios commits pequeños), sin llegar aún a 1.0.

### Fase 1 — Air Hockey (→ v1.0)
- Implementación siguiendo `docs/games/air-hockey.md`.
- Entra como tarjeta activa en el hub (las otras 3 quedan como "próximamente" hasta su fase).
- Cierra con v1.0 cuando el juego esté completo y pulido (sin bugs bloqueantes, testeado en iPhone y Android reales).

### Fase 2 — Beer Pong (→ v2.0)
- Implementación siguiendo `docs/games/beer-pong.md`.

### Fase 3 — Pong (→ v3.0)
- Implementación siguiendo `docs/games/pong.md`.

### Fase 4 — Hundir la flota (→ v4.0)
- Implementación siguiendo `docs/games/battleship.md`.

---

## 4. Próximos pasos

1. Confirmar/ajustar este documento.
2. Empezar Fase 0: scaffold del repo + shell PWA.
3. Redactar los 4 planes de juego en `docs/games/`.
