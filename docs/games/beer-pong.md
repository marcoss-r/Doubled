# Beer Pong — Plan de desarrollo (Fase 2 → v2.0)

Segundo juego. Por turnos, con el móvil pasando de mano en mano y un gesto de
deslizamiento para lanzar.

---

## 1. Resumen

Cada jugador ve la formación de vasos del rival en la mitad superior de la
pantalla y lanza la pelota con un **swipe** desde la mitad inferior: la
dirección del gesto marca el ángulo y su velocidad marca la potencia. La pelota
describe una parábola en perspectiva y cae sobre la mesa; si entra en un vaso,
ese vaso se retira.

Es el primer juego **por turnos**, así que fija el patrón de traspaso del móvil
que reutilizará Hundir la flota: pantalla intermedia «Pasa el móvil a X» entre
turno y turno.

---

## 2. Reglas

- Cada jugador empieza con **10 vasos** en formación triangular (4-3-2-1).
- Turno = **2 lanzamientos**. Los vasos acertados se retiran al terminar el
  turno completo.
- Si un jugador **acierta los dos** lanzamientos del turno, recupera la pelota y
  tira una vez más (*balls back*, una sola vez por turno).
- Cuando quedan **6, 3 y 1 vasos**, la formación se **reagrupa** automáticamente
  (triángulo, triángulo, vaso centrado): mantiene la dificultad estable y evita
  huecos raros.
- Gana quien elimina los 10 vasos del rival. El rival tiene entonces **tiro de
  redención**: un turno extra para igualar; si lo consigue, muerte súbita a 3
  vasos por bando.
- Sin reglas de casa (ni *bounce*, ni *trick shots*): quedan en el backlog.

---

## 3. Orientación y layout

- **Orientación fija: vertical (portrait)**, con el mismo aviso «Gira el móvil»
  que Air Hockey. El móvil se sujeta con la mano, no se apoya en la mesa.
- Al ser por turnos, la interfaz **no se rota** ni se duplica: siempre mira al
  jugador que tiene el móvil.
- Reparto de pantalla dentro de `.game-stage`:

  ```
  ┌──────────────────────┐
  │  turno · marcador    │  HUD superior
  ├──────────────────────┤
  │      ▲               │
  │   vasos del rival    │  mesa en perspectiva (fuga hacia arriba)
  │      ·               │
  │                      │
  ├──────────────────────┤
  │   zona de swipe      │  ~40 % inferior, pulgar cómodo
  │   ● pelota           │
  └──────────────────────┘
  ```

- La zona de swipe ocupa el tercio inferior porque es donde llega el pulgar con
  el móvil en una mano; la parte alta queda sólo para mirar.
- Perspectiva **falsa**: la mesa es un trapecio y los vasos son elipses cuyo
  tamaño decrece con la distancia. No hay 3D real; se interpola entre un plano
  cercano y uno lejano.
- Render en `<canvas>` (mesa, vasos, pelota, sombra) con HUD en DOM encima.

---

## 4. Controles táctiles

- **Un solo puntero activo**: es un juego por turnos, cualquier segundo dedo se
  ignora.
- Gesto: `pointerdown` en la zona de swipe → arrastrar → `pointerup`.
  - **Dirección** = vector entre el punto inicial y el final del gesto.
  - **Potencia** = velocidad del gesto en sus últimos ~80 ms, no la longitud
    total: así un gesto lento y largo no equivale a un flick corto y rápido.
  - Gesto hacia abajo o casi horizontal → lanzamiento **cancelado**, sin gastar
    tiro.
- **Previsualización**: mientras se arrastra se dibuja una guía punteada con el
  arco estimado y un indicador de potencia. Se retira al soltar.
- Umbrales: menos de 24 px de recorrido = toque accidental, se ignora.
- **Feedback:** vibración al soltar, sonido de acierto (vaso) distinto del de
  fallo (mesa), y animación del vaso al retirarse.
- Botón de **deshacer no existe**: un tiro soltado es definitivo.

---

## 5. Mecánica de lanzamiento

- La pelota se simula como un **proyectil 2.5D**: posición `(x, y)` sobre el
  plano de la mesa más una altura `z` con gravedad constante.
- El punto de caída se obtiene resolviendo `z = 0`; el acierto se decide por
  distancia entre ese punto y el centro de cada vaso, con radio de acierto algo
  **mayor que el vaso dibujado** (perdonar un poco compensa la imprecisión del
  dedo en pantalla pequeña).
- Rebote: si la pelota cae en la mesa fuera de vaso, hace un par de botes
  amortiguados y sale; si golpea el borde de un vaso, se desvía. Ambos son
  cosméticos, el resultado ya está decidido en el impacto.
