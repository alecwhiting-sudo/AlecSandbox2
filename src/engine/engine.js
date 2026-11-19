// The engine: plays the song JSON sample by sample. Used by both live playback
// (inside an AudioWorklet) and the offline export, so they sound the same.
//
// Per 16th step it works out, for every track: which section and part is
// playing, the part's events at this step, whether each survives the density
// cut (event rank <= density), swing, and the channel settings driven by the
// energy curve and the track's energy-map cell. Events are scheduled to the
// exact sample (swing delays the odd 16ths).

import { clamp, dbToGain } from '../dsp/util.js';
import { Rng } from '../dsp/rng.js';
import { Kick, Toms, SubStab, Hats, Perc } from './drums.js';
import { PolyVoices, Fx } from './tonal.js';
import { Mixer } from './mixer.js';

const STEPS_PER_BAR = 16;

/** Linear interpolation through [[bar, value], ...] points. */
export function curveAt(points, bar) {
  if (!points || !points.length) return 1;
  if (bar <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [b1, v1] = points[i];
    if (bar <= b1) {
      const [b0, v0] = points[i - 1];
      return b1 === b0 ? v1 : v0 + (v1 - v0) * ((bar - b0) / (b1 - b0));
    }
  }
  return points[points.length - 1][1];
}

export function songBars(song) { return song.sections.reduce((a, s) => a + s.bars, 0); }

/** Section containing a bar: { section, index, startBar, barInSection }. */
export function sectionAt(song, bar) {
  let start = 0;
  for (let i = 0; i < song.sections.length; i++) {
    const s = song.sections[i];
    if (bar < start + s.bars) return { section: s, index: i, startBar: start, barInSection: bar - start };
    start += s.bars;
  }
  const i = song.sections.length - 1;
  return { section: song.sections[i], index: i, startBar: start - song.sections[i].bars, barInSection: song.sections[i].bars - 1 };
}

/** The chord playing at a bar within a section, plus where it started. */
export function chordAt(song, sectionId, barInSection) {
  const prog = song.chords[sectionId] ?? [];
  const cycle = prog.reduce((a, c) => a + c.bars, 0);
  if (!cycle) return null;
  let b = barInSection % cycle, start = 0;
  for (const c of prog) {
    if (b < start + c.bars) return { ...c, startBar: barInSection - (b - start) };
    start += c.bars;
  }
  return null;
}

function makeInstrument(sr, track, rng) {
  const p = track.params ?? {};
  switch (track.instrument) {
    case 'kick': return new Kick(sr, p, rng);
    case 'toms': return new Toms(sr, p, rng);
    case 'sub': return new SubStab(sr, p);
    case 'hats': return new Hats(sr, p, rng);
    case 'perc': return new Perc(sr, p, rng);
    case 'poly': return new PolyVoices(sr, p, rng);
    case 'fx': return new Fx(sr, p, rng);
    default: throw new Error(`unknown instrument ${track.instrument}`);
  }
}

export class Engine {
  /**
   * @param {object} song song JSON (from buildSong or edited)
   * @param {number} sr sample rate
   */
  constructor(song, sr = 48000) {
    this.sr = sr;
    this.rng = new Rng('one-song');
    this.perf = { energy: 0, density: 0, swing: 0, filter: 0, wash: 0, mute: {}, solo: {} };
    this.load(song);
    this.pos = 0;        // samples since bar 0
    this.step = -1;      // last step processed
    this.queue = [];     // scheduled events { at, t, note, vel, len }
    this.playing = true;
  }

  load(song) {
    this.song = song;
    this.bpm = song.bpm;
    this.stepLen = (60 / song.bpm / 4) * this.sr;
    this.totalBars = songBars(song);
    this.totalSamples = Math.round(this.totalBars * STEPS_PER_BAR * this.stepLen);
    this.tracks = song.tracks;
    this.inst = song.tracks.map((t) => makeInstrument(this.sr, t, this.rng.fork(t.id)));
    this.mixer = new Mixer(this.sr, song.bpm, song.tracks, song.master, this.rng.fork('mix'));
    this.live = song.tracks.map(() => ({ gain: 1, pan: 0, lp: 18000, hp: 20, delay: 0, reverb: 0, duck: 0, duckK: 0.999, drive: 0 }));
    this.wet = 1;
    this.lastChordKey = song.tracks.map(() => '');
  }

