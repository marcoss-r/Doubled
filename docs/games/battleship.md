# Hundir la flota — Plan de desarrollo (Fase 4 → v4.0)

Cuarto y último juego. Por turnos, con información oculta: el móvil se pasa de
mano en mano y nadie puede ver el tablero del rival.

---

## 1. Resumen

Cada jugador coloca su flota en un tablero de 8×8 y después se alternan disparos
tocando casillas del tablero contrario. La particularidad frente a los otros
tres juegos es la **información oculta**: entre turno y turno hay siempre una
pantalla de traspaso opaca, y el tablero propio nunca se muestra mientras el
rival tiene el móvil en la mano.

Es el único juego que **no usa canvas**: el tablero es una rejilla de elementos
DOM con CSS Grid. Es un juego de casillas discretas, y el DOM da gratis
accesibilidad, objetivos táctiles y animaciones.

---

## 2. Reglas

- Tablero de **8×8** (no 10×10: en un móvil, 100 casillas dan objetivos táctiles
  por debajo del mínimo cómodo).
- Flota de **5 barcos**: portaaviones (4), crucero (3), submarino (3),
  destructor (2), patrullera (2). 14 casillas ocupadas de 64.
- Colocación en horizontal o vertical, sin diagonales, sin solapes y **sin
  contacto entre barcos** (ni siquiera en diagonal): elimina las configuraciones
  degeneradas de barcos pegados y hace más limpia la deducción.
- Disparo: se toca una casilla del tablero rival. **Tocado → repites turno**;
  agua → pasa el turno. Al hundir un barco se anuncia cuál era.
- Una casilla ya disparada no se puede repetir (la interfaz la desactiva).
- Gana quien hunde los 5 barcos del rival primero.

---

## 3. Orientación y layout

- **Orientación fija: vertical (portrait)**, con el mismo aviso «Gira el móvil»
  que el resto de juegos.
- La interfaz **no se rota**: siempre mira a quien tiene el móvil.
- Dentro de `.game-stage`:

  ```
  ┌──────────────────────┐
  │ turno de X · flota   │  HUD: de quién es el turno y barcos que le quedan
  ├──────────────────────┤
  │  ▦▦▦▦▦▦▦▦            │
  │  ▦▦▦▦▦▦▦▦            │  tablero de disparo (el del rival)
  │  ▦▦▦▦▦▦▦▦            │  cuadrado, ocupa el ancho disponible
  │  ▦▦▦▦▦▦▦▦            │
  ├──────────────────────┤
  │  mini-tablero propio │  vista reducida: dónde me han dado
  └──────────────────────┘
  ```

- El tablero de disparo es **cuadrado** y ocupa el ancho del stage menos los
  márgenes; con 8 columnas, cada casilla queda muy por encima de los 44 px de
  objetivo táctil mínimo en cualquier móvil actual.
- El mini-tablero propio es informativo, no interactivo, y se puede ampliar con
  un toque (overlay a pantalla completa que se cierra al soltar).
- Coordenadas A–H / 1–8 en los bordes, para poder cantar tiradas en voz alta.

---

## 4. Controles táctiles

### Colocación

- Lista de barcos pendientes abajo; se toca uno para seleccionarlo y se toca la
  casilla donde va su proa. Botón **Girar** para alternar horizontal/vertical
  antes de colocar.
- Previsualización en vivo: las casillas que ocuparía se resaltan en verde si la
  posición es válida y en rojo si no (solape, contacto o fuera del tablero).
- Un barco ya colocado se puede **volver a tocar para recogerlo** y recolocarlo.
- Botón **Aleatorio** que coloca la flota entera de golpe: es la opción que usa
  casi todo el mundo, así que va destacada, no escondida.
- Sin arrastrar: en un tablero pequeño, tocar–tocar es más preciso que un drag
  con el dedo tapando la previsualización.

### Disparo

- Se toca la casilla y se confirma con un **segundo toque** en la misma casilla
  (o con el botón «Disparar» que aparece al seleccionar). El doble paso evita
  disparos accidentales irreversibles al coger el móvil.
- Tras el disparo, animación de impacto y anuncio: «Agua», «Tocado» o «Hundido:
  crucero».
