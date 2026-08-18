# Air Hockey — Plan de desarrollo (Fase 1 → v1.0)

Primer juego de Doubled. Tiempo real, dos jugadores simultáneos sobre el mismo
móvil apoyado en una mesa entre ambos.

---

## 1. Resumen

El móvil se coloca **plano sobre la mesa**, en vertical, con un jugador a cada
lado del lado corto. La pantalla es la mesa de air hockey completa: cada jugador
controla su mano (*mallet*) con un dedo dentro de su mitad y trata de meter el
disco en la portería contraria.

Es el juego que fija la arquitectura de tiempo real del proyecto (bucle de
render, entrada multitáctil, colisiones), que Pong reutilizará en Fase 3.

---

## 2. Reglas

- Gana el primero en marcar **7 goles**.
- Cada jugador controla un mallet limitado a **su mitad de la mesa**; no puede
  cruzar la línea central.
- El disco rebota en las bandas laterales y en los fondos, salvo en el hueco de
  la portería.
- Tras un gol: cuenta atrás de 2 s y saque desde el centro **hacia el jugador
  que ha encajado** el gol.
- El disco tiene velocidad máxima; si se queda casi parado más de 5 s en una
  mitad, se recoloca en el centro de esa mitad (evita bloqueos).
- No hay faltas ni límite de tiempo: partida a goles.

---

## 3. Orientación y layout

- **Orientación fija: vertical (portrait).** En horizontal se muestra un aviso
  «Gira el móvil» que bloquea la partida; no se intenta forzar la orientación
  con la Screen Orientation API porque iOS Safari no la soporta.
- Todo se dibuja dentro de `.game-stage` (ver `css/base.css`), cuyo rectángulo
  ya descuenta los safe-area insets. Los **fondos de la mesa coinciden con los
  bordes de ese rectángulo**, de modo que las porterías nunca caen bajo la
  Dynamic Island ni bajo el home indicator.
- Reparto vertical del área jugable:

  ```
  ┌──────────────────────┐  ← borde superior = fondo del jugador B
  │  portería B        ⟨B│  ← pestaña de marcador de B (pequeña)
  │                      │
  │   mitad de B         │
  ├──── línea central ───┤
  │   mitad de A         │
  │                      │
  │  portería A        ⟨A│  ← pestaña de marcador de A (pequeña)
  └──────────────────────┘  ← borde inferior = fondo del jugador A
  ```

- **Marcador minimalista, no en el centro:** un marcador plantado sobre la
  línea de medio campo queda tapado por el disco y los malletes en cuanto hay
  partida en marcha (detectado al jugar de verdad, no en el diseño sobre el
  papel); una franja lateral a todo el alto también resultó excesiva. La
  solución final es una **pestaña pequeña por jugador**, con forma de
  trapecio y esquinas redondeadas, pegada al borde derecho de la mesa —no
  ocupa todo el alto de la pantalla—, con el borde de la pestaña teñido del
  color de cada jugador (magenta B, cian A). El dígito va **más pequeño que
  la bola** y rotado 90° en sentido horario (`ctx.rotate(Math.PI/2)`), para
  leerse del derecho girando el móvil a horizontal con el lateral derecho
  hacia arriba.
- La mesa se dibuja en un único `<canvas>` a resolución de dispositivo
  (`devicePixelRatio`, con tope de 3 para no penalizar el rendimiento en
  pantallas grandes). La UI no jugable (botón de pausa, avisos) va en DOM sobre
  el canvas.

---

## 4. Controles táctiles

- **Pointer Events** con `setPointerCapture`, no touch events: unifica dedo y
  ratón (útil para depurar en escritorio).
- Se admiten **dos punteros simultáneos**. El puntero se asigna al jugador cuya
  mitad contiene el `pointerdown`; mantiene esa asignación hasta el `pointerup`
  aunque el dedo cruce la línea central (el mallet sí queda clavado en el
  límite).
- Un tercer puntero se ignora. Si un jugador ya tiene puntero activo, un segundo
  dedo suyo también se ignora.
- El mallet **sigue al dedo** (no es un joystick): se mueve a la posición del
  puntero limitada a su mitad y al interior de las bandas. La velocidad del
  mallet se calcula por diferencia de posición entre frames y es la que se
  transfiere al disco al golpear.
- `touch-action: none` y `user-select: none` sobre el stage (ya en la clase
  `.no-touch-gestures` de `base.css`) para matar scroll, zoom y menú contextual.
- **Feedback:** vibración corta (`navigator.vibrate(10)`) al golpear el disco y
  patrón largo al marcar, siempre que la API exista (no está en iOS). Sonido con
  Web Audio, desbloqueado en el primer toque, y silenciable desde la pausa.

