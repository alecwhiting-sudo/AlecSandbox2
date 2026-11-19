// Synthesised drums and percussion. Every instrument shares one interface:
//   inst.trigger(note, vel, lenSec)   start a hit
//   inst.process()                    advance one sample -> inst.l / inst.r
// Small fixed voice pools; finished voices are reused.

import { clamp, fastTanh, midiToHz, panGains, TWO_PI } from '../dsp/util.js';
import { SVFCore, prewarp, OnePoleHP, OnePoleLP } from '../dsp/filters.js';

const expK = (sec, sr) => Math.exp(-1 / (Math.max(sec, 1e-4) * sr));

// ---------------------------------------------------------------- kick
// Sine body with an exponential pitch sweep, a short click, and drive.
export class Kick {
  constructor(sr, p = {}, rng) {
    this.sr = sr; this.p = p; this.rng = rng;
    this.ph = 0; this.amp = 0; this.pitchEnv = 0; this.click = 0; this.t = 1e9;
    this.clickBP = new SVFCore(); this.clickBP.set(prewarp(3200, sr), 1.2);
    this.l = 0; this.r = 0;
  }
  trigger(note, vel) {
    const p = this.p;
    this.base = midiToHz(note ?? p.note ?? 29);         // F1 by default
    this.vel = vel;
    this.amp = 1; this.pitchEnv = 1; this.click = 1; this.t = 0;
    this.ampK = expK(p.decay ?? 0.42, this.sr);
    this.pitchK = expK(p.sweep ?? 0.045, this.sr);
    this.clickK = expK(0.004, this.sr);
    this.ph = 0.25; // start at a sine peak for a firm transient
  }
  process() {
    if (this.amp < 1e-4) { this.l = this.r = 0; return; }
    const p = this.p;
    const f = this.base * (1 + (p.punch ?? 5) * this.pitchEnv);
    this.ph += f / this.sr; if (this.ph >= 1) this.ph -= 1;
    let y = Math.sin(TWO_PI * this.ph) * this.amp;
    this.clickBP.tick(this.rng.bipolar());
    y += this.clickBP.band * this.click * (p.click ?? 0.5);
    const d = 1 + (p.drive ?? 0.4) * 4;
    y = fastTanh(y * d) / fastTanh(d) * this.vel * 0.9;
    this.amp *= this.ampK; this.pitchEnv *= this.pitchK; this.click *= this.clickK;
    this.l = this.r = y;
  }
}

// ---------------------------------------------------------------- toms
// Low tuned toms carry the "bassline". A sine body with a pitch drop plus a
// little skin noise; up to 4 overlapping hits.
class TomVoice {
  constructor(sr, rng) { this.sr = sr; this.rng = rng; this.amp = 0; this.ph = 0; this.skin = new OnePoleLP(sr, 1800); }
  start(f, vel, p, pan) {
    this.f = f; this.vel = vel; this.amp = 1; this.pe = 1; this.ph = 0.25; this.n = 1;
    this.ampK = expK(p.decay ?? 0.38, this.sr);
    this.peK = expK(p.sweep ?? 0.06, this.sr);
    this.nK = expK(0.012, this.sr);
    this.drop = p.drop ?? 0.9;
    [this.gl, this.gr] = panGains(pan);
  }
  process(p) {
    const f = this.f * (1 + this.drop * this.pe);
    this.ph += f / this.sr; if (this.ph >= 1) this.ph -= 1;
    let y = Math.sin(TWO_PI * this.ph) * this.amp + this.skin.process(this.rng.bipolar()) * this.n * (p.skin ?? 0.35);
    y = fastTanh(y * 1.6) * this.vel * 0.8;
    this.amp *= this.ampK; this.pe *= this.peK; this.n *= this.nK;
    return y;
  }
}
export class Toms {
  constructor(sr, p = {}, rng) {
    this.sr = sr; this.p = p; this.voices = Array.from({ length: 4 }, () => new TomVoice(sr, rng)); this.i = 0;
    this.l = 0; this.r = 0;
  }
  trigger(note, vel) {
    const v = this.voices[this.i++ % this.voices.length];
    // Lower toms sit centre, higher ones spread slightly.
    const pan = clamp((note - 36) / 30, -0.4, 0.4);
    v.start(midiToHz(note), vel, this.p, pan);
  }
  process() {
    let l = 0, r = 0;
    for (const v of this.voices) {
      if (v.amp < 1e-4) continue;
      const y = v.process(this.p); l += y * v.gl; r += y * v.gr;
    }
    this.l = l; this.r = r;
  }
}

