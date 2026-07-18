// Exportación de la pista de click a formato MIDI estándar (SMF Type 0).
//
// Estrategia de tempo variable:
//   Cada beat ocupa exactamente PPQ ticks en el dominio MIDI. Los cambios de
//   tempo (secciones en rampa) se codifican como meta-eventos Set Tempo (FF 51)
//   antes de cada nota, de modo que el reproductor MIDI aplica la velocidad
//   correcta beat a beat. El BPM por evento viene de buildClickTimeline() en core.js.

function exportSongToMidi(sections, { name = 'Metrónomo' } = {}) {
  const { events } = buildClickTimeline(sections);
  if (events.length === 0) {
    throw new Error('Añade al menos una sección antes de exportar.');
  }

  const PPQ = 480;        // Pulsos por negra (resolución temporal)
  const NOTE_DUR = 60;    // Duración de cada click en ticks (PPQ/8 — un pulso corto)
  // GM Percussion (canal 10): Hi Wood Block / Low Wood Block para acento / normal
  const NOTE_ACCENT = 76;
  const NOTE_NORMAL = 77;
  const VEL_ACCENT = 100;
  const VEL_NORMAL = 64;

  // Prioridades de ordenación cuando dos eventos coinciden en el mismo tick:
  //   tempo (0) → noteOff (1) → noteOn (2)
  const midiEvents = [];

  events.forEach((ev, i) => {
    const tick = i * PPQ;
    const usPerBeat = Math.round(60_000_000 / ev.bpm);
    const note = ev.accent ? NOTE_ACCENT : NOTE_NORMAL;
    const vel  = ev.accent ? VEL_ACCENT  : VEL_NORMAL;

    midiEvents.push({ tick, pri: 0, type: 'tempo',  value: usPerBeat });
    midiEvents.push({ tick, pri: 2, type: 'noteOn',  note, vel });
    midiEvents.push({ tick: tick + NOTE_DUR, pri: 1, type: 'noteOff', note });
  });

  midiEvents.sort((a, b) => a.tick - b.tick || a.pri - b.pri);

  // --- Codificar bytes del track ---
  const track = [];

  // Track Name meta-event (delta 0)
  const nameBytes = encodeUtf8(name);
  track.push(0x00, 0xFF, 0x03);
  writeVarLen(track, nameBytes.length);
  track.push(...nameBytes);

  let prevTick = 0;
  for (const ev of midiEvents) {
    const delta = ev.tick - prevTick;
    prevTick = ev.tick;
    writeVarLen(track, delta);

    if (ev.type === 'tempo') {
      track.push(
        0xFF, 0x51, 0x03,
        (ev.value >> 16) & 0xFF,
        (ev.value >>  8) & 0xFF,
         ev.value        & 0xFF,
      );
    } else if (ev.type === 'noteOn') {
      track.push(0x99, ev.note, ev.vel);
    } else if (ev.type === 'noteOff') {
      track.push(0x89, ev.note, 0x00);
    }
  }

  // End of Track
  track.push(0x00, 0xFF, 0x2F, 0x00);

  // --- Header chunk (MThd) ---
  const header = [
    0x4D, 0x54, 0x68, 0x64,  // "MThd"
    0x00, 0x00, 0x00, 0x06,  // longitud fija del header = 6 bytes
    0x00, 0x00,              // formato 0 (una sola pista)
    0x00, 0x01,              // número de pistas = 1
    (PPQ >> 8) & 0xFF, PPQ & 0xFF,  // resolución temporal
  ];

  // --- Track chunk (MTrk) ---
  const trkLen = track.length;
  const trkHeader = [
    0x4D, 0x54, 0x72, 0x6B,  // "MTrk"
    (trkLen >> 24) & 0xFF,
    (trkLen >> 16) & 0xFF,
    (trkLen >>  8) & 0xFF,
     trkLen        & 0xFF,
  ];

  return new Blob(
    [new Uint8Array([...header, ...trkHeader, ...track])],
    { type: 'audio/midi' },
  );
}

/** Codifica un entero como variable-length quantity (VLQ) MIDI. */
function writeVarLen(out, value) {
  const bytes = [value & 0x7F];
  value >>>= 7;
  while (value > 0) {
    bytes.push(0x80 | (value & 0x7F));
    value >>>= 7;
  }
  bytes.reverse();
  out.push(...bytes);
}

function encodeUtf8(str) {
  return Array.from(new TextEncoder().encode(str));
}
