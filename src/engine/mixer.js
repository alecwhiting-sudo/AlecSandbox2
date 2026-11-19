// Mixer: per-track channel strips, two send buses (tape delay, reverb) and a
// master chain (glue compressor, kick pump, look-ahead limiter).

import { clamp, dbToGain, fastTanh, panGains, DIVISIONS, beatsToSeconds } from '../dsp/util.js';
import { SVFCore, prewarp, OnePoleHP } from '../dsp/filters.js';
import { StereoDelay } from '../dsp/delay.js';
import { Reverb } from '../dsp/reverb.js';
import { Compressor } from '../dsp/compressor.js';

const CTRL = 32; // control-rate interval for filter coefficient updates

/** Channel strip: HP, LP, drive, sidechain duck, gain, pan, sends. */
export class Channel {
  constructor(sr, mix = {}) {
    this.sr = sr; this.mix = mix;
    this.hp = [new SVFCore(), new SVFCore()];
    this.lp = [new SVFCore(), new SVFCore()];
    this.n = 0; this.lpCut = mix.lp ?? 18000; this.hpCut = mix.hp ?? 20;
    // Optional bell cut/boost (e.g. take the fuzzy low-mids out of the toms).
    this.cutDb = mix.cutDb ?? 0;
    if (this.cutDb) {
      this.bell = [new SVFCore(), new SVFCore()];
      const k = 1 / clamp(mix.cutQ ?? 1.2, 0.3, 8);
      for (const f of this.bell) f.set(prewarp(clamp(mix.cutFreq ?? 320, 40, 8000), sr), k);
      this.bellK = k; this.bellG = dbToGain(this.cutDb) - 1;
    }
    this.duckEnv = 0;
    this.out = [0, 0]; this.sendD = [0, 0]; this.sendR = [0, 0];
    this.setFilters(this.lpCut, this.hpCut);
  }
  setFilters(lp, hp) {
    this.lpCut = clamp(lp, 60, 19000); this.hpCut = clamp(hp, 15, 4000);
    const q = clamp(this.mix.res ?? 0.15, 0, 0.9);
    for (const f of this.lp) f.set(prewarp(this.lpCut, this.sr), 1.414 * (1 - q) + 0.1);
    for (const f of this.hp) f.set(prewarp(this.hpCut, this.sr), 1.414);
  }
  /** Kick hit: the duck envelope jumps to full. */
  duck() { this.duckEnv = 1; }
  /**
   * @param {number} l @param {number} r input
   * @param {object} live per-step values { gain, lp, hp, delay, reverb, duck, drive }
   */
  process(l, r, live) {
    if (this.n++ % CTRL === 0 && (live.lp !== this.lpCut || live.hp !== this.hpCut)) this.setFilters(live.lp, live.hp);
    this.hp[0].tick(l); this.hp[1].tick(r);
    let x0 = this.hp[0].high, x1 = this.hp[1].high;
    if (this.bell) {
      // Normalised band-pass (peak 1) added back with gain: a peaking EQ.
      this.bell[0].tick(x0); this.bell[1].tick(x1);
      x0 += this.bellG * this.bellK * this.bell[0].band; x1 += this.bellG * this.bellK * this.bell[1].band;
    }
    this.lp[0].tick(x0); this.lp[1].tick(x1);
    let a = this.lp[0].low, b = this.lp[1].low;
    if (live.drive > 0) {
      const d = 1 + live.drive * 6, n = 1 / fastTanh(d);
      a = fastTanh(a * d) * n; b = fastTanh(b * d) * n;
    }
    // Sidechain: duck to the kick, release back over `duckRelease`.
    const duck = 1 - live.duck * this.duckEnv;
    this.duckEnv *= live.duckK;
    const [pl, pr] = panGains(live.pan);
    const g = live.gain * duck;
    a *= g * pl * 1.414; b *= g * pr * 1.414;
    this.out[0] = a; this.out[1] = b;
    this.sendD[0] = a * live.delay; this.sendD[1] = b * live.delay;
    this.sendR[0] = a * live.reverb; this.sendR[1] = b * live.reverb;
  }
}

