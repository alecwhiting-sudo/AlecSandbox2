// Reverbs. Room, plate, hall and shimmer share an 8-line feedback delay
// network (FDN); spring has its own dispersive loop for the "boing".

import { clamp, TWO_PI } from './util.js';
import { OnePoleLP, OnePoleHP } from './filters.js';

export const REVERB_TYPES = ['room', 'plate', 'hall', 'chamber', 'shimmer', 'spring'];

const CHARACTER = {
  // sizeMul: delay scale, diff: input diffusion, er: early reflections level,
  // mod: modulation depth (samples at 48k), bright: damping offset (octaves)
  room:    { sizeMul: 0.45, diff: 0.6,  er: 0.6, mod: 2,  bright: 0 },
  chamber: { sizeMul: 0.7,  diff: 0.7,  er: 0.35, mod: 3, bright: -0.3 },
  plate:   { sizeMul: 0.8,  diff: 0.8,  er: 0,   mod: 4,  bright: 0.8 },
  hall:    { sizeMul: 1.45, diff: 0.75, er: 0.2, mod: 7,  bright: -0.6 },
  shimmer: { sizeMul: 1.5,  diff: 0.75, er: 0,   mod: 8,  bright: 0.3 },
};

const FDN_MS = [29.7, 37.1, 41.1, 43.7, 53.3, 59.9, 67.1, 73.3];
const DIFF_MS = [4.77, 3.59, 12.73, 9.31];
const ER_TAPS = [[7.1, 0.8, -0.6], [11.3, -0.6, 0.7], [17.9, 0.5, 0.4], [23.3, -0.4, -0.5], [31.7, 0.3, 0.35]];

class Delay {
  constructor(size) { this.size = size; this.buf = new Float64Array(size); this.w = 0; }
  write(x) { this.buf[this.w] = x; this.w = (this.w + 1) % this.size; }
  readInt(d) { let i = this.w - d; while (i < 0) i += this.size; return this.buf[i]; }
  read(d) {
    let rp = this.w - d; while (rp < 0) rp += this.size;
    const i = Math.floor(rp), f = rp - i;
    return this.buf[i] + (this.buf[(i + 1) % this.size] - this.buf[i]) * f;
  }
}

class Allpass {
  constructor(len, g) { this.d = new Delay(len + 1); this.len = len; this.g = g; }
  process(x) {
    const v = this.d.readInt(this.len);
    const u = x + this.g * v;
    this.d.write(u);
    return v - this.g * u;
  }
}

// Octave-up pitch shifter (two crossfaded read heads) for shimmer.
class OctaveShifter {
  constructor(sr) {
    this.win = Math.round(sr * 0.08);
    this.d = new Delay(this.win * 2 + 4);
    this.ph = 0;
  }
  process(x) {
    this.d.write(x);
    this.ph += 1 / this.win; if (this.ph >= 1) this.ph -= 1;
    let y = 0;
    for (let h = 0; h < 2; h++) {
      let p = this.ph + h * 0.5; if (p >= 1) p -= 1;
      // Delay shrinks over the window => playback at 2x speed.
      const delay = (1 - p) * this.win + 2;
      const g = Math.sin(Math.PI * p);
      y += this.d.read(delay) * g;
    }
    return y * 0.7;
  }
}

