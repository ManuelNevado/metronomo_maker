# DevelopersDEVELOPERSDEVELOPERS — Internals de Metrónomo Maker

> Guía técnica de bajo nivel. Aquí no hay React, no hay npm, no hay webpack.
> Solo HTML, CSS y JS corriendo directamente en el navegador. Brutalismo arquitectónico.

---

## Mapa de archivos

```
index.html          Punto de entrada. Carga scripts en orden, sin módulos ES.
style.css           Todo el CSS. Variables CSS para light/dark theme.
core.js             Lógica pura: timeline de beats, síntesis de click, utilidades.
scheduler.js        Motor de reproducción en tiempo real (look-ahead scheduling).
mp3export.js        Renderizado offline + codificación MP3 (lamejs).
midiexport.js       Generación de archivo SMF MIDI binario.
app.js              Estado global, wiring DOM, handlers de UI.
lib/lame.min.js     lamejs bundleado (~153 KB). Codificador MP3 en JS puro.
```

No hay `package.json`. No hay `node_modules`. El orden de los `<script>` en `index.html` define el grafo de dependencias — todo va al scope global.

---

## core.js — El corazón

### `buildClickTimeline(sections)`

Función central consumida por reproducción en vivo, exportación MP3 y exportación MIDI.

**Entrada:** array de objetos sección `{ beatsPerBar, bars, bpmStart, bpmEnd, ramp }`.

**Salida:** `{ events, totalDuration }` donde `events` es un array plano de:
```js
{
  time,          // segundos desde el inicio (absoluto, float)
  accent,        // boolean — true en el primer beat de cada compás
  sectionIndex,  // índice en el array de secciones
  bar,           // compás dentro de la sección (0-indexed)
  beat,          // tiempo dentro del compás (0-indexed)
  bpm,           // BPM exacto en ese beat (float — cambia en rampas)
}
```

**Cómo funciona la rampa de tempo:**

Para cada sección en modo rampa, el BPM de cada beat se calcula interpolando linealmente entre `bpmStart` y `bpmEnd` según la fracción `frac = i / (totalBeats - 1)`:

```
bpm_i = bpmStart + (bpmEnd - bpmStart) * frac_i
```

Esto produce una curva de aceleración/deceleración *perceptualmente lineal* en BPM. La duración de cada beat es `60 / bpm_i` segundos. El tiempo absoluto `t` se acumula sumando cada `beatDuration` — no hay fórmula cerrada, es iterativo.

**Caso borde:** si `totalBeats === 1`, `frac = 0` (el único beat tiene BPM inicial).

### `playClick(ctx, time, accent)`

Sintetiza un click usando Web Audio API. Funciona con `AudioContext` (reproducción en vivo) y con `OfflineAudioContext` (exportación MP3) porque ambos implementan la misma interfaz.

```
OscillatorNode (square, 1500 Hz / 900 Hz)
      ↓
GainNode (envolvente: attack 1ms → peak → decay exponencial hasta 0.0001 en 30ms)
      ↓
ctx.destination
```

- Acento: 1500 Hz, ganancia pico 1.0
- Normal:  900 Hz, ganancia pico 0.75
- Duración total del nodo: 40ms — después de ese tiempo los nodos se auto-liberan

---

## scheduler.js — Look-ahead scheduling

`MetronomeScheduler` resuelve el problema clásico de `setInterval`: el timer de JS no tiene precisión suficiente para audio (jitter de ±10-50ms). La solución estándar es un esquema de look-ahead:

```
setInterval (cada 25ms)
    ↓
_tick(): programa todos los eventos de los próximos 150ms en Web Audio API
    ↓
Web Audio API (thread de audio del SO): dispara los osciladores con precisión de muestra
```

**Flujo de reproducción:**

1. `play(sections)` llama a `buildClickTimeline(sections)` y guarda el array de eventos.
2. Crea un `AudioContext` y registra el `currentTime` como `startTime`.
3. Arranca el `setInterval` de 25ms.
4. En cada tick: itera desde `nextEventIndex` programando los eventos cuyo `time` cae dentro de la ventana `[now, now + 0.15s]` vía `playClick(ctx, startTime + ev.time, ev.accent)`.
5. El callback `onBeat` se dispara con `setTimeout` calibrado para coincidir con el momento real del beat — sirve para actualizar la UI.
6. Al llegar al último evento, el scheduler se para solo.

**Por qué no drift:** el tiempo Web Audio corre en un clock de hardware independiente del event loop de JS. El `setInterval` solo decide *cuándo buscar* qué programar, no *cuándo sonar*. Aunque el interval se retrase 20ms, los clicks ya están pre-programados con precisión de muestra.

---

## mp3export.js — Pipeline de exportación MP3

### Pipeline completo

```
buildClickTimeline(sections)
      ↓
OfflineAudioContext (44100 Hz, 1 canal, longitud = totalDuration + 0.2s tail)
      ↓  [todos los clicks programados con playClick]
offlineCtx.startRendering()  →  AudioBuffer (Float32Array en RAM)
      ↓
normalizePeak()  →  escala a 0.98 de pico para evitar clipping
      ↓
floatTo16BitPCM()  →  Int16Array (PCM signed 16-bit)
      ↓
lamejs.Mp3Encoder.encodeBuffer() en bloques de 1152 samples (frame MPEG Layer 3)
      ↓
Blob { type: 'audio/mp3' }  →  descarga vía <a download>
```

### `OfflineAudioContext`

La clave: renderiza el audio *más rápido que en tiempo real* (CPU-bound) sin abrir dispositivo de audio físico. El grafo de nodos es idéntico al de la reproducción en vivo — reutiliza `playClick` directamente.

### Normalización de pico

