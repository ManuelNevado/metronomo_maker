// Lógica compartida entre la reproducción en vivo y la exportación a MP3.

/**
 * Convierte la lista de secciones en una lista plana de eventos de click
 * con su instante exacto (en segundos desde el inicio de la canción).
 */
function buildClickTimeline(sections) {
  const events = [];
  let t = 0;

  sections.forEach((section, sectionIndex) => {
    const beatsPerBar = clamp(parseInt(section.beatsPerBar, 10) || 4, 1, 32);
    const bars = clamp(parseInt(section.bars, 10) || 1, 1, 999);
    const bpmStart = clamp(parseFloat(section.bpmStart) || 120, 20, 400);
    const bpmEnd = section.ramp
      ? clamp(parseFloat(section.bpmEnd) || bpmStart, 20, 400)
      : bpmStart;
    const totalBeats = beatsPerBar * bars;

    for (let i = 0; i < totalBeats; i++) {
      const frac = totalBeats > 1 ? i / (totalBeats - 1) : 0;
      const bpm = bpmStart + (bpmEnd - bpmStart) * frac;
      const beatDuration = 60 / bpm;
      const beatInBar = i % beatsPerBar;

      events.push({
        time: t,
        accent: beatInBar === 0,
        sectionIndex,
        bar: Math.floor(i / beatsPerBar),
        beat: beatInBar,
      });

      t += beatDuration;
    }
  });

  return { events, totalDuration: t };
}

/** Duración (en segundos) de una única sección, aislada del resto de la canción. */
function sectionDuration(section) {
  return buildClickTimeline([section]).totalDuration;
}

/** Programa un click (acentuado o no) en el contexto de audio dado, en el instante `time`. */
function playClick(ctx, time, accent) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1500 : 900;

  const peak = accent ? 0.9 : 0.55;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.04);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
