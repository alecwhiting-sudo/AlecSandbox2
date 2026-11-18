import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSong } from '../src/song/song.js';
import { applyOps, parseSimple } from '../src/ui/ask.js';

test('simple parser keeps clauses apart', () => {
  const s = buildSong();
  const ops = parseSimple('hats busier and brighter in the build, 60% swing in the groove', s);
  const swing = ops.filter((o) => o.op === 'curve');
  assert.equal(swing.length, 1);
  assert.deepEqual([swing[0].from, swing[0].to, swing[0].value], [64, 96, 0.6]);
  assert.ok(ops.some((o) => o.op === 'energy' && o.track === 'hats' && o.section === 'build'));
  assert.ok(ops.some((o) => o.op === 'mix' && o.track === 'hats' && o.key === 'lp'));
});

test('applyOps edits the song and reports changes; bad ops are skipped', () => {
  const s = buildSong();
  const lines = applyOps(s, [
    { op: 'energy', track: 'toms', section: 'build', value: 1 },
    { op: 'mix', track: 'pads', key: 'lp', factor: 0.5 },
    { op: 'chords', section: 'drop', chords: [{ name: 'Bbm11', bars: 8 }, { name: 'Nope', bars: 2 }] },
    { op: 'notes', track: 'hats', part: 'A', add: [{ s: 3, n: 1, v: 0.9 }] },
    { op: 'part', track: 'lead', section: 'peak', part: null },
    { op: 'explode' },
  ]);
  assert.equal(s.arrangement.toms.build.energy, 1);
  assert.equal(s.tracks.find((t) => t.id === 'pads').mix.lp, 3250);
  assert.deepEqual(s.chords.drop.map((c) => c.name), ['Bbm11']);
  assert.ok(s.parts.hats.A.events.some((e) => e.s === 3 && e.n === 1));
  assert.equal(s.arrangement.lead.peak, null);
  assert.ok(lines.some((l) => l.startsWith('Skipped explode')));
});
