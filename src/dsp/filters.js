// Filters. All share one interface:
//   const f = createFilter(type, sr); f.set(cutoffHz, res0to1, drive0to1); y = f.process(x)
// set() is cheap enough to call every few samples for modulation.

import { clamp, fastTanh } from './util.js';

export const FILTER_TYPES = [
  'ladder', 'diode', 'svf-lp12', 'svf-lp24', 'svf-hp12', 'svf-hp24',
  'svf-bp', 'svf-notch', 'formant', 'comb', 'comb-neg', 'off',
];

export const FILTER_LABELS = {
  ladder: 'Ladder LP 24 (warm)',
  diode: 'Diode LP (acid)',
  'svf-lp12': 'SVF LP 12',
  'svf-lp24': 'SVF LP 24',
  'svf-hp12': 'SVF HP 12',
  'svf-hp24': 'SVF HP 24',
  'svf-bp': 'SVF Band-pass',
  'svf-notch': 'SVF Notch',
  formant: 'Formant (vowel)',
  comb: 'Comb +',
  'comb-neg': 'Comb −',
  off: 'Off',
};

const prewarp = (fc, sr) => Math.tan(Math.PI * clamp(fc, 10, sr * 0.45) / sr);
const driveGain = (d) => 1 + clamp(d, 0, 1) * 7;

