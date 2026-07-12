// Estado de la canción y wiring de la interfaz.

const scheduler = new MetronomeScheduler();

let song = {
  name: 'Mi canción',
  sections: [
    makeSection({ name: 'Intro', beatsPerBar: 4, bpmStart: 90, bpmEnd: 90, ramp: false, bars: 8 }),
    makeSection({ name: 'Subida', beatsPerBar: 4, bpmStart: 90, bpmEnd: 110, ramp: true, bars: 8 }),
    makeSection({ name: 'Puente', beatsPerBar: 3, bpmStart: 110, bpmEnd: 110, ramp: false, bars: 4 }),
  ],
};

function makeSection(overrides = {}) {
  return Object.assign(
    {
      id: uid(),
      name: '',
      beatsPerBar: 4,
      beatUnit: 4,
      ramp: false,
      bpmStart: 120,
      bpmEnd: 120,
      bars: 8,
    },
    overrides
  );
}

// --- Elementos del DOM ---
const el = {
  songName: document.getElementById('song-name'),
  sectionsBody: document.getElementById('sections-body'),
  addSectionBtn: document.getElementById('add-section-btn'),
  totalDuration: document.getElementById('total-duration'),
  playbackStatus: document.getElementById('playback-status'),
  playBtn: document.getElementById('play-btn'),
  exportBtn: document.getElementById('export-btn'),
  saveBtn: document.getElementById('save-btn'),
  loadBtn: document.getElementById('load-btn'),
  loadInput: document.getElementById('load-input'),
  statusMsg: document.getElementById('status-msg'),
};

el.songName.value = song.name;
el.songName.addEventListener('input', () => {
  song.name = el.songName.value;
});

// --- Render de la tabla de secciones ---
function render() {
  el.sectionsBody.innerHTML = song.sections.map(rowHtml).join('');
  updateTotalDuration();
}