// ---------------------------------------------------------------- sub stabs
// Short low sine stabs with a hint of second harmonic: subby texture only.
export class SubStab {
  constructor(sr, p = {}) { this.sr = sr; this.p = p; this.amp = 0; this.ph = 0; this.f = 0; this.vel = 0; this.n = 1; this.hold = 0; this.relK = 0; this.l = 0; this.r = 0; }
  trigger(note, vel, lenSec) {
    this.f = midiToHz(note); this.vel = vel; this.amp = 0; this.target = 1; this.ph = 0;
    this.hold = Math.max(0.03, lenSec ?? 0.18) * this.sr; this.n = 0;
    this.relK = expK(this.p.release ?? 0.08, this.sr);
  }
  process() {
    if (this.n > this.hold && this.amp < 1e-4) { this.l = this.r = 0; return; }
    if (this.n++ < this.hold) this.amp += (1 - this.amp) * 0.02; else this.amp *= this.relK;
    this.ph += this.f / this.sr; if (this.ph >= 1) this.ph -= 1;
    const s = Math.sin(TWO_PI * this.ph);
    const y = fastTanh((s + (this.p.harm ?? 0.15) * Math.sin(2 * TWO_PI * this.ph)) * 1.3) * this.amp * this.vel * 0.85;
    this.l = this.r = y;
  }
}

// ---------------------------------------------------------------- hats
// 808-style metal: six detuned squares at inharmonic ratios, plus noise,
// through band-pass and high-pass. note 0 = closed, 1 = open, 2 = pedal.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
export class Hats {
  constructor(sr, p = {}, rng) {
    this.sr = sr; this.p = p; this.rng = rng;
    this.ph = new Float64Array(6).map(() => rng.next());
    this.bp = new SVFCore(); this.hp = [new OnePoleHP(sr, 7000), new OnePoleHP(sr, 7000)];
    this.amp = 0; this.l = 0; this.r = 0; this.tone = -1;
  }
  trigger(note, vel) {
    const p = this.p;
    const decay = note === 1 ? (p.open ?? 0.28) : note === 2 ? 0.06 : (p.closed ?? 0.045);
    this.k = expK(decay, this.sr);
    this.amp = vel; // a new hit chokes the previous one (closed cuts open)
    const tone = clamp(p.tone ?? 0.5, 0, 1);
    if (tone !== this.tone) { this.bp.set(prewarp(7000 + tone * 4000, this.sr), 0.9); this.tone = tone; }
    this.pan = (this.rng.next() - 0.5) * (p.width ?? 0.3);
  }
  process() {
    if (this.amp < 1e-4) { this.l = this.r = 0; return; }
    const tune = this.p.tune ?? 1.6;
    let m = 0;
    for (let i = 0; i < 6; i++) {
      this.ph[i] += (METAL[i] * tune) / this.sr; if (this.ph[i] >= 1) this.ph[i] -= 1;
      m += this.ph[i] < 0.5 ? 1 : -1;
    }
    const x = m / 6 * (1 - (this.p.noise ?? 0.35)) + this.rng.bipolar() * (this.p.noise ?? 0.35);
    this.bp.tick(x);
    const y = this.bp.band * this.amp * 5;
    this.amp *= this.k;
    const [gl, gr] = panGains(this.pan);
    this.l = this.hp[0].process(y) * gl; this.r = this.hp[1].process(y) * gr;
  }
}