// ---------- State-variable filter (Simper / Cytomic ZDF) ----------
class SVFCore {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1; }
  set(g, k) {
    this.k = k;
    this.a1 = 1 / (1 + g * (g + k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  // Returns low; band and high are stored on the instance.
  tick(v0) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.band = v1;
    this.high = v0 - this.k * v1 - v2;
    this.low = v2;
    return v2;
  }
}

class SVFFilter {
  constructor(sr, mode, poles) {
    this.sr = sr; this.mode = mode; this.poles = poles;
    this.s1 = new SVFCore(); this.s2 = new SVFCore();
    this.pre = 1; this.post = 1;
  }
  set(fc, res, drive) {
    const g = prewarp(fc, this.sr);
    const r = clamp(res, 0, 1);
    if (this.poles === 4) {
      this.s1.set(g, 1.848);
      this.s2.set(g, 0.765 * (1 - r) + 0.02);
    } else {
      this.s1.set(g, 2 * (1 - r) + 0.03);
    }
    this.pre = driveGain(drive);
    this.post = 1 / Math.pow(this.pre, 0.75);
  }
  out(core) {
    switch (this.mode) {
      case 'hp': return core.high;
      case 'bp': return core.band;
      case 'notch': return core.low + core.high;
      default: return core.low;
    }
  }
  process(x) {
    let v = this.pre === 1 ? x : fastTanh(x * this.pre);
    this.s1.tick(v);
    v = this.out(this.s1);
    if (this.poles === 4) { this.s2.tick(v); v = this.out(this.s2); }
    return v * this.post;
  }
}

// ---------- Ladder (zero-delay feedback, tanh on the feedback junction) ----------
class LadderFilter {
  constructor(sr) { this.sr = sr; this.s = new Float64Array(4); this.G = 0; this.k = 0; this.pre = 1; this.post = 1; }
  set(fc, res, drive) {
    const g = prewarp(fc, this.sr);
    this.G = g / (1 + g);
    this.k = clamp(res, 0, 1) * 3.98;
    this.pre = driveGain(drive);
    this.post = 1 / Math.pow(this.pre, 0.7);
  }
  process(x) {
    const G = this.G, s = this.s, k = this.k;
    const g1 = 1 - G;
    const xin = x * this.pre * (1 + k * 0.35); // partial bass compensation
    const S = G * G * G * g1 * s[0] + G * G * g1 * s[1] + G * g1 * s[2] + g1 * s[3];
    const G4 = G * G * G * G;
    const y4est = (G4 * xin + S) / (1 + k * G4);
    let u = fastTanh(xin - k * y4est);
    for (let i = 0; i < 4; i++) {
      const v = (u - s[i]) * G;
      const y = v + s[i];
      s[i] = y + v;
      u = y;
    }
    return u * this.post;
  }
}

// ---------- Diode-style ladder (squelchy, acid) ----------
// Per-stage saturation, unit-delay feedback taken through a high-pass so the
// resonance bites in the mids. Character model rather than a circuit model.
class DiodeFilter {
  constructor(sr) {
    this.sr = sr; this.s = new Float64Array(4); this.G = 0; this.k = 0;
    this.y4 = 0; this.hpX = 0; this.hpY = 0;
    this.hpR = 1 - (2 * Math.PI * 160) / sr;
    this.pre = 1; this.post = 1;
  }
  set(fc, res, drive) {
    const g = prewarp(fc, this.sr);
    this.G = g / (1 + g);
    this.k = clamp(res, 0, 1) * 4.6;
    this.pre = driveGain(drive) * 1.3;
    this.post = 1.2 / Math.pow(this.pre, 0.65);
  }
  process(x) {
    // High-passed feedback signal
    const fb = this.y4 - this.hpX + this.hpR * this.hpY;
    this.hpX = this.y4; this.hpY = fb;
    let u = x * this.pre - this.k * fb;
    u = u > 0 ? fastTanh(u) : fastTanh(u * 1.15) / 1.08; // slight asymmetry
    const s = this.s, G = this.G;
    for (let i = 0; i < 4; i++) {
      const gi = i === 0 ? Math.min(G * 1.15, 0.99) : G;
      const v = (u - s[i]) * gi;
      const y = v + s[i];
      s[i] = fastTanh(y + v);
      u = y;
    }
    this.y4 = u;
    return u * this.post;
  }
}

// ---------- Formant (three parallel band-passes morphing across vowels) ----------
const VOWELS = [
  // F1, F2, F3 (Hz) for A E I O U
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
];
// Order cutoff sweeps through: U -> O -> A -> E -> I (dark to bright)
const VOWEL_ORDER = [4, 3, 0, 1, 2];
const FORMANT_GAINS = [1, 0.6, 0.3];

class FormantFilter {
  constructor(sr) {
    this.sr = sr;
    this.bands = [new SVFCore(), new SVFCore(), new SVFCore()];
    this.pre = 1;
  }
  set(fc, res, drive) {
    // Map cutoff 80 Hz..12 kHz onto vowel position 0..4
    const pos = clamp(Math.log(clamp(fc, 80, 12000) / 80) / Math.log(150), 0, 1) * 4;
    const i0 = Math.floor(Math.min(pos, 3.999)), t = pos - i0;
    const v0 = VOWELS[VOWEL_ORDER[i0]], v1 = VOWELS[VOWEL_ORDER[i0 + 1]];
    const q = 2 + clamp(res, 0, 1) * 18;
    for (let b = 0; b < 3; b++) {
      const f = v0[b] + (v1[b] - v0[b]) * t;
      this.bands[b].set(prewarp(f, this.sr), 1 / q);
    }
    this.pre = driveGain(drive);
    this.post = (1.5 + q * 0.12) / Math.pow(this.pre, 0.7);
  }
  process(x) {
    const v = this.pre === 1 ? x : fastTanh(x * this.pre);
    let y = 0;
    for (let b = 0; b < 3; b++) { this.bands[b].tick(v); y += this.bands[b].band * FORMANT_GAINS[b]; }
    return y * this.post;
  }
}

// ---------- Comb (tuned delay with damped feedback) ----------
class CombFilter {
  constructor(sr, polarity) {
    this.sr = sr; this.pol = polarity;
    this.size = Math.ceil(sr / 15) + 4;
    this.buf = new Float64Array(this.size);
    this.w = 0; this.delay = 100; this.fb = 0; this.lp = 0; this.pre = 1;
  }
  set(fc, res, drive) {
    this.delay = clamp(this.sr / clamp(fc, 20, this.sr * 0.4), 2, this.size - 3);
    this.fb = clamp(res, 0, 1) * 0.97 * this.pol;
    this.pre = driveGain(drive);
  }
  process(x) {
    let rp = this.w - this.delay;
    if (rp < 0) rp += this.size;
    const i = Math.floor(rp), f = rp - i;
    const a = this.buf[i], b = this.buf[(i + 1) % this.size];
    const d = a + (b - a) * f;
    this.lp += (d - this.lp) * 0.55; // damping in the loop
    const inp = this.pre === 1 ? x : fastTanh(x * this.pre) / Math.pow(this.pre, 0.6);
    const y = inp + this.fb * this.lp;
    this.buf[this.w] = fastTanh(y);
    this.w = (this.w + 1) % this.size;
    return (inp + d) * 0.6;
  }
}

class Bypass { set() {} process(x) { return x; } }

export function createFilter(type, sr) {
  switch (type) {
    case 'ladder': return new LadderFilter(sr);
    case 'diode': return new DiodeFilter(sr);
    case 'svf-lp12': return new SVFFilter(sr, 'lp', 2);
    case 'svf-lp24': return new SVFFilter(sr, 'lp', 4);
    case 'svf-hp12': return new SVFFilter(sr, 'hp', 2);
    case 'svf-hp24': return new SVFFilter(sr, 'hp', 4);
    case 'svf-bp': return new SVFFilter(sr, 'bp', 2);
    case 'svf-notch': return new SVFFilter(sr, 'notch', 2);
    case 'formant': return new FormantFilter(sr);
    case 'comb': return new CombFilter(sr, 1);
    case 'comb-neg': return new CombFilter(sr, -1);
    default: return new Bypass();
  }
}

// Simple one-pole filters used around the effects.
export class OnePoleLP {
  constructor(sr, fc) { this.sr = sr; this.y = 0; this.setFreq(fc); }
  setFreq(fc) { this.a = 1 - Math.exp(-2 * Math.PI * clamp(fc, 5, this.sr * 0.49) / this.sr); }
  process(x) { this.y += this.a * (x - this.y); return this.y; }
}
export class OnePoleHP {
  constructor(sr, fc) { this.lp = new OnePoleLP(sr, fc); }
  setFreq(fc) { this.lp.setFreq(fc); }
  process(x) { return x - this.lp.process(x); }
}
export { SVFCore, prewarp };
