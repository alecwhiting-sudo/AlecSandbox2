// Changes made to the song by Claude in chat, after people may already have
// edited their own copy in the app. Each revision is a list of edit ops (see
// applyOps in src/ui/ask.js). The app applies any revision a saved song
// hasn't had yet, so your own tweaks are kept. Add new revisions at the end.

import { applyOps } from '../ui/ask.js';

// Bars/steps: the intro is bars 0-31 (steps 0-511); the build starts at bar 32.
const roll = [];
for (let s = 480; s < 496; s += 2) roll.push({ s, n: 6, v: 0.3 + (s - 480) / 64, l: 1, r: 0 });     // 8ths, bar 31
for (let s = 496; s < 512; s++) roll.push({ s, n: 6, v: 0.55 + (s - 496) / 36, l: 1, r: 0 });      // 16ths, bar 32

export const REVISIONS = [
  {
    id: 'r1-intro',
    summary: 'Livelier intro: a sparse dub stab every 8 beats, and anticipation into the build (riser, filter lift, snare roll, kick drops for the last bar)',
    ops: [
      // A dark dub chord stab on the "and" of beat 2, once every 8 beats.
      { op: 'newpart', track: 'stabs', part: 'INTRO', len: 32, add: [{ s: 6, n: 'C', v: 0.7, l: 2, r: 0.1 }] },
      { op: 'part', track: 'stabs', section: 'intro', part: 'INTRO', energy: 0.5 },
      // Kick plays four to the floor, then drops out for the intro's last bar.
      { op: 'newpart', track: 'kick', part: 'INTRO', len: 512, tile: 'A', removeRange: [496, 512] },
      { op: 'part', track: 'kick', section: 'intro', part: 'INTRO' },
      // Percussion keeps its rims and adds a snare roll over the last 2 bars.
      { op: 'newpart', track: 'perc', part: 'INTRO', len: 512, tile: 'A', add: roll },
      { op: 'part', track: 'perc', section: 'intro', part: 'INTRO' },
      // An 8-bar riser into the build.
      { op: 'newpart', track: 'fx', part: 'INTRO', len: 512, add: [{ s: 384, n: 0, v: 0.85, l: 128, r: 0 }] },
      { op: 'part', track: 'fx', section: 'intro', part: 'INTRO', energy: 0.75 },
      // Filter opens over the last 8 bars of the intro.
      { op: 'curve', curve: 'filter', from: 24, to: 24, value: 0.5 },
      { op: 'curve', curve: 'filter', from: 31, to: 31, value: 0.85 },
    ],
  },
];

/** Apply revisions the song hasn't had. Returns the summaries applied. */
export function applyRevisions(song) {
  song.revisions = song.revisions ?? [];
  const applied = [];
  for (const r of REVISIONS) {
    if (song.revisions.includes(r.id)) continue;
    applyOps(song, r.ops);
    song.revisions.push(r.id);
    applied.push(r.summary);
  }
  return applied;
}