class FDNReverb {
  constructor(sr, p) {
    const c = CHARACTER[p.type] ?? CHARACTER.hall;
    this.sr = sr;
    const size = clamp(p.size ?? 0.6, 0, 1);
    const scale = c.sizeMul * (0.45 + size * 1.1) * (sr / 1000);
    const rt60 = clamp(p.decay ?? 2.5, 0.1, 30);
    this.lines = FDN_MS.map((ms) => {
      const len = Math.round(ms * scale);
      return { d: new Delay(len + 64), len, g: Math.pow(10, (-3 * len) / (rt60 * sr)) };
    });
    // Damping: 0 = bright (16 kHz) .. 1 = dark (1.2 kHz)
    const damp = clamp(p.damping ?? 0.4, 0, 1);
    const fc = clamp(16000 * Math.pow(2, -damp * 3.7 + c.bright), 800, 18000);
    this.damp = this.lines.map(() => new OnePoleLP(sr, fc));
    const diff = c.diff * (0.6 + 0.4 * clamp(p.diffusion ?? 0.7, 0, 1));
    const dScale = (0.6 + size * 0.8) * (sr / 1000);
    this.apL = DIFF_MS.map((ms) => new Allpass(Math.round(ms * dScale), diff));
    this.apR = DIFF_MS.map((ms) => new Allpass(Math.round(ms * 1.07 * dScale), diff));
    this.modDepth = c.mod * (sr / 48000) * (0.3 + clamp(p.mod ?? 0.5, 0, 1));
    this.modPh = this.lines.map((_, i) => i / 8);
    this.modRate = this.lines.map((_, i) => 0.13 + i * 0.037);
    this.er = c.er;
    this.erD = new Delay(Math.ceil(sr * 0.04));
    this.shimmer = p.type === 'shimmer' ? clamp(p.shimmer ?? 0.45, 0, 0.8) : 0;
    if (this.shimmer) this.shift = new OctaveShifter(sr);
    this.fbShim = 0;
    this.v = new Float64Array(8);
    this.l = 0; this.r = 0;
  }
  process(inL, inR) {
    let a = inL, b = inR;
    if (this.shimmer) { const s = this.shift.process(this.fbShim) * this.shimmer; a += s; b += s; }
    for (let i = 0; i < 4; i++) { a = this.apL[i].process(a); b = this.apR[i].process(b); }
    const v = this.v, lines = this.lines, sr = this.sr;
    for (let i = 0; i < 8; i++) {
      const L = lines[i];
      this.modPh[i] += this.modRate[i] / sr; if (this.modPh[i] >= 1) this.modPh[i] -= 1;
      const d = L.len + Math.sin(TWO_PI * this.modPh[i]) * this.modDepth;
      v[i] = this.damp[i].process(L.d.read(d)) * L.g;
    }
    // Fast Hadamard transform (orthogonal mixing)
    for (let h = 1; h < 8; h <<= 1) {
      for (let i = 0; i < 8; i += h << 1) {
        for (let j = i; j < i + h; j++) {
          const x = v[j], y = v[j + h];
          v[j] = x + y; v[j + h] = x - y;
        }
      }
    }
    const n = 0.35355339; // 1/sqrt(8)
    for (let i = 0; i < 8; i++) {
      const inj = i < 4 ? a : b;
      lines[i].d.write(v[i] * n + inj * (i & 1 ? -0.5 : 0.5));
    }
    let outL = 0, outR = 0;
    for (let i = 0; i < 8; i++) {
      const y = lines[i].d.readInt(1);
      if (i & 1) outR += y * (i & 2 ? -1 : 1); else outL += y * (i & 2 ? -1 : 1);
    }
    outL *= 0.5; outR *= 0.5;
    if (this.er > 0) {
      this.erD.write((inL + inR) * 0.5);
      for (const [ms, gl, gr] of ER_TAPS) {
        const s = this.erD.readInt(Math.round(ms * sr / 1000));
        outL += s * gl * this.er; outR += s * gr * this.er;
      }
    }
    this.fbShim = (outL + outR) * 0.5;
    this.l = outL; this.r = outR;
  }
}

class SpringReverb {
  constructor(sr, p) {
    this.sr = sr;
    const rt60 = clamp(p.decay ?? 2, 0.2, 8);
    const size = clamp(p.size ?? 0.5, 0, 1);
    this.ch = [0, 1].map((c) => {
      const len = Math.round((0.032 + size * 0.02 + c * 0.0047) * sr);
      return {
        d: new Delay(len + 4), len,
        g: Math.pow(10, (-3 * len) / (rt60 * sr)),
        ap: Array.from({ length: 18 }, () => ({ x1: 0, y1: 0 })),
        lp: new OnePoleLP(sr, 4200 * Math.pow(2, -clamp(p.damping ?? 0.4, 0, 1) * 1.5)),
        hp: new OnePoleHP(sr, 180),
      };
    });
    this.a = 0.62;
    this.l = 0; this.r = 0;
  }
  process(inL, inR) {
    const ins = [inL, inR];
    for (let c = 0; c < 2; c++) {
      const ch = this.ch[c];
      let x = ch.d.readInt(ch.len);
      // Dispersive allpass chain: high frequencies arrive first (the chirp).
      for (const s of ch.ap) {
        const y = this.a * x + s.x1 - this.a * s.y1;
        s.x1 = x; s.y1 = y; x = y;
      }
      x = ch.hp.process(ch.lp.process(x));
      ch.d.write(ins[c] + x * ch.g);
      if (c === 0) this.l = x; else this.r = x;
    }
  }
}

/** Reverb with pre-delay, wet high-pass and stereo width. Wet output only. */
export class Reverb {
  constructor(sr, p = {}) {
    this.core = p.type === 'spring' ? new SpringReverb(sr, p) : new FDNReverb(sr, p);
    this.pre = Math.max(1, Math.round(clamp(p.predelay ?? 0.02, 0, 0.5) * sr));
    this.pd = new Delay(this.pre + 2);
    this.pdR = new Delay(this.pre + 2);
    this.hp = [new OnePoleHP(sr, p.hpf ?? 250), new OnePoleHP(sr, p.hpf ?? 250)];
    this.hp2 = [new OnePoleHP(sr, p.hpf ?? 250), new OnePoleHP(sr, p.hpf ?? 250)];
    this.width = clamp(p.width ?? 1, 0, 1.5);
    this.gain = p.type === 'spring' ? 0.9 : 0.75;
    this.l = 0; this.r = 0;
  }
  process(inL, inR) {
    this.pd.write(inL); this.pdR.write(inR);
    const a = this.pd.readInt(this.pre), b = this.pdR.readInt(this.pre);
    this.core.process(a, b);
    let l = this.hp2[0].process(this.hp[0].process(this.core.l));
    let r = this.hp2[1].process(this.hp[1].process(this.core.r));
    const mid = (l + r) * 0.5, side = (l - r) * 0.5 * this.width;
    this.l = (mid + side) * this.gain; this.r = (mid - side) * this.gain;
  }
}