/** Streaming look-ahead peak limiter (about 1.5 ms ahead). */
export class Limiter {
  constructor(sr, ceilingDb = -0.8, release = 0.08) {
    this.look = Math.max(8, Math.round(sr * 0.0015));
    this.size = this.look + 1;
    this.bl = new Float64Array(this.size); this.br = new Float64Array(this.size);
    this.pk = new Float64Array(this.size);
    this.w = 0; this.g = 1;
    this.ceiling = dbToGain(ceilingDb);
    this.rel = 1 - Math.exp(-1 / (release * sr));
    this.l = 0; this.r = 0; this.gr = 0;
  }
  process(l, r) {
    const i = this.w;
    this.bl[i] = l; this.br[i] = r; this.pk[i] = Math.max(Math.abs(l), Math.abs(r));
    this.w = (i + 1) % this.size;
    let mx = 0; // window is small, so a direct max is cheap enough
    for (let k = 0; k < this.size; k++) if (this.pk[k] > mx) mx = this.pk[k];
    const target = mx > this.ceiling ? this.ceiling / mx : 1;
    this.g = target < this.g ? target : this.g + (target - this.g) * this.rel;
    const o = this.w; // oldest sample = delayed output
    this.l = this.bl[o] * this.g; this.r = this.br[o] * this.g;
    if (1 - this.g > this.gr) this.gr = 1 - this.g;
  }
}

export class Mixer {
  constructor(sr, bpm, tracks, master = {}, rng) {
    this.sr = sr;
    this.channels = tracks.map((t) => new Channel(sr, t.mix));
    const beat = (d) => DIVISIONS[d] ?? 0.75;
    this.delay = new StereoDelay(sr, bpm, {
      mode: master.delayMode ?? 'tape', division: master.delayTime ?? '1/8d',
      feedback: master.delayFeedback ?? 0.55, lpf: 3200, hpf: 250, grit: master.delayGrit ?? 0.55, wow: 0.35,
    }, rng.fork('delay'));
    this.reverb = new Reverb(sr, { type: 'hall', size: 0.85, decay: master.reverbDecay ?? 5.5, damping: 0.5, hpf: 280, predelay: 0.03, width: 1.2 });
    this.delayToReverb = 0.35;
    this.glue = new Compressor(sr, { amount: master.glue ?? 0.45, mode: 'glue', ratio: 3, attack: 0.01, release: 0.18, mix: 1 });
    this.limiter = new Limiter(sr, master.ceilingDb ?? -0.8);
    this.pumpEnv = 0; this.pumpK = Math.exp(-1 / ((master.pumpRelease ?? 0.16) * sr)); this.pump = master.pump ?? 0.22;
    this.masterGain = dbToGain(master.gainDb ?? 0);
    this.l = 0; this.r = 0;
    this.delayRet = [0, 0]; this.reverbRet = [0, 0];
  }
  kick() { this.pumpEnv = 1; for (const c of this.channels) c.duck(); }
  /** Sum channel outputs (already processed), run buses and master. */
  process(wetGain = 1) {
    let l = 0, r = 0, dl = 0, dr = 0, rl = 0, rr = 0;
    for (const c of this.channels) {
      l += c.out[0]; r += c.out[1];
      dl += c.sendD[0]; dr += c.sendD[1];
      rl += c.sendR[0]; rr += c.sendR[1];
    }
    this.delay.process(dl, dr);
    const yl = this.delay.l * wetGain, yr = this.delay.r * wetGain;
    this.reverb.process(rl + yl * this.delayToReverb, rr + yr * this.delayToReverb);
    const vl = this.reverb.l * wetGain, vr = this.reverb.r * wetGain;
    this.delayRet[0] = yl; this.delayRet[1] = yr;
    this.reverbRet[0] = vl; this.reverbRet[1] = vr;
    l += yl + vl; r += yr + vr;
    // Glue compression on the whole mix, then a gentle kick pump.
    const g = this.glue.compute(l, r);
    const pump = 1 - this.pump * this.pumpEnv;
    this.pumpEnv *= this.pumpK;
    l *= g * pump * this.masterGain; r *= g * pump * this.masterGain;
    this.limiter.process(l, r);
    this.l = this.limiter.l; this.r = this.limiter.r;
  }
}
