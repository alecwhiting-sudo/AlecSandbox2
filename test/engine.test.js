import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSong, autoRank } from '../src/song/song.js';
import { Engine, curveAt, sectionAt, chordAt, songBars } from '../src/engine/engine.js';

const SR = 24000;
const render = (song, from, bars) => {
  const e = new Engine(song, SR); e.seek(from);
  const n = Math.round(bars * 16 * e.stepLen);
  const L = new Float32Array(n), R = new Float32Array(n);
  e.render(L, R, n);
  return { L, R, e };
};

test('the song is 212 bars at 130 BPM in F minor (about 6:31)', () => {
  const s = buildSong();
  assert.equal(s.bpm, 130); assert.equal(s.key, 'F'); assert.equal(s.scale, 'minor');
  assert.equal(songBars(s), 212);
  const secs = (212 * 4 * 60) / 130;
  assert.ok(secs > 385 && secs < 400, `${secs}s`);
  assert.equal(s.tracks.length, 9);
});

test('curves, sections and chords resolve', () => {
  const s = buildSong();
  assert.equal(curveAt([[0, 0], [10, 1]], 5), 0.5);
  assert.equal(sectionAt(s, 0).section.id, 'intro');
  assert.equal(sectionAt(s, 112).section.id, 'drop');
  assert.equal(sectionAt(s, 211).section.id, 'outro');
  assert.equal(chordAt(s, 'groove', 2).name, 'Fm(b9)');
  assert.equal(chordAt(s, 'drop', 5).name, 'Dbmaj7#11');
});

test('every section renders finite audio under the limiter ceiling', () => {
  const s = buildSong();
  for (const from of [0, 64, 96, 112, 144, 200]) {
    const { L, R } = render(s, from, 2);
    let pk = 0;
    for (let i = 0; i < L.length; i++) { assert.ok(Number.isFinite(L[i]) && Number.isFinite(R[i])); pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    assert.ok(pk > 0.05 && pk < 0.95, `bar ${from}: peak ${pk}`);
  }
});

test('rendering is deterministic', () => {
  const s = buildSong();
  const a = render(s, 64, 1).L, b = render(s, 64, 1).L;
  assert.deepEqual(Array.from(a.slice(0, 5000)), Array.from(b.slice(0, 5000)));
});

test('density cuts low-priority hits first', () => {
  assert.ok(autoRank(0, 1) < autoRank(8, 1));
  assert.ok(autoRank(8, 1) < autoRank(2, 1));
  assert.ok(autoRank(2, 1) < autoRank(3, 1));
  const s = buildSong();
  const count = (dens) => {
    const e = new Engine(s, SR); e.perf.density = dens; e.seek(144);
    let hits = 0;
    const fire = e.fire.bind(e);
    e.fire = (ev) => { if (e.tracks[ev.ti].id === 'perc') hits++; fire(ev); };
    const n = Math.round(4 * 16 * e.stepLen);
    e.render(new Float32Array(n), new Float32Array(n), n);
    return hits;
  };
  assert.ok(count(-0.6) < count(0));
});

test('the kick ducks the pads (sidechain)', () => {
  const s = buildSong();
  const e = new Engine(s, SR); e.seek(113);
  const n = Math.round(4 * 16 * e.stepLen);
  const pads = [new Float32Array(n), new Float32Array(n)];
  e.render(new Float32Array(n), new Float32Array(n), n, 0, { pads });
  // Bar 3, beat 2 (pads fully faded in): right after the kick vs just before it.
  const beat = Math.round((2 * 16 + 4) * e.stepLen);
  const rms = (a, b) => { let x = 0; for (let i = a; i < b; i++) x += pads[0][i] ** 2; return Math.sqrt(x / (b - a)); };
  const after = rms(beat + 20, beat + Math.round(0.03 * SR));
  const before = rms(beat - Math.round(0.06 * SR), beat - 20);
  assert.ok(after < before * 0.6, `after ${after} before ${before}`);
});

test('solo: only soloed tracks are heard', () => {
  const s = buildSong();
  const level = (perf) => {
    const e = new Engine(s, SR); Object.assign(e.perf, perf); e.seek(113);
    const n = Math.round(16 * e.stepLen);
    const st = Object.fromEntries(s.tracks.map((t) => [t.id, [new Float32Array(n), new Float32Array(n)]]));
    e.render(new Float32Array(n), new Float32Array(n), n, 0, st);
    return Object.fromEntries(Object.entries(st).map(([id, [l]]) => [id, l.reduce((a, v) => a + v * v, 0)]));
  };
  const all = level({});
  const soloed = level({ solo: { toms: true, pads: true } });
  assert.ok(all.kick > 0 && all.hats > 0);
  assert.ok(soloed.toms > 0 && soloed.pads > 0);
  for (const id of ['kick', 'hats', 'perc', 'sub', 'stabs', 'lead']) assert.equal(soloed[id], 0, id);
});

test('revision r1: livelier intro with anticipation into the build', async () => {
  const { applyRevisions } = await import('../src/song/revisions.js');
  const { applyOps } = await import('../src/ui/ask.js');
  const s = buildSong();
  const applied = applyRevisions(s);
  assert.equal(applied.length >= 1, true);
  assert.deepEqual(applyRevisions(s), [], 'applied once only');
  assert.equal(s.arrangement.stabs.intro.part, 'INTRO');
  // Kick: four to the floor except the intro's last bar.
  const kick = s.parts.kick.INTRO.events;
  assert.ok(kick.some((e) => e.s === 480) && !kick.some((e) => e.s >= 496));
  // Render: last intro bar has no kick, a snare roll, and the riser.
  const e = new Engine(s, SR); e.seek(24); // where the riser starts
  const kickHits = [];
  const fire = e.fire.bind(e);
  e.fire = (ev) => { if (e.tracks[ev.ti].id === 'kick') kickHits.push(ev.at); fire(ev); };
  const n = Math.round(8 * 16 * e.stepLen), bar = Math.round(16 * e.stepLen);
  const st = { kick: [new Float32Array(n), new Float32Array(n)], perc: [new Float32Array(n), new Float32Array(n)], fx: [new Float32Array(n), new Float32Array(n)] };
  e.render(new Float32Array(n), new Float32Array(n), n, 0, st);
  const pk = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const last = (a) => a.subarray(n - bar + Math.round(0.8 * SR)); // after the previous kick has rung out
  const lastBarStart = Math.round(31 * 16 * e.stepLen);
  assert.ok(kickHits.length > 20, 'kick plays before');
  assert.equal(kickHits.filter((t) => t >= lastBarStart).length, 0, 'no kick in the last intro bar');
  assert.ok(pk(last(st.perc[0])) > 0.05, 'snare roll');
  assert.ok(pk(last(st.fx[0])) > pk(st.fx[0].subarray(0, bar)) * 3, 'riser grows');
  // A user's edited copy keeps its edits when the revision lands.
  const mine = buildSong();
  applyOps(mine, [{ op: 'energy', track: 'toms', section: 'intro', value: 1.1 }]);
  applyRevisions(mine);
  assert.equal(mine.arrangement.toms.intro.energy, 1.1);
  assert.equal(mine.arrangement.stabs.intro.part, 'INTRO');
});
