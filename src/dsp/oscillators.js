// Oscillators. Each instance renders one layer for one note and writes a
// stereo sample to this.l / this.r on every process() call.
//
// Types: saw, pulse, tri, sine, supersaw, fm, pd (phase distortion),
// reso (CZ-style resonant phase distortion), organ (additive drawbars).

import { TWO_PI, clamp, panGains } from './util.js';

// PolyBLEP residual for band-limited discontinuities.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

const ORGAN_RATIOS = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];

export const OSC_TYPES = ['saw', 'square', 'pulse', 'tri', 'morph', 'sine', 'supersaw', 'fm', 'pd', 'reso', 'organ'];
export const OSC_LABELS = {
  saw: 'Saw', square: 'Square', pulse: 'Pulse (PWM)', tri: 'Triangle', morph: 'Blend (tri › saw › square)',
  sine: 'Sine', supersaw: 'Supersaw', fm: 'FM', pd: 'Phase distortion', reso: 'CZ resonance', organ: 'Organ',
};

export class Oscillator {
  /**
   * @param {number} sr sample rate
   * @param {object} p layer params
   * @param {number} freq base frequency in Hz
   * @param {import('./rng.js').Rng} rng
   */
  constructor(sr, p, freq, rng) {
    this.sr = sr;
    this.p = p;
    this.type = p.type;
    this.freq = freq;
    this.l = 0; this.r = 0;
    this.t = 0; // seconds since start (for internal envelopes)
    const rand = clamp(p.phaseRand ?? 1, 0, 1);
    this.phase = rng.next() * rand;

    if (this.type === 'supersaw') {
      const n = clamp(Math.round(p.unison ?? 7), 1, 9);
      this.n = n;
      this.phases = new Float64Array(n);
      this.ratios = new Float64Array(n);
      this.gl = new Float64Array(n);
      this.gr = new Float64Array(n);
      const detune = p.detune ?? 25; // cents, total spread
      const spread = clamp(p.spread ?? 0.8, 0, 1);
      for (let i = 0; i < n; i++) {
        const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // -1..1
        // Slightly uneven spacing sounds less "phasey" than linear spacing.
        const shaped = Math.sign(pos) * Math.pow(Math.abs(pos), 1.25);
        const cents = shaped * detune * 0.5 + rng.bipolar() * detune * 0.04;
        this.ratios[i] = Math.pow(2, cents / 1200);
        this.phases[i] = rng.next();
        const [gl, gr] = panGains(pos * spread);
        const centreBoost = i === (n >> 1) ? 1.3 : 1;
        this.gl[i] = gl * centreBoost; this.gr[i] = gr * centreBoost;
      }
      this.norm = 1.6 / Math.sqrt(n);
    } else if (this.type === 'fm') {
      this.modPhase = rng.next() * rand;
      this.fb = 0;
    } else if (this.type === 'organ') {
      const bars = p.drawbars ?? [8, 0, 8, 6, 0, 4, 0, 0, 2];
      this.bars = ORGAN_RATIOS.map((r, i) => ({ ratio: r, g: (bars[i] ?? 0) / 8, ph: rng.next() * rand }));
      const total = this.bars.reduce((a, b) => a + b.g, 0) || 1;
      this.norm = 1.3 / Math.sqrt(total * 1.5);
      this.percRatio = p.perc === 3 ? 3 : p.perc === 2 ? 2 : 0;
      this.percPh = 0;
    }
  }