function rowHtml(section, index) {
  const dur = formatDuration(sectionDuration(section));
  return `
    <tr data-id="${section.id}">
      <td class="col-idx">${index + 1}</td>
      <td class="col-name">
        <input type="text" data-field="name" value="${escapeHtml(section.name)}" placeholder="Nombre">
      </td>
      <td class="col-compas">
        <div class="compas-row">
          <input type="number" data-field="beatsPerBar" value="${section.beatsPerBar}" min="1" max="32" class="num-small">
          <span>/</span>
          <input type="number" data-field="beatUnit" value="${section.beatUnit}" min="1" max="32" class="num-small">
        </div>
      </td>
      <td class="col-tempo">
        <div class="tempo-row">
          <input type="number" data-field="bpmStart" value="${section.bpmStart}" min="20" max="400" class="num-medium" title="BPM inicial">
          <label class="ramp-toggle">
            <input type="checkbox" data-field="ramp" ${section.ramp ? 'checked' : ''}>
            Rampa
          </label>
          <input type="number" data-field="bpmEnd" value="${section.bpmEnd}" min="20" max="400" class="num-medium bpm-end" title="BPM final" ${section.ramp ? '' : 'hidden'}>
        </div>
      </td>
      <td class="col-bars">
        <input type="number" data-field="bars" value="${section.bars}" min="1" max="999" class="num-small">
      </td>
      <td class="col-duration row-duration">${dur}</td>
      <td class="col-actions">
        <button type="button" data-action="up" title="Mover arriba">▲</button>
        <button type="button" data-action="down" title="Mover abajo">▼</button>
        <button type="button" data-action="delete" title="Eliminar">✕</button>
      </td>
    </tr>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function updateTotalDuration() {
  const { totalDuration } = buildClickTimeline(song.sections);
  el.totalDuration.textContent = formatDuration(totalDuration);
}

// --- Edición de campos (delegación de eventos, sin recrear la tabla) ---
el.sectionsBody.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const row = e.target.closest('tr');
  const section = song.sections.find((s) => s.id === row.dataset.id);
  if (!section) return;

  if (e.target.type === 'checkbox') {
    section[field] = e.target.checked;
    row.querySelector('.bpm-end').hidden = !section.ramp;
  } else if (e.target.type === 'number') {
    section[field] = e.target.value === '' ? '' : Number(e.target.value);
  } else {
    section[field] = e.target.value;
  }

  row.querySelector('.row-duration').textContent = formatDuration(sectionDuration(section));
  updateTotalDuration();
});

el.sectionsBody.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const row = e.target.closest('tr');
  const index = song.sections.findIndex((s) => s.id === row.dataset.id);
  if (index === -1) return;

  if (action === 'delete') {
    song.sections.splice(index, 1);
  } else if (action === 'up' && index > 0) {
    swap(song.sections, index, index - 1);
  } else if (action === 'down' && index < song.sections.length - 1) {
    swap(song.sections, index, index + 1);
  }
  render();
});

function swap(arr, i, j) {
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

el.addSectionBtn.addEventListener('click', () => {
  const last = song.sections[song.sections.length - 1];
  song.sections.push(
    last
      ? makeSection({ beatsPerBar: last.beatsPerBar, beatUnit: last.beatUnit, bpmStart: last.bpmEnd, bpmEnd: last.bpmEnd })
      : makeSection()
  );
  render();
});

// --- Reproducción ---
el.playBtn.addEventListener('click', () => {
  if (scheduler.playing) {
    scheduler.stop();
    return;
  }

  const started = scheduler.play(song.sections, {
    onBeat: (ev) => {
      const section = song.sections[ev.sectionIndex];
      el.playbackStatus.textContent = `${section.name || 'Sección ' + (ev.sectionIndex + 1)} · compás ${ev.bar + 1}, tiempo ${ev.beat + 1}`;
      highlightRow(section.id);
    },
    onStop: () => {
      el.playBtn.textContent = '▶ Reproducir';
      el.playbackStatus.textContent = '';
      clearHighlight();
    },
  });

  if (started) {
    el.playBtn.textContent = '⏹ Detener';
  }
});

function highlightRow(sectionId) {
  clearHighlight();
  const row = el.sectionsBody.querySelector(`tr[data-id="${sectionId}"]`);
  if (row) row.classList.add('playing');
}

function clearHighlight() {
  el.sectionsBody.querySelectorAll('tr.playing').forEach((r) => r.classList.remove('playing'));
}

// --- Exportar a MP3 ---
el.exportBtn.addEventListener('click', async () => {
  scheduler.stop();
  el.exportBtn.disabled = true;
  el.statusMsg.textContent = 'Generando MP3, un momento…';

  // Deja que el navegador pinte el mensaje antes del trabajo pesado de codificación.
  await new Promise((resolve) => setTimeout(resolve, 30));

  try {
    const blob = await exportSongToMp3(song.sections);
    const filename = `${sanitizeFilename(song.name || 'metronomo')}.mp3`;
    downloadBlob(blob, filename);
    el.statusMsg.textContent = `Listo: ${filename}`;
  } catch (err) {
    console.error(err);
    el.statusMsg.textContent = `Error al exportar: ${err.message}`;
  } finally {
    el.exportBtn.disabled = false;
  }
});

function sanitizeFilename(name) {
  return name.trim().replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '').replace(/\s+/g, '_') || 'metronomo';
}

// --- Guardar / cargar canción como JSON ---
el.saveBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `${sanitizeFilename(song.name || 'metronomo')}.json`);
});

el.loadBtn.addEventListener('click', () => el.loadInput.click());

el.loadInput.addEventListener('change', async () => {
  const file = el.loadInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.sections)) throw new Error('Formato no válido.');
    scheduler.stop();
    song = {
      name: data.name || 'Mi canción',
      sections: data.sections.map((s) => makeSection({ ...s, id: uid() })),
    };
    el.songName.value = song.name;
    render();
    el.statusMsg.textContent = 'Canción cargada.';
  } catch (err) {
    console.error(err);
    el.statusMsg.textContent = `No se pudo cargar el archivo: ${err.message}`;
  } finally {
    el.loadInput.value = '';
  }
});

render();
