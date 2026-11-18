// Texture layer: vinyl-style crackle and tape hiss laid over a stab.
// Clicks are short filtered noise bursts at random times (Poisson), with
// heavy-tailed sizes, random stereo position and the occasional deeper pop.
// "follow" makes the texture swell and fade with the sound, so it rides the
// stab and its tail instead of sitting at a constant level.

import { clamp, panGains, onePoleCoef } from './util.js';
import { SVFCore, prewarp, OnePoleLP, OnePoleHP } from './filters.js';

export class Texture {
  /**
   * @param {number} sr
   * @param {import('./rng.js').Rng} rng
   * @param {object} p { crackle, density, tone, hiss, follow }
   */
  constructor(sr, rng, p = {}) {
    this.sr = sr;
    this.rng = rng;
    this.crackle = clamp(p.crackle ?? 0, 0, 1);
    this.hiss = clamp(p.hiss ?? 0, 0, 1);
    this.follow = clamp(p.follow ?? 0.6, 0, 1);
    this.active = this.crackle > 0 || this.hiss > 0;
    // density 0..1 -> 3..250 clicks per second (log scale)
    const perSec = 3 * Math.pow(250 / 3, clamp(p.density ?? 0.4, 0, 1));
    this.prob = perSec / sr;
    // tone 0..1 -> click band 900 Hz .. 7 kHz
    const tone = clamp(p.tone ?? 0.5, 0, 1);
    this.clickBand = [new SVFCore(), new SVFCore()];
    for (const b of this.clickBand) b.set(prewarp(900 * Math.pow(7000 / 900, tone), sr), 1.1);
    this.popBand = [new SVFCore(), new SVFCore()];
    for (const b of this.popBand) b.set(prewarp(300 + tone * 400, sr), 0.9);
    this.clicks = []; // active bursts { amp, k, gl, gr, pop }
    // Hiss: white noise shaped bright, like tape.
    this.hissHP = [new OnePoleHP(sr, 1800 + tone * 2500), new OnePoleHP(sr, 1800 + tone * 2500)];
    this.hissLP = [new OnePoleLP(sr, 13000), new OnePoleLP(sr, 13000)];
    // Faint low surface rumble under the crackle.
    this.rumble = [new OnePoleLP(sr, 120), new OnePoleLP(sr, 120)];
    this.envA = onePoleCoef(0.004, sr);
    this.envR = onePoleCoef(0.35, sr);
    this.env = 0;
    this.peak = 1e-6;
    this.l = 0; this.r = 0;
  }

  /** @param {number} level current magnitude of the stab (dry + tail) */
  process(level) {
    if (!this.active) { this.l = 0; this.r = 0; return; }
    const rng = this.rng;
    // Normalised envelope of the sound, 0..1.
    const c = level > this.env ? this.envA : this.envR;
    this.env = level + c * (this.env - level);
    if (this.env > this.peak) this.peak = this.env;
    const envN = Math.min(1, this.env / this.peak);
    const gain = (1 - this.follow) + this.follow * Math.sqrt(envN);

    let l = 0, r = 0;
    if (this.crackle > 0) {
      if (rng.next() < this.prob) {
        const u = rng.next();
        const pop = u < 0.06;
        const [gl, gr] = panGains(rng.bipolar() * 0.8);
        this.clicks.push({
          amp: this.crackle * (pop ? 0.9 : 0.15 + 0.85 * u * u * u) * (pop ? 1 : 0.8),
          k: Math.exp(-1 / ((pop ? 0.004 : 0.0004 + rng.next() * 0.0012) * this.sr)),
          gl, gr, pop,
        });
        if (this.clicks.length > 24) this.clicks.shift();
      }
      let cl = 0, cr = 0, pl = 0, pr = 0;
      for (let i = this.clicks.length - 1; i >= 0; i--) {
        const k = this.clicks[i];
        const s = rng.bipolar() * k.amp;
        if (k.pop) { pl += s * k.gl; pr += s * k.gr; } else { cl += s * k.gl; cr += s * k.gr; }
        k.amp *= k.k;
        if (k.amp < 1e-4) this.clicks.splice(i, 1);
      }
      this.clickBand[0].tick(cl); this.clickBand[1].tick(cr);
      this.popBand[0].tick(pl); this.popBand[1].tick(pr);
      l += this.clickBand[0].band * 0.8 + this.popBand[0].band * 0.55;
      r += this.clickBand[1].band * 0.8 + this.popBand[1].band * 0.55;
      const rum = 0.012 * this.crackle;
      l += this.rumble[0].process(rng.bipolar()) * rum;
      r += this.rumble[1].process(rng.bipolar()) * rum;
    }
    if (this.hiss > 0) {
      const h = 0.028 * this.hiss * this.hiss + 0.004 * this.hiss;
      l += this.hissLP[0].process(this.hissHP[0].process(rng.bipolar())) * h;
      r += this.hissLP[1].process(this.hissHP[1].process(rng.bipolar())) * h;
    }
    // Scale with the stab's own level so quiet and loud stabs get the same
    // relative amount of texture.
    const rel = Math.min(2, this.peak * 4);
    this.l = l * gain * rel; this.r = r * gain * rel;
  }
}
