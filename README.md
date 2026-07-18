# Metrónomo Maker

Crea pistas de metrónomo personalizadas con cambios de tempo y compás, y expórtalas a **MP3** o **MIDI** para ensayar.

## Características

- Define una canción como una lista de **secciones** ordenadas
- Cada sección tiene nombre, compás (p.ej. 4/4, 3/4), tempo (BPM) y número de compases
- **Modo Rampa**: el tempo sube o baja progresivamente a lo largo de la sección
- **Reproducción en vivo** con indicador de sección/compás/tiempo en pantalla
- Elige desde qué sección empieza la reproducción haciendo clic en el número de sección
- **Exportar a MP3**: genera el archivo de audio con la pista de click completa
- **Exportar a MIDI**: genera un archivo `.mid` con las notas de percusión (canal 10 GM) y los cambios de tempo exactos, listo para importar en cualquier DAW
- **Guardar/cargar**: salva la canción como JSON y vuelve a cargarla más tarde
- Reordenar secciones arrastrando, duplicar con multiselección
- Tema claro/oscuro automático según el sistema

## Instalación

No hay dependencias ni proceso de build. Es una aplicación web de archivos estáticos.

**Opción A — Abrir directamente en el navegador:**

```
Abre index.html con cualquier navegador moderno (Chrome, Firefox, Edge, Safari).
```

> En Chrome puedes arrastrar `index.html` a la ventana del navegador o usar `Archivo > Abrir archivo`.

**Opción B — Servidor local (recomendado para desarrollo):**

Con Python:
```bash
python -m http.server 8080
# Abre http://localhost:8080
```

Con Node.js (`npx`):
```bash
npx serve .
```

Con VS Code: instala la extensión **Live Server** y haz clic en "Go Live".

## Uso

1. Escribe el nombre de la canción arriba.
2. Añade secciones con **+ Añadir sección**. Para cada sección:
   - **Sección**: nombre descriptivo (Intro, Verso, Estribillo…)
   - **Compás**: numerador/denominador (p.ej. `4 / 4`)
   - **Tempo (BPM)**: velocidad del click. Activa **Rampa** para un cambio progresivo de BPM inicial a BPM final.
   - **Compases**: cuántos compases dura la sección.
3. Reordena las filas arrastrando el ícono `⠿` o usando los botones ▲▼.
4. Pulsa **▶ Reproducir** para escuchar la pista. Haz clic en el número `#` de una sección para reproducir desde ahí.
5. Pulsa **⬇ Exportar MP3** o **⬇ Exportar MIDI** para descargar el archivo.
6. Guarda tu trabajo con **💾 Guardar canción** (descarga un `.json`) y recupéralo con **📂 Cargar canción**.

## Notas sobre el MIDI exportado

- Formato: SMF Type 0 (una sola pista), resolución 480 PPQ
- Canal 10 (percusión GM): Hi Wood Block (nota 76) para tiempos acentuados, Low Wood Block (nota 77) para el resto
- Incluye meta-eventos de tempo beat a beat, por lo que las secciones en rampa quedan codificadas con precisión
- Compatible con DAWs como Reaper, Logic Pro, Ableton Live, MuseScore, etc.

## Requisitos del navegador

- Web Audio API (para reproducción y exportación a MP3)
- `OfflineAudioContext` (para exportación a MP3)
- `TextEncoder` (para exportación a MIDI)

Cualquier navegador de escritorio publicado desde 2018 los soporta todos.
