// Motor de reproducción en vivo (patrón look-ahead scheduler, evita drift de setInterval).

class MetronomeScheduler {
  constructor() {
    this.audioCtx = null;
    this.timeline = null;
    this.totalDuration = 0;
    this.startTime = 0;
    this.nextEventIndex = 0;
    this.timerId = null;
    this.playing = false;
    this.lookahead = 25; // ms entre comprobaciones
    this.scheduleAheadTime = 0.15; // s de antelación al programar clicks
    this.onBeat = null;
    this.onStop = null;
  }

  play(sections, { onBeat, onStop } = {}) {
    this.stop();

    const { events, totalDuration } = buildClickTimeline(sections);
    if (events.length === 0) return false;

    this.timeline = events;
    this.totalDuration = totalDuration;
    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.startTime = this.audioCtx.currentTime + 0.1;
    this.nextEventIndex = 0;
    this.playing = true;
    this.onBeat = onBeat;
    this.onStop = onStop;

    this._tick();
    this.timerId = setInterval(() => this._tick(), this.lookahead);
    return true;
  }

  _tick() {
    if (!this.playing) return;
    const now = this.audioCtx.currentTime;

    while (
      this.nextEventIndex < this.timeline.length &&
      this.startTime + this.timeline[this.nextEventIndex].time < now + this.scheduleAheadTime
    ) {
      const ev = this.timeline[this.nextEventIndex];
      const when = this.startTime + ev.time;
      playClick(this.audioCtx, when, ev.accent);

      if (this.onBeat) {
        const delayMs = Math.max(0, (when - now) * 1000);
        setTimeout(() => {
          if (this.playing) this.onBeat(ev);
        }, delayMs);
      }

      this.nextEventIndex++;
    }

    if (this.nextEventIndex >= this.timeline.length) {
      const remainingMs = (this.startTime + this.totalDuration - now) * 1000;
      clearInterval(this.timerId);
      this.timerId = null;
      setTimeout(() => {
        if (this.playing) this.stop();
      }, Math.max(0, remainingMs) + 100);
    }
  }

  stop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.playing) {
      this.playing = false;
      const cb = this.onStop;
      if (this.audioCtx) {
        this.audioCtx.close();
        this.audioCtx = null;
      }
      if (cb) cb();
    }
  }
}
