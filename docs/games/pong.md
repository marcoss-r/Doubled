# Pong — Plan de desarrollo (Fase 3 → v3.0)

Tercer juego. Tiempo real, dos jugadores simultáneos, el clásico de 1972
adaptado a un móvil en vertical.

---

## 1. Resumen

El móvil se coloca **plano sobre la mesa**, igual que en Air Hockey, con un
jugador a cada lado. Cada uno controla una pala que se desplaza en horizontal
por su borde de la pantalla; la bola rebota entre ambas y en las paredes
laterales. Quien deja pasar la bola encaja un punto.

Reutiliza directamente la arquitectura de tiempo real que Air Hockey deja en
`js/shared/` (`loop.js`, `input.js`, `audio.js`), así que es la fase más corta
del proyecto. Su valor es de contraste: mismas piezas, reglas mucho más simples.

---

## 2. Reglas

- Gana el primero en llegar a **11 puntos con 2 de diferencia**; si se llega a
  10-10, se juega a diferencia de 2 sin tope.
- La bola sale del centro tras una cuenta atrás de 2 s, hacia el jugador que
  acaba de encajar el punto.
- El **ángulo de rebote depende del punto de impacto** en la pala: centro →
  rebote recto, extremos → ángulo muy abierto. Es la mecánica que da profundidad
  al juego; no es una reflexión física pura.
- La bola **acelera un 4 % en cada golpeo**, hasta un tope del doble de su
  velocidad inicial. La velocidad se reinicia en cada punto.
- Si un peloteo supera los 30 golpeos, la bola deja de acelerar y se estrecha la
  pala un 10 % cada 10 golpeos adicionales (rompe empates eternos).

---

## 3. Orientación y layout

- **Orientación fija: vertical (portrait)**, con el mismo aviso «Gira el móvil»
  que los demás juegos.
- Dentro de `.game-stage`, las **palas se apoyan en los bordes superior e
  inferior del rectángulo seguro**: no hay porterías que puedan quedar bajo la
  Dynamic Island ni bajo el home indicator, y el dedo tiene siempre superficie
  táctil real donde apoyarse.

  ```
  ┌──────────────────────┐
  │      ▭ pala B        │  ← borde superior seguro
  │                      │
  │   ·                  │  paredes laterales: rebote
  │           ●          │
  │                      │
  ├─── 0 ─── | ─── 0 ────┤  marcador en la línea central (uno rotado 180°)
  │                      │
  │      ▭ pala A        │  ← borde inferior seguro
  └──────────────────────┘
  ```

- Marcador central con el del jugador B **rotado 180°**, igual que en Air Hockey.
- Estética deliberadamente retro: línea central discontinua, formas
  rectangulares, tipografía monoespaciada del marcador, acento `--c-pong`.
- Render en `<canvas>`; el HUD (pausa, avisos) en DOM encima.

---

## 4. Controles táctiles

- **Dos punteros simultáneos**, asignados por mitad de pantalla, con la misma
  utilidad `js/shared/input.js` que Air Hockey.
- La pala sigue la **coordenada X del dedo**, limitada a los laterales. La Y del
  dedo se ignora por completo: el jugador puede apoyar el dedo donde le resulte
  cómodo dentro de su mitad, no hace falta tocar la pala.
- Zona muerta: los primeros 3 px de movimiento se descartan para que un dedo
  apoyado y quieto no tiemble.
- **Feedback:** pitido corto y agudo al golpear con la pala, más grave en la
  pared, descendente al encajar punto; vibración breve en el golpeo (donde la
  API exista).

---

## 5. Física

- Mismo **bucle de paso fijo** (`dt = 1/120 s`) que Air Hockey, vía
  `js/shared/loop.js`.
- La bola es un cuadrado tratado como círculo para las colisiones; las palas son
  rectángulos AABB.
- Colisión bola–pala: se comprueba el **cruce del segmento** recorrido en el paso
  contra el plano de la pala, no sólo el solape final. Con la bola acelerada, la
  comprobación por solape falla y la bola atraviesa la pala.
- Tras el golpeo, el ángulo de salida se calcula desde el desplazamiento
  relativo del impacto respecto al centro de la pala (`offset ∈ [-1, 1]`), con
  un ángulo máximo de 60° respecto a la vertical. La velocidad del dedo **no**
  se transfiere: aquí, a diferencia del air hockey, el control es de posición.
- Ángulo mínimo respecto a la horizontal para que la bola no quede rebotando
  eternamente entre las paredes laterales.

---

## 6. Máquina de estados

Idéntica a la de Air Hockey (`READY → COUNTDOWN → PLAYING → COUNTDOWN` con
`PAUSED` y `GAMEOVER`), lo que permite reutilizar el patrón sin abstraerlo
prematuramente: se copia y se adapta, y sólo si Fase 4 lo necesitara también se
extraería a `js/shared/`.

- Pausa automática en `visibilitychange`, reanudación siempre con cuenta atrás.
- `GAMEOVER` con «Revancha» y «Volver al hub».

---

## 7. Ficheros y assets

```
games/pong/
├── index.html
├── pong.css
└── pong.js
```

- Sin imágenes ni sonidos en fichero: primitivas de canvas y osciladores Web
  Audio.
- Consume `js/shared/loop.js`, `input.js`, `audio.js` y `storage.js` sin
  añadir utilidades nuevas. Si al implementarlo alguna de ellas necesita cambios,
  **hay que revalidar Air Hockey** antes de cerrar la fase: son código
  compartido y ya publicado.
- Alta del bloque `'pong'` en `ASSET_BLOCKS` del service worker.

---

## 8. Hitos de la fase

| Hito | Versión |
|---|---|
| Shell del juego, alta en hub y SW, bola rebotando en un rectángulo | 2.1 |
| Palas, control táctil por mitades y colisión con ángulo por impacto | 2.2 |
| Puntuación, saques, marcador rotado y regla de los 2 puntos | 2.3 |
| Aceleración, regla anti-peloteo eterno, pausa y gameover | 2.4 |
| Sonido, pulido retro y pruebas en dispositivos reales | **3.0** |

---

## 9. Riesgos y decisiones abiertas

- **Reutilización de `js/shared/`:** el riesgo real de esta fase es romper Air
  Hockey al tocar código compartido. Regla: cualquier cambio en `js/shared/`
  obliga a volver a jugar una partida completa de Air Hockey antes del commit.
- **Anchura de la pala:** demasiado ancha aburre, demasiado estrecha frustra en
  pantalla pequeña. Punto de partida: 22 % del ancho jugable, ajustable con
  pruebas reales.
- **Dedo sobre la pala:** si los jugadores tienden a tapar su propia pala con el
  dedo, se separa la pala unos píxeles del borde para que quede visible por
  encima del dedo.
- **Velocidad máxima:** validar que a tope de velocidad la bola sigue siendo
  seguible en una pantalla de 6″; si no, bajar el multiplicador antes que la
  aceleración por golpeo.