- **Sin viento ni efecto**: la única variable es el gesto, para que la habilidad
  sea reproducible.
- Toda la geometría en coordenadas normalizadas, igual que en Air Hockey.

---

## 6. Máquina de estados

```
┌──────────┐
│  SETUP   │  nombres/colores de los dos jugadores
└────┬─────┘
     ▼
┌──────────┐  «Pasa el móvil a X · Toca cuando estés listo»
│ HANDOVER │◄──────────────────────────┐
└────┬─────┘                           │
     ▼                                 │
┌──────────┐  swipe                    │
│  AIMING  ├──────┐                    │
└──────────┘      ▼                    │
            ┌──────────┐               │
            │  FLIGHT  │  parábola     │
            └────┬─────┘               │
                 ▼                     │
            ┌──────────┐  quedan tiros │
            │ RESOLVE  ├───► AIMING    │
            └────┬─────┘               │
                 │ turno agotado       │
                 ├─────────────────────┘
                 │ 0 vasos
                 ▼
            ┌──────────┐   ┌────────────┐
            │REDEMPTION├──►│  GAMEOVER  │
            └──────────┘   └────────────┘
```

- `HANDOVER` es una pantalla opaca a pantalla completa: nadie ve la mesa del
  rival mientras se pasa el móvil, y evita lanzamientos accidentales durante el
  traspaso.
- La partida se guarda en `localStorage` en cada cambio de estado, para poder
  retomarla si el navegador descarga la pestaña.

---

## 7. Ficheros y assets

```
games/beer-pong/
├── index.html
├── beer-pong.css
└── beer-pong.js
```

- Sin imágenes: vasos, mesa y pelota se dibujan con primitivas de canvas
  (elipses con gradiente) sobre `--c-beer-pong` como acento.
- Sonidos sintetizados con la utilidad `js/shared/audio.js` creada en Fase 1.
- Nuevas utilidades compartidas que salen de esta fase:
  `js/shared/handover.js` (pantalla de traspaso del móvil reutilizable por
  Hundir la flota) y ampliación de `js/shared/storage.js` para partidas guardadas.
- Alta del bloque `'beer-pong'` en `ASSET_BLOCKS` del service worker.

---

## 8. Hitos de la fase

| Hito | Versión |
|---|---|
| Shell del juego, mesa en perspectiva, alta en SW | 1.5 |
| Gesto de swipe con previsualización y parábola | 1.6 |
| Detección de acierto, retirada y reagrupación de vasos | 1.7 |
| Turnos, pantalla de traspaso, marcador y *balls back* | 1.8 |
| Redención, muerte súbita, gameover y revancha | 1.9 |
| Sonido, vibración, pulido, alta en el hub y pruebas en dispositivos reales | **2.0** |

> **Nota de versionado.** El plan original numeraba estos hitos 1.1-1.5; esas
> versiones las consumieron los ajustes del marcador de Air Hockey después de
> cerrar la Fase 1 (v1.0), así que Beer Pong arranca en 1.5. Ver
> `docs/CONVENTIONS.md` §1.

> **Nota de reagrupación.** La regla "se reagrupa a 6, 3 y 1 vasos" no cubre
> el caso de que un turno tire la cuenta por debajo de uno de esos umbrales
> sin pasar exactamente por él (p. ej. de 8 a 5 en un mismo turno, con *balls
> back*). Implementado como: se reagrupa al triángulo estándar más pequeño
> que quepan todos los vasos vivos (10→6→3→1), y si sobran huecos se
> pre-eliminan empezando por la fila de atrás, dejando la fila delantera
> (el vértice) intacta el mayor tiempo posible.

---

## 9. Riesgos y decisiones abiertas

- **Calibrar la potencia** es el mayor riesgo del juego: si la relación gesto →
  distancia no se siente natural, no hay pulido que lo salve. Se ajusta con
  pruebas reales en cuanto exista la parábola (hito 1.2), antes de programar
  nada más.
- **Perspectiva vs. legibilidad:** con 10 vasos en un móvil pequeño, los del
  fondo quedan diminutos. Si no se distinguen, se reduce la fuga de la
  perspectiva aunque el efecto 3D pierda fuerza.
- **Radio de acierto:** demasiado generoso vuelve el juego trivial; demasiado
  justo, frustrante. Empezar en +15 % del radio del vaso y calibrar.
- **Nombres de los jugadores:** por defecto «Jugador 1 / Jugador 2» y edición
  opcional; no bloquear el inicio de partida pidiendo datos.
