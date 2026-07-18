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
  duplicateBtn: document.getElementById('duplicate-btn'),
  selectAllCb: document.getElementById('select-all'),
  totalDuration: document.getElementById('total-duration'),
  playbackStatus: document.getElementById('playback-status'),
  playBtn: document.getElementById('play-btn'),
  exportBtn: document.getElementById('export-btn'),
  midiBtn: document.getElementById('midi-btn'),
  saveBtn: document.getElementById('save-btn'),
  loadBtn: document.getElementById('load-btn'),
  loadInput: document.getElementById('load-input'),
  statusMsg: document.getElementById('status-msg'),
};

el.songName.value = song.name;
el.songName.addEventListener('input', () => {
  song.name = el.songName.value;
});

// --- Punto de inicio de reproducción (sección seleccionada) ---
let startSectionId = null; // null = reproducir desde el principio

// --- Selección de secciones para duplicar ---
let selectedIds = new Set();

// --- Render de la tabla de secciones ---
function render() {
  el.sectionsBody.innerHTML = song.sections.map(rowHtml).join('');
  updateTotalDuration();
  updatePlayButtonLabel();
  updateDuplicateButtonState();
}

function rowHtml(section, index) {
  const dur = formatDuration(sectionDuration(section));
  const isStart = section.id === startSectionId;
  const isChecked = selectedIds.has(section.id);
  return `
    <tr data-id="${section.id}" class="${isStart ? 'start-selected' : ''}">
      <td class="col-select"><input type="checkbox" class="row-select" ${isChecked ? 'checked' : ''}></td>
      <td class="col-drag"><span class="drag-handle" draggable="true" title="Arrastrar para reordenar">⠿</span></td>
      <td class="col-idx" title="Clic para reproducir desde aquí">${isStart ? '▶' : index + 1}</td>
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
        <button type="button" data-action="duplicate" title="Duplicar">⧉</button>
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
  if (action) {
    const row = e.target.closest('tr');
    const index = song.sections.findIndex((s) => s.id === row.dataset.id);
    if (index === -1) return;

    if (action === 'delete') {
      if (startSectionId === row.dataset.id) startSectionId = null;
      selectedIds.delete(row.dataset.id);
      song.sections.splice(index, 1);
    } else if (action === 'up' && index > 0) {
      swap(song.sections, index, index - 1);
    } else if (action === 'down' && index < song.sections.length - 1) {
      swap(song.sections, index, index + 1);
    } else if (action === 'duplicate') {
      const clone = makeSection({ ...song.sections[index], id: uid() });
      song.sections.splice(index + 1, 0, clone);
      selectedIds = new Set([clone.id]);
    }
    render();
    return;
  }

  const idxCell = e.target.closest('.col-idx');
  if (idxCell) {
    const row = idxCell.closest('tr');
    startSectionId = startSectionId === row.dataset.id ? null : row.dataset.id;
    render();
  }
});

el.sectionsBody.addEventListener('change', (e) => {
  if (!e.target.classList.contains('row-select')) return;
  const row = e.target.closest('tr');
  if (e.target.checked) {
    selectedIds.add(row.dataset.id);
  } else {
    selectedIds.delete(row.dataset.id);
  }
  updateDuplicateButtonState();
});

el.selectAllCb.addEventListener('change', (e) => {
  selectedIds = e.target.checked ? new Set(song.sections.map((s) => s.id)) : new Set();
  render();
});

el.duplicateBtn.addEventListener('click', () => {
  duplicateSelectedSections();
});

function duplicateSelectedSections() {
  const indices = song.sections
    .map((s, i) => (selectedIds.has(s.id) ? i : -1))
    .filter((i) => i !== -1);
  if (indices.length === 0) return;

  const clones = indices.map((i) => makeSection({ ...song.sections[i], id: uid() }));
  const insertAt = indices[indices.length - 1] + 1;
  song.sections.splice(insertAt, 0, ...clones);
  selectedIds = new Set(clones.map((c) => c.id));
  render();
}

function updateDuplicateButtonState() {
  el.duplicateBtn.disabled = selectedIds.size === 0;
  el.duplicateBtn.textContent = selectedIds.size > 0
    ? `⧉ Duplicar selección (${selectedIds.size})`
    : '⧉ Duplicar selección';

  const total = song.sections.length;
  el.selectAllCb.checked = total > 0 && selectedIds.size === total;
  el.selectAllCb.indeterminate = selectedIds.size > 0 && selectedIds.size < total;
}

// --- Reordenar secciones arrastrando (drag & drop nativo) ---
let draggedId = null;

el.sectionsBody.addEventListener('dragstart', (e) => {
  if (!e.target.closest('.drag-handle')) return;
  const row = e.target.closest('tr');
  draggedId = row.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedId);
  row.classList.add('dragging');
});

el.sectionsBody.addEventListener('dragover', (e) => {
  if (!draggedId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.target.closest('tr');
  el.sectionsBody.querySelectorAll('tr.drag-over').forEach((r) => r.classList.remove('drag-over'));
  if (row && row.dataset.id !== draggedId) row.classList.add('drag-over');
});

el.sectionsBody.addEventListener('drop', (e) => {
  if (!draggedId) return;
  e.preventDefault();
  const row = e.target.closest('tr');
  const targetId = row ? row.dataset.id : null;
  reorderSections(draggedId, targetId);
  draggedId = null;
  render();
});

el.sectionsBody.addEventListener('dragend', () => {
  draggedId = null;
  el.sectionsBody.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging'));
  el.sectionsBody.querySelectorAll('.drag-over').forEach((r) => r.classList.remove('drag-over'));
});

function reorderSections(fromId, targetId) {
  const fromIndex = song.sections.findIndex((s) => s.id === fromId);
  if (fromIndex === -1 || fromId === targetId) return;
  const [moved] = song.sections.splice(fromIndex, 1);
  const toIndex = targetId ? song.sections.findIndex((s) => s.id === targetId) : -1;
  song.sections.splice(toIndex === -1 ? song.sections.length : toIndex, 0, moved);
}

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

  let startIndex = 0;
  if (startSectionId) {
    const idx = song.sections.findIndex((s) => s.id === startSectionId);
    startIndex = idx === -1 ? 0 : idx;
  }
  const sectionsToPlay = song.sections.slice(startIndex);

  const started = scheduler.play(sectionsToPlay, {
    onBeat: (ev) => {
      const section = song.sections[startIndex + ev.sectionIndex];
      el.playbackStatus.textContent = `${section.name || 'Sección ' + (startIndex + ev.sectionIndex + 1)} · compás ${ev.bar + 1}, tiempo ${ev.beat + 1}`;
      highlightRow(section.id);
    },
    onStop: () => {
      updatePlayButtonLabel();
      el.playbackStatus.textContent = '';
      clearHighlight();
    },
  });

  if (started) {
    el.playBtn.textContent = '⏹ Detener';
  }
});

function updatePlayButtonLabel() {
  if (scheduler.playing) return;
  if (startSectionId) {
    const idx = song.sections.findIndex((s) => s.id === startSectionId);
    const section = song.sections[idx];
    el.playBtn.textContent = `▶ Reproducir desde "${section ? (section.name || 'Sección ' + (idx + 1)) : ''}"`;
  } else {
    el.playBtn.textContent = '▶ Reproducir';
  }
}

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

// --- Exportar a MIDI ---
el.midiBtn.addEventListener('click', async () => {
  scheduler.stop();
  el.midiBtn.disabled = true;
  el.statusMsg.textContent = 'Generando MIDI…';

  await new Promise((resolve) => setTimeout(resolve, 30));

  try {
    const blob = exportSongToMidi(song.sections, { name: song.name || 'Metrónomo' });
    const filename = `${sanitizeFilename(song.name || 'metronomo')}.mid`;
    downloadBlob(blob, filename);
    el.statusMsg.textContent = `Listo: ${filename}`;
  } catch (err) {
    console.error(err);
    el.statusMsg.textContent = `Error al exportar: ${err.message}`;
  } finally {
    el.midiBtn.disabled = false;
  }
});

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
    startSectionId = null;
    selectedIds = new Set();
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
