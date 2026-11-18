// Stereo-linked feed-forward compressor with a soft knee.
// The detector works in decibels with separate attack and release, which keeps
// it smooth on long tails. compute() returns a linear gain for the current
// frame (makeup and parallel mix included), so the caller can apply the same
// gain to several signals: the dry and tail stems in Glue mode.

import { clamp, onePoleCoef } from './util.js';

export const COMP_MODES = ['stab', 'glue'];

export class Compressor {
  /**
   * @param {number} sr
   * @param {object} p { amount 0..1, ratio, attack s, release s, mix 0..1, mode }
   */
  constructor(sr, p = {}) {
    this.amount = clamp(p.amount ?? 0, 0, 1);
    this.active = this.amount > 0;
    this.mode = p.mode === 'glue' ? 'glue' : 'stab';
    this.ratio = clamp(p.ratio ?? 4, 1, 20);
    // Amount sets how far the threshold sits below a typical stab peak.
    this.thrDb = -8 - this.amount * 28;
    this.kneeDb = 6;
    this.mix = clamp(p.mix ?? 1, 0, 1);
    this.makeupDb = -this.thrDb * (1 - 1 / this.ratio) * 0.4;
    this.ca = onePoleCoef(clamp(p.attack ?? 0.01, 0.0002, 0.3), sr);
    this.cr = onePoleCoef(clamp(p.release ?? 0.15, 0.01, 2), sr);
    this.grDb = 0; // current gain reduction (negative dB)
  }

  // Static curve: gain change in dB for an input level in dB (soft knee).
  curve(x) {
    const t = this.thrDb, k = this.kneeDb, r = this.ratio;
    const over = x - t;
    if (2 * over < -k) return 0;
    if (2 * Math.abs(over) <= k) return ((1 / r - 1) * (over + k / 2) ** 2) / (2 * k);
    return (1 / r - 1) * over;
  }

  /** Linear gain for this frame, from the detector input (stereo-linked). */
  compute(l, r) {
    if (!this.active) return 1;
    const lvl = Math.max(Math.abs(l), Math.abs(r));
    const x = 20 * Math.log10(lvl + 1e-9);
    const target = this.curve(x);
    // Attack when more reduction is needed (target more negative).
    const c = target < this.grDb ? this.ca : this.cr;
    this.grDb = target + c * (this.grDb - target);
    const wet = Math.pow(10, (this.grDb + this.makeupDb) / 20);
    return (1 - this.mix) + this.mix * wet;
  }
}
