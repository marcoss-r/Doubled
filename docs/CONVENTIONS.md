# Doubled — Convenciones de desarrollo

Complemento operativo de [`PLAN.md`](./PLAN.md): cómo se versiona, cómo se
escriben los commits y qué hay que revisar antes de dar por buena una fase.

---

## 1. Versionado

Formato `MAJOR.MINOR`, sin patch.

- **MAJOR** = juegos completados y publicados (0 mientras no haya ninguno).
- **MINOR** = hitos dentro de la fase en curso; se resetea a 0 al cerrar un MAJOR.

| Hito | Versión |
|---|---|
| Fase 0 · scaffold + shell PWA | 0.1 |
| Fase 0 · iconos PWA | 0.2 |
| Fase 0 · convenciones y changelog | 0.3 |
| Fase 0 · planes de desarrollo de los 4 juegos | 0.4 |
| Fase 1 · hitos de Air Hockey | 0.5, 0.6… |
| Fase 1 · Air Hockey completo | **1.0** |
| Fase 2 · Beer Pong completo | **2.0** |
| Fase 3 · Pong completo | **3.0** |
| Fase 4 · Hundir la flota completo | **4.0** |

### 1.1 Fuente única de verdad

`APP_VERSION` vive en **`js/shared/version.js`** y en ningún otro sitio.

```js
var APP_VERSION = '0.4';
var CACHE_NAME = 'doubled-v' + APP_VERSION;
```

Ese fichero se carga en dos contextos:

- en las páginas, como `<script>` antes de `app.js` (el hub pinta la versión en
  el footer);
- en el service worker, vía `importScripts('./js/shared/version.js')`, que
  deriva de ahí `CACHE_NAME`.

> **Nota sobre el plan.** `PLAN.md` §2.1 situaba `APP_VERSION` en `js/app.js`.
> Se movió a `js/shared/version.js` porque `app.js` toca el DOM y no puede
> ejecutarse dentro del service worker. La intención del plan —un único sitio
> del que salen versión y `CACHE_NAME`— se mantiene intacta.

Ventaja secundaria: el navegador compara los bytes de los scripts importados
por el service worker, así que **bumpear `APP_VERSION` basta** para que los
clientes ya instalados detecten la actualización.

---

## 2. Checklist obligatorio antes de cada commit

1. **¿He tocado algún asset cacheado** (HTML, CSS, JS, iconos, manifest)?
   → Bump de `APP_VERSION` en `js/shared/version.js`.
2. **¿He añadido o renombrado un fichero servido al cliente?**
   → Añadirlo al bloque correspondiente de `ASSET_BLOCKS` en
   `service-worker.js` (`shell`, o el bloque del juego).
3. **¿El bump cierra un hito (MINOR) o un juego (MAJOR)?**
   → Nueva entrada en `CHANGELOG.md`.
4. **Rutas relativas.** Ningún `href`, `src`, `fetch` o entrada del manifest
   empieza por `/`: el sitio vive en `/Doubled/` (Project Pages).
5. **Mensaje en Conventional Commits** (§3).

Un commit que sólo toca `docs/` es el único caso en el que los puntos 1–2 no
aplican; aun así, los hitos de documentación del plan (los planes de juego)
llevan bump de versión porque son hitos de MINOR.

---

## 3. Conventional Commits

```
tipo(scope): descripción en imperativo y minúscula
```

- **Tipos:** `feat`, `fix`, `chore`, `docs`, `refactor`, `style`, `perf`,
  `build`, `ci`.
- **Scopes:** `hub`, `pwa`, `sw`, `air-hockey`, `beer-pong`, `pong`,
  `battleship`, `docs`.

Ejemplos:

```
feat(air-hockey): mesa a pantalla completa con mitades rotadas
fix(sw): no cachear respuestas opacas de terceros
docs(battleship): plan de desarrollo del juego
chore(pwa): bump de versión a 0.5
```

Regla práctica: **un commit = un hito o un arreglo**. Nada de commits que
mezclan una funcionalidad nueva con el bump y tres arreglos sueltos.

---