  /** @param {number} pitchMul frequency multiplier from pitch envelope / drift */
  process(pitchMul) {
    const sr = this.sr;
    const f = this.freq * pitchMul;
    const dt = Math.min(f / sr, 0.49);
    const p = this.p;
    let out = 0;

    switch (this.type) {
      case 'saw': {
        const t = this.phase;
        out = 2 * t - 1 - blep(t, dt);
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'square': {
        // A true 50% square, band-limited.
        const t = this.phase;
        out = (t < 0.5 ? 1 : -1) + blep(t, dt) - blep((t + 0.5) % 1, dt);
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'pulse': {
        const pw = clamp(p.pw ?? 0.5, 0.05, 0.95);
        const t = this.phase;
        out = (t < pw ? 1 : -1) + blep(t, dt) - blep((t - pw + 1) % 1, dt);
        out -= 2 * pw - 1; // remove DC from asymmetric pulse
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'tri': {
        const t = this.phase;
        out = 1 - 4 * Math.abs(t - 0.5);
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'morph': {
        // Blend: shape 0 = triangle, 0.5 = saw, 1 = square, crossfading in
        // between. Saw and square are band-limited; the square is scaled to
        // roughly match the others' loudness.
        const t = this.phase;
        const sh = clamp(p.shape ?? 0.5, 0, 1);
        const saw = 2 * t - 1 - blep(t, dt);
        if (sh <= 0.5) {
          const tri = 1 - 4 * Math.abs(t - 0.5);
          const k = sh * 2;
          out = tri * (1 - k) + saw * k;
        } else {
          const sq = ((t < 0.5 ? 1 : -1) + blep(t, dt) - blep((t + 0.5) % 1, dt)) * 0.72;
          const k = (sh - 0.5) * 2;
          out = saw * (1 - k) + sq * k;
        }
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'sine': {
        out = Math.sin(TWO_PI * this.phase);
        this.phase += dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'supersaw': {
        let l = 0, r = 0;
        for (let i = 0; i < this.n; i++) {
          const di = Math.min(dt * this.ratios[i], 0.49);
          const t = this.phases[i];
          const s = 2 * t - 1 - blep(t, di);
          l += s * this.gl[i]; r += s * this.gr[i];
          let nt = t + di; if (nt >= 1) nt -= 1;
          this.phases[i] = nt;
        }
        this.l = l * this.norm; this.r = r * this.norm;
        this.t += 1 / sr;
        return;
      }
      case 'fm': {
        // Two-operator FM with a decaying modulation index (DX-style stabs).
        const ratio = p.fmRatio ?? 2;
        const decay = Math.max(p.fmDecay ?? 0.3, 0.001);
        const sus = clamp(p.fmSustain ?? 0.2, 0, 1);
        const index = (p.fmIndex ?? 3) * (sus + (1 - sus) * Math.exp(-this.t / decay));
        const fbAmt = p.fmFeedback ?? 0;
        const mod = Math.sin(TWO_PI * this.modPhase + this.fb * fbAmt);
        this.fb = mod;
        out = Math.sin(TWO_PI * this.phase + index * mod);
        this.phase += dt; if (this.phase >= 1) this.phase -= 1;
        this.modPhase += Math.min(dt * ratio, 0.49); if (this.modPhase >= 1) this.modPhase -= 1;
        break;
      }
      case 'pd': {
        // Casio CZ-style saw: warp the phase of a cosine. Amount decays.
        const decay = Math.max(p.pdDecay ?? 0.4, 0.001);
        const amt = clamp((p.pd ?? 0.8) * (0.25 + 0.75 * Math.exp(-this.t / decay)), 0, 0.98);
        const m = 0.5 - 0.49 * amt;
        const t = this.phase;
        const w = t < m ? (0.5 * t) / m : 0.5 + (0.5 * (t - m)) / (1 - m);
        out = -Math.cos(TWO_PI * w);
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'reso': {
        // CZ-style resonance: windowed cosine at a sweeping multiple of f.
        const decay = Math.max(p.pdDecay ?? 0.3, 0.001);
        const amt = clamp(p.pd ?? 0.7, 0, 1) * (0.15 + 0.85 * Math.exp(-this.t / decay));
        const mult = 1 + amt * 14;
        const t = this.phase;
        out = 1 - (1 - t) * (1 - Math.cos(TWO_PI * t * mult));
        out = out * 0.9 - 0.45;
        this.phase = t + dt; if (this.phase >= 1) this.phase -= 1;
        break;
      }
      case 'organ': {
        for (let i = 0; i < this.bars.length; i++) {
          const b = this.bars[i];
          if (b.g === 0) continue;
          const di = dt * b.ratio;
          if (di >= 0.5) continue;
          out += Math.sin(TWO_PI * b.ph) * b.g;
          b.ph += di; if (b.ph >= 1) b.ph -= 1;
        }
        out *= this.norm;
        if (this.percRatio) {
          const di = dt * this.percRatio;
          if (di < 0.5) {
            out += Math.sin(TWO_PI * this.percPh) * 0.5 * Math.exp(-this.t / 0.18);
            this.percPh += di; if (this.percPh >= 1) this.percPh -= 1;
          }
        }
        break;
      }
      default:
        out = 0;
    }
    this.l = out; this.r = out;
    this.t += 1 / sr;
  }
}

// Coloured noise for attack transients: 0 = dark, 1 = white.
export class Noise {
  constructor(rng, colour = 0.5) {
    this.rng = rng;
    this.a = 1 - clamp(colour, 0.02, 1);
    this.y = 0;
  }
  process() {
    const w = this.rng.bipolar();
    this.y = this.a * this.y + (1 - this.a) * w;
    return this.y * (1 + this.a * 2);
  }
}
