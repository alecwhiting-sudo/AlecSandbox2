// AudioWorklet processor: runs the Engine live. The page sends the song JSON,
// performance values, play/stop and seek; the processor reports the position.

import { Engine } from './engine.js';

class SongProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.playing = false;
    this.loop = null; // { from, to } in bars
    this.tick = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }
  onMessage(m) {
    switch (m.type) {
      case 'song':
        if (!this.engine) { this.engine = new Engine(m.song, sampleRate); this.engine.seek(0); }
        else this.engine.update(m.song);
        break;
      case 'perf': if (this.engine) Object.assign(this.engine.perf, m.perf); break;
      case 'play': this.playing = true; break;
      case 'stop': this.playing = false; break;
      case 'seek': if (this.engine) this.engine.seek(m.bar); break;
      case 'loop': this.loop = m.loop; break;
      default: break;
    }
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] ?? out[0];
    if (!this.engine || !this.playing) { L.fill(0); if (R !== L) R.fill(0); return true; }
    const e = this.engine;
    if (this.loop && e.bar >= this.loop.to) e.seek(this.loop.from);
    e.render(L, R, L.length);
    if (e.pos >= e.totalSamples) { this.playing = false; this.port.postMessage({ type: 'ended' }); }
    if (++this.tick % 12 === 0) {
      this.port.postMessage({ type: 'pos', bar: e.bar, gr: e.mixer.limiter.gr });
      e.mixer.limiter.gr = 0;
    }
    return true;
  }
}

registerProcessor('song-processor', SongProcessor);
