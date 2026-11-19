import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSong3, HOOK, HOOK_CHORDS, CHORDS3 } from '../src/song/song3.js';
import { checkHook } from '../scripts/hook-check.mjs';
import { Engine, songBars } from '../src/engine/engine.js';

test('Woodward Swing: 168 bars at 125 BPM in C Dorian, swung', () => {
  const s = buildSong3();
  assert.equal(s.bpm, 125); assert.equal(s.key, 'C'); assert.equal(songBars(s), 168);
  for (const [tid, cells] of Object.entries(s.arrangement)) {
    for (const [sid, c] of Object.entries(cells)) if (c) assert.ok(s.parts[tid][c.part], `${tid}.${sid} -> ${c.part}`);
  }
  for (const sec of s.sections) assert.ok(s.chords[sec.id]?.length, sec.id);
  assert.ok(Math.min(...s.curves.swing.map((p) => p[1])) >= 0.6);
});

test('the hook passes every catchiness check', () => {
  const r = checkHook(HOOK, HOOK_CHORDS, CHORDS3, [0, 2, 3, 5, 7, 9, 10]);
  for (const [name, v, ok] of r) assert.ok(ok, `${name}: ${v}`);
});

test('the hook is echoed: toms and congas share its opening rhythm', () => {
  const s = buildSong3();
  const cell = HOOK[0].map(([st]) => st);
  const toms = s.parts.toms.E.events.filter((e) => e.s < 16).map((e) => e.s);
  const congas = s.parts.perc.B.events.filter((e) => e.n === 3 && e.s < 16).map((e) => e.s);
  assert.deepEqual(toms, cell);
  assert.deepEqual(congas, cell);
  // The drop's lead is the whole hook, and nothing in it thins out with density.
  assert.ok(s.parts.lead.HOOK8.events.every((e) => e.r <= 0.05));
});

test('Woodward renders cleanly in the drop', () => {
  const s = buildSong3();
  const e = new Engine(s, 24000); e.seek(80);
  const n = Math.round(4 * 16 * e.stepLen);
  const L = new Float32Array(n), R = new Float32Array(n);
  e.render(L, R, n);
  let pk = 0, bad = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(L[i]); if (!Number.isFinite(a)) bad++; else pk = Math.max(pk, a); }
  assert.equal(bad, 0);
  assert.ok(pk > 0.3 && pk <= 1, `peak ${pk}`);
});