- **Feedback:** vibración corta en agua, doble en tocado, larga en hundido;
  sonidos diferenciados.

---

## 5. Traspaso del móvil e información oculta

El punto crítico del juego: si en algún momento se ve el tablero del rival, la
partida se rompe.

- Entre **cada cambio de jugador** se interpone la pantalla `HANDOVER`
  (`js/shared/handover.js`, creada en Fase 2): fondo opaco a pantalla completa
  con «Pasa el móvil a X» y un botón grande «Estoy listo».
- La pantalla de traspaso aparece también tras la colocación de cada flota.
- El tablero del jugador que no tiene el turno **no se renderiza**, no sólo se
  oculta con CSS: nada sensible en el DOM visible.
- La partida se guarda en `localStorage` en cada transición de estado; al volver
  a abrirla se reanuda **siempre en `HANDOVER`**, nunca directamente en el
  tablero de alguien.

---

## 6. Máquina de estados

```
┌──────────┐
│  SETUP   │  nombres de los dos jugadores
└────┬─────┘
     ▼
┌──────────┐     ┌────────────┐
│ HANDOVER ├────►│ PLACEMENT  │  jugador A coloca su flota
└──────────┘     └─────┬──────┘
     ▲                 ▼
     │           ┌────────────┐
     └───────────┤ PLACEMENT  │  jugador B coloca su flota
                 └─────┬──────┘
                       ▼
                 ┌──────────┐  tocado → repite
                 │  TURN    │◄──────────┐
                 └────┬─────┘           │
                      ▼                 │
                 ┌──────────┐  agua     │
                 │ RESOLVE  ├───────────┤
                 └────┬─────┘  → HANDOVER
                      │ flota hundida
                      ▼
                 ┌──────────┐
                 │ GAMEOVER │  revancha / volver al hub
                 └──────────┘
```

- El estado completo (dos tableros, flotas, disparos, turno) es un objeto
  serializable; el render es función de ese objeto, filtrado por el jugador
  activo.

---

## 7. Ficheros y assets

```
games/battleship/
├── index.html
├── battleship.css
└── battleship.js
```

- **Sin canvas y sin imágenes:** rejilla con CSS Grid, estados de casilla por
  clases (`--agua`, `--tocado`, `--hundido`), barcos dibujados con bordes y
  color `--c-battleship`.
- Consume `js/shared/handover.js`, `storage.js`, `audio.js` y las utilidades ya
  existentes; no necesita el bucle de tiempo real.
- Accesibilidad: cada casilla es un `<button>` con `aria-label` del tipo
  «C4, sin disparar»; el tablero es una `role="grid"`. Es el juego donde esto
  sale casi gratis y conviene aprovecharlo.
- Alta del bloque `'battleship'` en `ASSET_BLOCKS` del service worker.

---

## 8. Hitos de la fase

| Hito | Versión |
|---|---|
| Shell del juego, rejilla 8×8, alta en hub y SW | 3.1 |
| Colocación manual con previsualización, validación y botón Aleatorio | 3.2 |
| Traspaso del móvil y colocación de las dos flotas | 3.3 |
| Turnos de disparo, tocado/hundido, mini-tablero propio | 3.4 |
| Guardado y reanudación de partida, gameover, revancha | 3.5 |
| Sonido, vibración, accesibilidad, pulido y pruebas reales | **4.0** |

---

## 9. Riesgos y decisiones abiertas

- **Duración de la partida:** 8×8 con 14 casillas ocupadas y «tocado repites»
  puede alargarse. Si en pruebas reales pasa de ~10 minutos, la palanca es
  reducir el tablero a 7×7 antes que tocar la flota.
- **Fugas de información:** el riesgo específico de este juego. Antes de cerrar
  la fase, comprobar explícitamente que ni al recargar, ni al volver de segundo
  plano, ni con la partida guardada aparece el tablero de nadie sin pasar por
  `HANDOVER`.
- **Regla de no contacto entre barcos:** endurece la colocación manual en un
  tablero pequeño. Si resulta molesta al colocar a mano, se relaja a permitir
  contacto en diagonal.
- **Confirmación de disparo:** el doble toque protege de accidentes pero añade
  fricción. Si en pruebas resulta pesado, se cambia por toque único con
  posibilidad de deshacer durante 1,5 s.