Iteración O(n) sobre todos los samples para encontrar el pico absoluto, luego `scale = 0.98 / peak`. Sin esto, la suma de muchos osciladores podría superar 1.0 y lamejs clipearía.

### Codificación MP3

lamejs implementa el encoder MPEG Layer 3 en JS puro. Acepta PCM 16-bit mono en chunks de 1152 samples (el tamaño fijo de un frame MP3). El bitrate por defecto es 128 kbps.

---

## midiexport.js — Generación de SMF binario

### Formato SMF (Standard MIDI File)

Un archivo MIDI es una secuencia de bytes con esta estructura:

```
[MThd chunk]  →  header (14 bytes fijos)
[MTrk chunk]  →  pista de eventos
```

**Header chunk (MThd):**
```
4D 54 68 64   "MThd"
00 00 00 06   longitud del header = 6 bytes
00 00         formato 0 (una sola pista)
00 01         número de pistas
01 E0         PPQ = 480 ticks por negra
```

**Track chunk (MTrk):**
```
4D 54 72 6B   "MTrk"
xx xx xx xx   longitud del chunk en bytes (big-endian)
[eventos...]
00 FF 2F 00   End of Track
```

Cada evento tiene la forma: `[delta time VLQ] [status byte] [data bytes]`.

### Tempo variable y rampas

El problema: en una sección en rampa, el BPM cambia en cada beat. MIDI lo resuelve con meta-eventos **Set Tempo** (`FF 51 03 tt tt tt`) donde `tt tt tt` es microsegundos por negra = `60_000_000 / bpm`.

La estrategia adoptada: emitir un evento Set Tempo **antes de cada nota** con el BPM exacto de ese beat. En el dominio de ticks, todos los beats siguen estando separados exactamente PPQ ticks. El tempo controla cuánto dura cada tick en tiempo real.

### Layout de eventos por beat `i`

```
tick = i * PPQ

[tick, pri=0]  FF 51 03  usPerBeat(3 bytes)   ← tempo del beat i
[tick, pri=2]  99  <note>  <vel>               ← Note On, canal 10
[tick+60, pri=1]  89  <note>  00               ← Note Off (60 ticks después)
```

Prioridad de ordenación cuando hay mismo tick: tempo (0) < noteOff (1) < noteOn (2). Esto evita notas stuck y asegura que el reproductor lee el tempo antes de la nota.

### VLQ (Variable-Length Quantity)

Los delta times en MIDI se codifican en VLQ: grupos de 7 bits, el bit alto a 1 indica que hay más bytes:

```
valor < 128       →  1 byte:  0xxxxxxx
128–16383         →  2 bytes: 1xxxxxxx 0xxxxxxx
16384–2097151     →  3 bytes: 1xxxxxxx 1xxxxxxx 0xxxxxxx
```

Implementación en `writeVarLen(out, value)`: extrae bytes de 7 bits de LSB a MSB, los pone en array con el bit de continuación, luego invierte el array para quedar en big-endian.

### Notas de percusión GM

Canal MIDI 10 (byte de status `9n` con `n=9`, ya que MIDI es 0-indexed):
- Nota 76: **Hi Wood Block** — tiempos acentuados (primer beat del compás)
- Nota 77: **Low Wood Block** — tiempos normales
- Velocity acento: 100, normal: 64

---

## app.js — Estado y wiring

### Estado global

```js
let song = { name, sections[] }
let startSectionId   // null = desde el principio
let selectedIds      // Set de IDs para operaciones de selección múltiple
let draggedId        // ID de la fila en arrastre activo
```

### Render

`render()` regenera todo el `innerHTML` del `<tbody>`. No hay virtual DOM — es un re-render total en cada cambio de estructura. Para cambios de campo individuales, el handler de `input` actualiza solo las celdas afectadas (duración de fila y duración total) sin hacer un render completo.

### Event delegation

Todos los listeners del tbody usan delegación: un único handler en `el.sectionsBody` filtra por `e.target.dataset.field`, `e.target.dataset.action`, `e.target.classList`, etc. Esto evita tener que registrar/desregistrar listeners al re-renderizar filas.

### Drag & drop nativo

HTML5 Drag API. El `draggable="true"` está en el `<span class="drag-handle">`, no en el `<tr>`. El evento `dragstart` captura el ID de la fila en `draggedId`. El `drop` llama a `reorderSections(fromId, targetId)` que extrae y re-inserta el elemento del array.

---

## Flujo de datos completo (de sección a audio/MIDI)

```
UI (tabla)
    ↓  [input events actualizan song.sections[i].field]
song.sections[]
    ↓
buildClickTimeline(sections)
    ↓
events[] con { time, accent, bpm, ... }
    ↓
    ├── scheduler.js → AudioContext → altavoz
    ├── mp3export.js → OfflineAudioContext → Float32 → PCM16 → MP3 → Blob
    └── midiexport.js → bytes SMF → Uint8Array → Blob → .mid
```

`buildClickTimeline` es el único punto de verdad para el ritmo. Nada más calcula tiempos — todo el resto consume su output.

---

## Consideraciones de rendimiento

- **OfflineAudioContext**: renderiza a máxima velocidad de CPU. Una canción de 5 minutos se renderiza en ~1-2s en un ordenador moderno. El `setTimeout(30ms)` antes de llamarlo da tiempo al navegador a pintar el mensaje "Generando…" en pantalla.
- **MIDI**: generación síncrona y O(n) en número de beats. Instantáneo en la práctica.
- **Re-render de tabla**: el `innerHTML` completo se regenera en cada cambio estructural. Para canciones de <100 secciones (caso normal) esto es imperceptible.
- **lamejs**: el encoder MP3 corre en el thread principal (no hay Worker). Para canciones muy largas (>30 min) podría bloquear la UI brevemente durante la codificación.
