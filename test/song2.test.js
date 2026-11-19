import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, songDef, songIdOf, applySongRevisions } from '../src/song/songs.js';
import { buildSong2 } from '../src/song/song2.js';
import { Engine, songBars, chordAt } from '../src/engine/engine.js';
import { applyOps, parseSimple } from '../src/ui/ask.js';

const SR = 24000;

test('the song list has the first song and Undertow', () => {
  assert.deepEqual(SONGS.map((s) => s.id), ['one', 'undertow', 'woodward']);
  assert.equal(songIdOf({}), 'one'); // saved copies from before song ids
  assert.equal(songIdOf(buildSong2()), 'undertow');
  assert.equal(songDef('nope').id, 'one');
  // Undertow gets none of the first song's revisions.
  const s = buildSong2();
  assert.deepEqual(applySongRevisions(s), []);
});

test('Undertow: 208 bars at 126 BPM in D minor (about 6:36)', () => {
  const s = buildSong2();
  assert.equal(s.bpm, 126); assert.equal(s.key, 'D');
  assert.equal(songBars(s), 208);
  // Every part a cell points at exists, and every section has chords.
  for (const [tid, cells] of Object.entries(s.arrangement)) {
    for (const [sid, c] of Object.entries(cells)) if (c) assert.ok(s.parts[tid][c.part], `${tid}.${sid} -> ${c.part}`);
  }
  for (const sec of s.sections) assert.ok(s.chords[sec.id]?.length, sec.id);
  // Long parts fit their sections.
  assert.equal(s.parts.kick.I.len, 24 * 16);
});

test('Undertow lead stays in D Phrygian (C# and E only over A7b9)', () => {
  const s = buildSong2();
  const phrygian = [2, 3, 5, 7, 9, 10, 0];
  for (const [pid, sec] of [['T', 'tunnel'], ['D', 'drop'], ['AH', 'afterhours']]) {
    for (const e of s.parts.lead[pid].events) {
      const bar = Math.floor(e.s / 16);
      const chord = chordAt(s, sec, bar).name;
      const ok = phrygian.includes(e.n % 12) || ([1, 4].includes(e.n % 12) && chord === 'A7b9');
      assert.ok(ok, `${pid} note ${e.n} at bar ${bar} over ${chord}`);
    }
  }
});

test('Undertow renders cleanly in the drop', () => {
  const s = buildSong2();
  const e = new Engine(s, SR); e.seek(120);
  const n = Math.round(4 * 16 * e.stepLen);
  const L = new Float32Array(n), R = new Float32Array(n);
  e.render(L, R, n);
  let pk = 0, bad = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(L[i]); if (!Number.isFinite(a)) bad++; else pk = Math.max(pk, a); }
  assert.equal(bad, 0);
  assert.ok(pk > 0.3 && pk <= 1, `peak ${pk}`);
});

test('edits know Undertow\'s own sections and chords', () => {
  const s = buildSong2();
  const ops = parseSimple('sequence busier in the afterhours', s);
  assert.ok(ops.some((o) => o.track === 'lead' && o.section === 'afterhours'), JSON.stringify(ops));
  applyOps(s, [{ op: 'chords', section: 'tunnel', chords: [{ name: 'Gm9', bars: 2 }, { name: 'Fm9', bars: 2 }] }]);
  assert.deepEqual(s.chords.tunnel.map((c) => c.name), ['Gm9']); // Fm9 is the first song's chord
});