  /** Swap in an edited song without stopping (instruments rebuilt only if changed). */
  update(song) {
    const pos = this.pos, step = this.step;
    const sameTracks = JSON.stringify(song.tracks) === JSON.stringify(this.song.tracks) && JSON.stringify(song.master) === JSON.stringify(this.song.master);
    if (sameTracks) {
      this.song = song; this.totalBars = songBars(song);
      this.totalSamples = Math.round(this.totalBars * STEPS_PER_BAR * this.stepLen);
    } else {
      this.load(song);
    }
    this.pos = pos; this.step = step;
  }

  seek(bar) {
    this.pos = Math.max(0, Math.round(bar * STEPS_PER_BAR * this.stepLen));
    this.step = Math.floor(this.pos / this.stepLen) - 1;
    this.queue.length = 0;
    this.lastChordKey = this.tracks.map(() => '');
  }

  get bar() { return this.pos / (STEPS_PER_BAR * this.stepLen); }

  /** Everything the per-step logic needs, for one track at one bar. */
  trackState(ti, bar) {
    const song = this.song, track = this.tracks[ti];
    const where = sectionAt(song, Math.floor(bar));
    const cell = song.arrangement[track.id]?.[where.section.id] ?? null;
    const eg = clamp(curveAt(song.curves.energy, bar) + this.perf.energy, 0, 1.2);
    const cellE = cell ? cell.energy : 0;
    return { where, cell, eg, cellE };
  }

  onStep(stepIndex) {
    const song = this.song;
    const bar = stepIndex / STEPS_PER_BAR;
    const stepInBar = stepIndex % STEPS_PER_BAR;
    const barInt = Math.floor(bar);
    const swing = clamp(curveAt(song.curves.swing, bar) + this.perf.swing, 0.5, 0.75);
    const filt = clamp(curveAt(song.curves.filter, bar) + this.perf.filter, 0.05, 1.2);
    this.wet = clamp(curveAt(song.curves.wet, bar) + this.perf.wash, 0, 2);
    const glitch = clamp(curveAt(song.curves.glitch, bar), 0, 1);
    const stepStart = Math.round(stepIndex * this.stepLen);
    // Solo: when any track is soloed, only soloed tracks are heard.
    const solo = this.perf.solo ?? {};
    const anySolo = Object.values(solo).some(Boolean);

    for (let ti = 0; ti < this.tracks.length; ti++) {
      const track = this.tracks[ti];
      const { where, cell, eg, cellE } = this.trackState(ti, bar);
      const mix = track.mix;
      // Channel settings from energy: level, filter opening, sends.
      const e = clamp(cellE * (0.55 + 0.45 * eg), 0, 1.2);
      const live = this.live[ti];
      const audible = !this.perf.mute[track.id] && (!anySolo || solo[track.id]);
      live.gain = cell && audible ? dbToGain(mix.gain + (e - 1) * 6) : 0;
      live.pan = mix.pan ?? 0;
      // How much the low-pass follows energy and the song filter curve (hats barely, pads fully).
      const ff = mix.filterFollow ?? 1;
      live.lp = clamp(mix.lp * Math.pow(filt, ff) * Math.pow(2, (e - 1) * 2.2 * ff), 80, 19000);
      live.hp = mix.hp ?? 20;
      live.delay = (mix.delay ?? 0) * this.wet;
      live.reverb = (mix.reverb ?? 0) * this.wet;
      live.drive = mix.drive ?? 0;
      live.duck = mix.duck ?? 0;
      live.duckK = Math.exp(-1 / ((mix.duckRelease ?? 0.12) * this.sr));
      if (!cell) continue;

      const part = song.parts[track.id]?.[cell.part];
      if (!part) continue;
      const chord = chordAt(song, where.section.id, where.barInSection);

      // Pads: one long chord per chord change.
      if (part.follow === 'chords') {
        // New chord (or we just started/seeked mid-chord): play it for what's left.
        const key = chord ? `${where.section.id}:${chord.startBar}:${chord.name}` : '';
        if (chord && key !== this.lastChordKey[ti]) {
          this.lastChordKey[ti] = key;
          const stepsLeft = (chord.startBar + chord.bars - where.barInSection) * STEPS_PER_BAR - stepInBar;
          const lenSec = (stepsLeft * this.stepLen) / this.sr;
          this.schedule(stepStart, ti, chord.notes, 0.6 + 0.4 * e, lenSec * 0.98);
        }
        continue;
      }

      // Density: the cell sets the baseline, the song's energy curve lifts it.
      const density = clamp(0.2 + cellE * (0.7 + 0.3 * eg) + this.perf.density, 0, 1);
      const idx = (where.barInSection * STEPS_PER_BAR + stepInBar) % part.len;
      const swingDelay = idx % 2 === 1 ? (swing - 0.5) * 2 * this.stepLen : 0;
      for (const ev of part.events) {
        if (ev.s !== idx) continue;
        if (ev.r > density) continue;
        if (ev.p < 1 && this.rng.next() > ev.p) continue;
        let note = ev.n;
        if (note === 'C') note = chord ? chord.notes : null;
        else if (note === 'R') note = chord ? rootLow(chord.notes) : null;
        if (note == null && track.instrument !== 'kick') continue;
        const vel = clamp(ev.v * (0.7 + 0.3 * e), 0, 1);
        const lenSec = ((ev.l ?? 1) * this.stepLen) / this.sr;
        this.schedule(stepStart + swingDelay, ti, note, vel, lenSec);
      }
      // Glitch: occasional extra stutter hits on the percussion track.
      if (track.id === 'perc' && glitch > 0 && stepInBar % 4 === 3 && this.rng.next() < glitch * 0.08 * e) {
        this.schedule(stepStart + swingDelay, ti, 5, 0.5 * e, 0.05);
      }
    }
  }