---

## 5. Física

Simulación 2D sencilla con **paso de tiempo fijo** (`dt = 1/120 s`) y
acumulador, desacoplada del `requestAnimationFrame`. Motivo: a 120 Hz de pantalla
o con frames caídos, un paso variable rompe las colisiones.

- Disco y mallets son **círculos**; el disco tiene fricción baja
  (`v *= 0.995` por paso) y velocidad máxima.
- **Colisión disco–banda:** reflexión del componente normal con restitución 0.92.
- **Colisión disco–mallet:** resolución de solape + impulso; se suma parte de la
  velocidad del mallet a la del disco (el mallet se considera de masa infinita,
  no rebota).
- **Anti-tunneling:** con velocidades altas el disco puede atravesar el mallet o
  la banda en un solo paso. Se subdividen los pasos cuando el desplazamiento del
  frame supera el radio del disco.
- Toda la geometría se guarda en **coordenadas normalizadas** (0–1 sobre el lado
  corto) y se escala al pintar: la partida se comporta igual en cualquier
  pantalla.

---

## 6. Máquina de estados

```
        ┌──────────┐
        │  READY   │  «Tocad para empezar» (desbloqueo de audio)
        └────┬─────┘
             ▼
        ┌──────────┐   3·2·1
        │ COUNTDOWN│◄────────────┐
        └────┬─────┘             │
             ▼                   │
        ┌──────────┐   gol       │
        │ PLAYING  ├─────────────┘
        └──┬────┬──┘
     pausa │    │ 7º gol
           ▼    ▼
     ┌────────┐ ┌──────────┐
     │ PAUSED │ │ GAMEOVER │  revancha / volver al hub
     └────────┘ └──────────┘
```

- `PAUSED` se activa con el botón de pausa y **automáticamente** con
  `visibilitychange` (llamada entrante, cambio de app): al volver se reanuda con
  cuenta atrás, nunca en caliente.
- `GAMEOVER` ofrece «Revancha» (reinicia marcador) y «Volver al hub».
- El estado vive en un único objeto `state` serializable; el render es función
  pura de ese objeto.

---

## 7. Ficheros y assets

```
games/air-hockey/
├── index.html        # shell: canvas, HUD, avisos de orientación
├── air-hockey.css    # layout del stage, marcador rotado, HUD
└── air-hockey.js     # estado, física, entrada, render
```

- **Sin imágenes ni fuentes externas:** todo se dibuja con primitivas de canvas
  (círculos, líneas, gradientes) usando la paleta de `base.css`
  (`--c-air-hockey` como acento).
- Sonidos **sintetizados con Web Audio** (osciladores cortos), no ficheros: cero
  peso extra y nada que precachear.
- Utilidades que se extraen a `js/shared/` al implementarlas, porque Pong las
  reutilizará: `loop.js` (bucle de paso fijo), `input.js` (asignación de
  punteros por mitad), `audio.js` (sonidos sintetizados y mute persistente),
  `storage.js` (preferencias en `localStorage`).
- Alta en el service worker: bloque `'air-hockey'` en `ASSET_BLOCKS` con los
  tres ficheros del juego y las utilidades compartidas nuevas.

---

## 8. Hitos de la fase

| Hito | Versión |
|---|---|
| Shell del juego: página, canvas escalado, aviso de orientación, alta en el SW | 0.6 |
| Física base: disco, bandas, un mallet movido con el ratón | 0.7 |
| Entrada multitáctil real y límites por mitad | 0.8 |
| Goles, marcador rotado, saques y cuenta atrás | 0.9 |
| Pausa, gameover, revancha, sonido y vibración | 0.10 |
| Pulido, alta en el hub y pruebas en iPhone y Android reales | **1.0** |

---

## 9. Riesgos y decisiones abiertas

- **Rendimiento en iPhone con pantalla grande:** si el canvas a
  `devicePixelRatio` 3 no sostiene 60 fps, se baja el tope a 2. Medir antes de
  optimizar nada más.
- **Tamaño del mallet frente al dedo:** el dedo tapa el mallet. Punto de partida:
  mallet algo mayor que la huella del dedo y disco claramente más pequeño; se
  ajusta con pruebas reales.
- **Latencia táctil en Safari:** si se nota arrastre, probar `pointerrawupdate`
  donde exista, con `pointermove` como respaldo.
- **Ergonomía del móvil plano:** validar pronto con dos personas reales que la
  mitad de pantalla basta para maniobrar; si no, reducir el radio del mallet
  antes que cambiar el layout.
