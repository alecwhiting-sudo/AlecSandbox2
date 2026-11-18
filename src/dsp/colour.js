// Colour stage: saturation flavours, bitcrusher, transient shaper, chorus, EQ.
// All operate on stereo frames in place via processStereo(l, r) -> this.l/this.r.

import { clamp, fastTanh, TWO_PI } from './util.js';
import { OnePoleLP, SVFCore, prewarp } from './filters.js';
import { EnvelopeFollower } from './envelope.js';

export const SAT_MODES = ['off', 'tape', 'tube', 'fold', 'crush', 'hard'];

class SatChannel {
  constructor(sr) { this.sr = sr; this.lp = new OnePoleLP(sr, 14000); this.hold = 0; this.holdN = 0; this.prev = 0; }
}

export class Saturator {
  constructor(sr, { mode = 'off', drive = 0, mix = 1, bits = 12, rate = 0.5 } = {}) {
    this.sr = sr; this.mode = mode; this.mix = clamp(mix, 0, 1);
    this.drive = 1 + clamp(drive, 0, 1) * 11;
    this.makeup = 1 / Math.pow(this.drive, mode === 'fold' ? 0.35 : 0.6);
    this.levels = Math.pow(2, clamp(bits, 2, 16) - 1);
    // rate 0..1 maps to sample-rate reduction factor 1..24
    this.step = Math.max(1, Math.round(1 + clamp(rate, 0, 1) * 23));
    this.ch = [new SatChannel(sr), new SatChannel(sr)];
    this.l = 0; this.r = 0;
  }
  shape(x, c) {
    const d = this.drive;
    switch (this.mode) {
      case 'tape': {
        // Soft, slightly asymmetric with a gentle high roll-off.
        const y = fastTanh(x * d + 0.08) - fastTanh(0.08);
        return c.lp.process(y) * this.makeup * 1.2;
      }
      case 'tube': {
        const v = x * d;
        const y = v >= 0 ? 1 - Math.exp(-v) : -(1 - Math.exp(v * 1.4)) / 1.4;
        return y * this.makeup * 1.3;
      }
      case 'fold': {
        return Math.sin(x * d * 1.5) * 0.8 * (0.6 + 0.4 * this.makeup);
      }
      case 'hard': {
        return clamp(x * d, -0.9, 0.9) * this.makeup * 1.1;
      }
      case 'crush': {
        if (c.holdN++ % this.step === 0) c.hold = x * Math.min(d, 3);
        return Math.round(clamp(c.hold, -1, 1) * this.levels) / this.levels;
      }
      default: return x;
    }
  }
  process(l, r) {
    if (this.mode === 'off' || this.mix === 0) { this.l = l; this.r = r; return; }
    const m = this.mix;
    this.l = l + (this.shape(l, this.ch[0]) - l) * m;
    this.r = r + (this.shape(r, this.ch[1]) - r) * m;
  }
}

/** Transient shaper: boosts/cuts attack and sustain independently (-1..1). */
export class TransientShaper {
  constructor(sr, attack = 0, sustain = 0) {
    this.fast = new EnvelopeFollower(sr, 0.0005, 0.06);
    this.slow = new EnvelopeFollower(sr, 0.015, 0.09);
    this.att = clamp(attack, -1, 1); this.sus = clamp(sustain, -1, 1);
    this.active = this.att !== 0 || this.sus !== 0;
    this.l = 0; this.r = 0;
  }
  process(l, r) {
    if (!this.active) { this.l = l; this.r = r; return; }
    const m = (Math.abs(l) + Math.abs(r)) * 0.5;
    const f = this.fast.process(m), s = this.slow.process(m);
    const diff = clamp((f - s) / (s + 1e-4), 0, 4); // >0 during attacks
    const isSus = clamp(1 - diff, 0, 1);
    const g = Math.pow(2, this.att * diff * 0.9) * Math.pow(2, this.sus * isSus * 0.8);
    const gg = clamp(g, 0.1, 6);
    this.l = l * gg; this.r = r * gg;
  }
}

/** BBD-flavoured stereo chorus/ensemble. */
export class Chorus {
  constructor(sr, { mix = 0, rate = 0.5, depth = 0.5, mode = 'juno' } = {}) {
    this.sr = sr; this.mix = clamp(mix, 0, 1);
    this.size = Math.ceil(sr * 0.05);
    this.bl = new Float64Array(this.size); this.br = new Float64Array(this.size);
    this.w = 0; this.ph = 0;
    this.rate = mode === 'ensemble' ? rate * 1.6 + 0.3 : rate * 0.9 + 0.2; // Hz
    this.depth = (mode === 'ensemble' ? 0.004 : 0.0025) * (0.3 + clamp(depth, 0, 1)) * sr;
    this.base = (mode === 'ensemble' ? 0.009 : 0.0065) * sr;
    this.voices = mode === 'ensemble' ? 3 : 1;
    this.lpL = new OnePoleLP(sr, 9000); this.lpR = new OnePoleLP(sr, 9000);
    this.l = 0; this.r = 0;
  }
  read(buf, d) {
    let rp = this.w - d; while (rp < 0) rp += this.size;
    const i = Math.floor(rp), f = rp - i;
    const a = buf[i], b = buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }
  process(l, r) {
    if (this.mix === 0) { this.l = l; this.r = r; return; }
    this.bl[this.w] = l; this.br[this.w] = r;
    let wl = 0, wr = 0;
    for (let v = 0; v < this.voices; v++) {
      const off = v / this.voices;
      const sL = Math.sin(TWO_PI * (this.ph + off));
      const sR = Math.sin(TWO_PI * (this.ph + off + 0.25));
      wl += this.read(this.bl, this.base + this.depth * sL);
      wr += this.read(this.br, this.base + this.depth * sR);
    }
    wl = this.lpL.process(wl / this.voices); wr = this.lpR.process(wr / this.voices);
    this.ph += this.rate / this.sr; if (this.ph >= 1) this.ph -= 1;
    this.w = (this.w + 1) % this.size;
    const m = this.mix;
    // Juno-style: the wet is cross-fed so it widens the image.
    this.l = l * (1 - m * 0.5) + wr * m * 0.8;
    this.r = r * (1 - m * 0.5) + wl * m * 0.8;
  }
}

/** Output EQ: low cut, high cut and a tilt (-1 dark .. +1 bright). */
export class OutputEQ {
  constructor(sr, { lowCut = 30, highCut = 18000, tilt = 0 } = {}) {
    this.hp = [new SVFCore(), new SVFCore()];
    this.lp = [new SVFCore(), new SVFCore()];
    this.tilt = [new OnePoleLP(sr, 800), new OnePoleLP(sr, 800)];
    for (const c of this.hp) c.set(prewarp(clamp(lowCut, 10, 2000), sr), 1.414);
    for (const c of this.lp) c.set(prewarp(clamp(highCut, 500, sr * 0.45), sr), 1.414);
    this.t = clamp(tilt, -1, 1);
    this.l = 0; this.r = 0;
  }
  ch(x, i) {
    this.hp[i].tick(x); x = this.hp[i].high;
    x = this.lp[i].tick(x);
    if (this.t !== 0) {
      const low = this.tilt[i].process(x), high = x - low;
      const g = Math.pow(2, this.t * 1.5);
      x = low / g + high * g;
    }
    return x;
  }
  process(l, r) { this.l = this.ch(l, 0); this.r = this.ch(r, 1); }
}
