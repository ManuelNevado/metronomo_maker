// Renderizado offline de la pista de click y codificación a MP3 (via lamejs, en el navegador).

async function exportSongToMp3(sections, { kbps = 128 } = {}) {
  const { events, totalDuration } = buildClickTimeline(sections);
  if (events.length === 0) {
    throw new Error('Añade al menos una sección antes de exportar.');
  }

  const sampleRate = 44100;
  const tail = 0.2; // margen para que el último click se apague del todo
  const length = Math.ceil((totalDuration + tail) * sampleRate);

  const offlineCtx = new OfflineAudioContext(1, length, sampleRate);
  events.forEach((ev) => playClick(offlineCtx, ev.time, ev.accent));

  const audioBuffer = await offlineCtx.startRendering();
  const samples = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const mp3Chunks = encodeMp3(samples, sampleRate, kbps);

  return new Blob(mp3Chunks, { type: 'audio/mp3' });
}

function floatTo16BitPCM(float32Array) {
  const out = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function encodeMp3(int16Samples, sampleRate, kbps) {
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, kbps);
  const blockSize = 1152;
  const chunks = [];

  for (let i = 0; i < int16Samples.length; i += blockSize) {
    const chunk = int16Samples.subarray(i, i + blockSize);
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length > 0) chunks.push(buf);
  }

  const end = encoder.flush();
  if (end.length > 0) chunks.push(end);

  return chunks;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