// ---------------------------------------------------------------- percussion
// One track, many sounds, chosen by note:
// 0 clap, 1 rim, 2 shaker, 3 conga, 4 metal bell, 5 glitch, 6 snare
class PercVoice {
  constructor(sr, rng) {
    this.sr = sr; this.rng = rng; this.amp = 0;
    this.f = new SVFCore(); this.hp = new OnePoleHP(sr, 300);
    this.ph = 0; this.ph2 = 0;
  }
  start(kind, vel, pan, p) {
    const sr = this.sr;
    this.kind = kind; this.vel = vel; this.amp = 1; this.t = 0; this.ph = 0; this.ph2 = 0;
    [this.gl, this.gr] = panGains(pan);
    const set = (fc, q) => this.f.set(prewarp(fc, sr), 1 / q);
    switch (kind) {
      case 0: set(1200 * (p.clapTone ?? 1), 1.4); this.k = expK(0.16, sr); break;            // clap
      // rim: a dry stick-on-rim crack. Broad noise band (low Q, no ring) plus a
      // knock that dies in a few ms, so it has impact but almost no pitch.
      case 1: set(3200 * (p.rimTone ?? 1), 0.7); this.k = expK(0.011, sr); this.pk = expK(0.004, sr); this.pe = 1; break;
      case 2: set(9000, 1); this.k = expK(0.05, sr); break;                                    // shaker
      case 3: this.k = expK(0.16, sr); this.pk = expK(0.03, sr); this.pe = 1; break;           // conga
      case 4: set(2400, 3); this.k = expK(0.09, sr); break;                                    // bell
      case 5: set(400 + this.rng.next() * 6000, 6); this.k = expK(0.02 + this.rng.next() * 0.06, sr); this.crush = 2 + Math.floor(this.rng.next() * 30); this.hold = 0; break; // glitch
      case 6: set(1800, 0.9); this.k = expK(0.12, sr); this.pk = expK(0.02, sr); this.pe = 1; break; // snare
      default: this.amp = 0;
    }
  }
  process() {
    const sr = this.sr, rng = this.rng;
    let y = 0;
    switch (this.kind) {
      case 0: { // clap: three quick bursts then a tail
        const ms = this.t / sr * 1000;
        const burst = ms < 22 ? (Math.floor(ms / 7.5) < 3 && (ms % 7.5) < 3 ? 1 : 0.15) : 1;
        this.f.tick(rng.bipolar()); y = this.f.band * burst * 2.2; break;
      }
      case 1: {
        this.ph += 300 / sr; if (this.ph >= 1) this.ph -= 1;
        const crack = this.t < sr * 0.0015 ? 1 : 0.4;   // sharp front edge
        this.f.tick(rng.bipolar() * crack);
        y = this.f.band * 2.2 + Math.sin(TWO_PI * this.ph) * this.pe * 0.4;
        this.pe *= this.pk; break;
      }
      case 2: this.f.tick(rng.bipolar()); y = this.hp.process(this.f.band) * 1.2; break;
      case 3: {
        this.ph += 230 * (1 + 0.6 * this.pe) / sr; if (this.ph >= 1) this.ph -= 1;
        y = Math.sin(TWO_PI * this.ph) * 0.9; this.pe *= this.pk; break;
      }
      case 4: {
        this.ph += 540 / sr; this.ph2 += 800 / sr; this.ph %= 1; this.ph2 %= 1;
        this.f.tick((this.ph < 0.5 ? 0.5 : -0.5) + (this.ph2 < 0.5 ? 0.5 : -0.5)); y = this.f.band * 1.6; break;
      }
      case 5: {
        if (this.t % this.crush === 0) this.hold = rng.bipolar();
        this.f.tick(this.hold); y = this.f.band * 2; break;
      }
      case 6: {
        this.ph += 190 * (1 + 0.5 * this.pe) / sr; this.ph %= 1; this.pe *= this.pk;
        this.f.tick(rng.bipolar()); y = Math.sin(TWO_PI * this.ph) * 0.5 * Math.exp(-this.t / (0.05 * sr)) + this.f.band * 1.1; break;
      }
      default: y = 0;
    }
    y *= this.amp * this.vel;
    this.amp *= this.k; this.t++;
    return y;
  }
}
export class Perc {
  constructor(sr, p = {}, rng) {
    this.sr = sr; this.p = p; this.rng = rng;
    this.voices = Array.from({ length: 8 }, () => new PercVoice(sr, rng)); this.i = 0;
    this.l = 0; this.r = 0;
  }
  trigger(note, vel) {
    const v = this.voices[this.i++ % this.voices.length];
    // Each sound has its own spot in the stereo field.
    const pans = [0, -0.35, 0.45, -0.25, 0.3, (this.rng.next() - 0.5) * 1.4, 0.05];
    v.start(note, vel, pans[note] ?? 0, this.p);
  }
  process() {
    let l = 0, r = 0;
    for (const v of this.voices) {
      if (v.amp < 1e-4) continue;
      const y = v.process(); l += y * v.gl; r += y * v.gr;
    }
    this.l = fastTanh(l * 1.2) * 0.85; this.r = fastTanh(r * 1.2) * 0.85;
  }
}