  schedule(at, ti, note, vel, len) {
    this.queue.push({ at: Math.round(at), ti, note, vel, len });
  }

  fire(ev) {
    const inst = this.inst[ev.ti];
    if (this.tracks[ev.ti].instrument === 'kick') {
      inst.trigger(ev.note ?? this.tracks[ev.ti].params.note ?? 29, ev.vel);
      this.mixer.kick();
    } else inst.trigger(ev.note, ev.vel, ev.len);
  }

  /**
   * Render n samples into outL/outR. If stems is given ({[trackId]: [L,R]}, plus
   * 'delay' and 'reverb'), the pre-master channel outputs are written there too.
   */
  render(outL, outR, n, offset = 0, stems = null) {
    const nt = this.tracks.length;
    for (let i = 0; i < n; i++) {
      if (!this.playing || this.pos >= this.totalSamples) { outL[offset + i] = 0; outR[offset + i] = 0; continue; }
      const step = Math.floor(this.pos / this.stepLen);
      if (step !== this.step) { this.step = step; if (step < this.totalBars * STEPS_PER_BAR) this.onStep(step); }
      if (this.queue.length) {
        for (let q = 0; q < this.queue.length; q++) {
          if (this.queue[q].at <= this.pos) { this.fire(this.queue[q]); this.queue.splice(q, 1); q--; }
        }
      }
      for (let t = 0; t < nt; t++) {
        const inst = this.inst[t];
        inst.process();
        this.mixer.channels[t].process(inst.l, inst.r, this.live[t]);
      }
      this.mixer.process(this.wet);
      outL[offset + i] = this.mixer.l; outR[offset + i] = this.mixer.r;
      if (stems) {
        const j = offset + i;
        for (let t = 0; t < nt; t++) {
          const s = stems[this.tracks[t].id];
          if (s) { s[0][j] = this.mixer.channels[t].out[0]; s[1][j] = this.mixer.channels[t].out[1]; }
        }
        if (stems.delay) { stems.delay[0][j] = this.mixer.delayRet[0]; stems.delay[1][j] = this.mixer.delayRet[1]; }
        if (stems.reverb) { stems.reverb[0][j] = this.mixer.reverbRet[0]; stems.reverb[1][j] = this.mixer.reverbRet[1]; }
      }
      this.pos++;
    }
  }
}

/** Lowest chord note moved down into the sub range (F1..E2). */
function rootLow(notes) {
  let r = Math.min(...notes);
  while (r > 40) r -= 12;
  while (r < 29) r += 12;
  return r;
}