## 4. Service worker

Estrategia y detalles en `PLAN.md` §1.3. En el día a día:

- El caché se llama `doubled-v<APP_VERSION>`. En `activate` se borra todo
  caché que empiece por `doubled-v` y no sea el actual.
- `skipWaiting()` en `install` y `clients.claim()` en `activate`: la versión
  nueva toma el control sin esperar a cerrar pestañas.
- El precacheo es asset a asset (no `cache.addAll`) para que un 404 suelto no
  aborte la instalación entera.
- Sólo se cachean respuestas `GET`, del mismo origen, `response.ok` y de tipo
  `basic`.
- **Al añadir un juego:** nuevo bloque en `ASSET_BLOCKS` con su HTML, CSS, JS y
  assets, y bump de versión.

### Cómo probar un cambio del service worker

1. Servir el repo por HTTP (los service workers no funcionan en `file://`):
   `npx serve .` o `python3 -m http.server 8080`.
2. DevTools → Application → Service Workers: confirmar que la versión nueva
   pasa a *activated* y que en Cache Storage sólo queda `doubled-v<nueva>`.
3. Marcar *Offline* y recargar: el hub debe seguir cargando.

---

## 5. Estilo de código

- HTML/CSS/JS vanilla, sin build step ni dependencias en runtime. Los scripts
  de `scripts/` son herramientas de desarrollo (Node) y no se sirven al cliente.
- JS de cliente en ES5 dentro de un IIFE (`'use strict'`), sin módulos ES: el
  service worker usa `importScripts` y el shell se sirve sin transpilar.
- Indentación de 2 espacios; comillas simples en JS, dobles en HTML.
- Nombres de clases CSS en BEM ligero: `.bloque__elemento--modificador`.
- Variables de diseño y helpers de safe-area sólo en `css/base.css`; el CSS de
  cada juego consume esas variables y no redefine la paleta.
- Textos de interfaz en **español**, con tildes correctas.

---

## 6. Accesibilidad y táctil (mínimos para dar un juego por cerrado)

- Objetivos táctiles de al menos 44×44 px (`--tap-min`).
- `touch-action: none` en las superficies de juego, nunca en la página entera.
- Zonas interactivas dentro de los límites de `.game-stage`, es decir, fuera
  del notch, la Dynamic Island y el home indicator.
- Contraste de texto mínimo 4.5:1 sobre su fondo.
- Respetar `prefers-reduced-motion` en animaciones decorativas.

---

## 7. Definition of done de una fase

Antes de cerrar un MAJOR (juego completo):

- [ ] Jugado de principio a fin en iPhone (Safari) y Android (Chrome) reales.
- [ ] Funciona instalado como PWA desde la pantalla de inicio, y offline.
- [ ] Sin bugs bloqueantes ni estados de los que no se pueda salir.
- [ ] Layout correcto en horizontal y vertical, o bloqueo explícito de la
      orientación no soportada con un mensaje claro.
- [ ] Tarjeta del juego activa en el hub (`ready: true` en `GAMES`, `js/app.js`).
- [ ] `CHANGELOG.md` y `APP_VERSION` actualizados.

---

## 8. Validación del shell PWA (Fase 0)

Checklist que hay que ejecutar en dispositivos reales; no se puede automatizar
desde el repo:

- [ ] **Android / Chrome:** aparece el aviso de instalación; instalado, abre en
      `standalone` sin barra de direcciones; el icono adaptativo se ve completo
      (sin recortar los círculos).
- [ ] **iOS / Safari:** «Añadir a pantalla de inicio» usa el
      `apple-touch-icon`; abierto desde el icono, el contenido no queda bajo la
      Dynamic Island ni bajo el home indicator.
- [ ] **Offline:** con modo avión, el hub carga y muestra el aviso «Sin
      conexión».
- [ ] **Actualización:** tras un bump de versión, recargar dos veces muestra la
      versión nueva en el footer y deja un único caché en Cache Storage.
- [ ] **Lighthouse** (Chrome DevTools, categoría PWA + Accesibilidad) sin
      errores rojos.
