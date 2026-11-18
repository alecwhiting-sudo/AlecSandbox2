// Notes, scales and chord vocabulary — from plain triads to properly
// discordant clusters. Each chord type carries a 0..1 dissonance rating that
// the random chord picker uses.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi) => NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
export const pcName = (pc) => NOTE_NAMES[((pc % 12) + 12) % 12];

export const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic minor': [0, 2, 3, 5, 7, 9, 11],
  'phrygian dominant': [0, 1, 4, 5, 7, 8, 10],
  'hungarian minor': [0, 2, 3, 6, 7, 8, 11],
  'whole tone': [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// suffix: shown after the root name. dis: dissonance 0..1. group: for the UI.
export const CHORD_TYPES = [
  { id: 'maj', suffix: '', iv: [0, 4, 7], dis: 0, group: 'Triads' },
  { id: 'min', suffix: 'm', iv: [0, 3, 7], dis: 0, group: 'Triads' },
  { id: 'power', suffix: '5', iv: [0, 7, 12], dis: 0, group: 'Triads' },
  { id: 'sus2', suffix: 'sus2', iv: [0, 2, 7], dis: 0.1, group: 'Triads' },
  { id: 'sus4', suffix: 'sus4', iv: [0, 5, 7], dis: 0.1, group: 'Triads' },
  { id: 'dim', suffix: 'dim', iv: [0, 3, 6], dis: 0.45, group: 'Triads' },
  { id: 'aug', suffix: 'aug', iv: [0, 4, 8], dis: 0.45, group: 'Triads' },

  { id: 'min7', suffix: 'm7', iv: [0, 3, 7, 10], dis: 0.1, group: 'Sevenths' },
  { id: 'maj7', suffix: 'maj7', iv: [0, 4, 7, 11], dis: 0.2, group: 'Sevenths' },
  { id: 'dom7', suffix: '7', iv: [0, 4, 7, 10], dis: 0.25, group: 'Sevenths' },
  { id: '7sus4', suffix: '7sus4', iv: [0, 5, 7, 10], dis: 0.2, group: 'Sevenths' },
  { id: 'm6', suffix: 'm6', iv: [0, 3, 7, 9], dis: 0.25, group: 'Sevenths' },
  { id: '6', suffix: '6', iv: [0, 4, 7, 9], dis: 0.15, group: 'Sevenths' },
  { id: 'm7b5', suffix: 'm7b5', iv: [0, 3, 6, 10], dis: 0.4, group: 'Sevenths' },
  { id: 'dim7', suffix: 'dim7', iv: [0, 3, 6, 9], dis: 0.5, group: 'Sevenths' },
  { id: 'mmaj7', suffix: 'm(maj7)', iv: [0, 3, 7, 11], dis: 0.5, group: 'Sevenths' },

  { id: 'add9', suffix: 'add9', iv: [0, 4, 7, 14], dis: 0.15, group: 'Extended' },
  { id: 'madd9', suffix: 'madd9', iv: [0, 3, 7, 14], dis: 0.2, group: 'Extended' },
  { id: 'min9', suffix: 'm9', iv: [0, 3, 7, 10, 14], dis: 0.2, group: 'Extended' },
  { id: 'maj9', suffix: 'maj9', iv: [0, 4, 7, 11, 14], dis: 0.25, group: 'Extended' },
  { id: 'dom9', suffix: '9', iv: [0, 4, 7, 10, 14], dis: 0.3, group: 'Extended' },
  { id: 'min11', suffix: 'm11', iv: [0, 3, 7, 10, 14, 17], dis: 0.3, group: 'Extended' },
  { id: 'dom13', suffix: '13', iv: [0, 4, 10, 14, 21], dis: 0.4, group: 'Extended' },
  { id: 'maj7#11', suffix: 'maj7#11', iv: [0, 4, 7, 11, 18], dis: 0.4, group: 'Extended' },
  { id: '7#9', suffix: '7#9', iv: [0, 4, 7, 10, 15], dis: 0.6, group: 'Extended' },
  { id: '7b9', suffix: '7b9', iv: [0, 4, 7, 10, 13], dis: 0.65, group: 'Extended' },

  { id: 'quartal', suffix: ' quartal', iv: [0, 5, 10, 15], dis: 0.3, group: 'Stacks' },
  { id: 'quintal', suffix: ' fifths', iv: [0, 7, 14, 21], dis: 0.15, group: 'Stacks' },
  { id: 'sowhat', suffix: ' so-what', iv: [0, 5, 10, 15, 19], dis: 0.3, group: 'Stacks' },
  { id: 'tritones', suffix: ' tritones', iv: [0, 6, 11, 17], dis: 0.7, group: 'Stacks' },
  { id: 'mystic', suffix: ' mystic', iv: [0, 6, 10, 16, 21, 26], dis: 0.75, group: 'Stacks' },

  { id: 'poly2', suffix: ' poly(+2)', iv: [0, 4, 7, 14, 18, 21], dis: 0.7, group: 'Discordant' },
  { id: 'petrushka', suffix: ' petrushka', iv: [0, 4, 7, 6, 10, 13], dis: 0.9, group: 'Discordant' },
  { id: 'elektra', suffix: ' elektra', iv: [0, 7, 9, 13, 16], dis: 0.85, group: 'Discordant' },
  { id: 'viennese', suffix: ' viennese', iv: [0, 1, 6], dis: 0.9, group: 'Discordant' },
  { id: 'wtcluster', suffix: ' whole-tone', iv: [0, 2, 4, 6, 8], dis: 0.6, group: 'Discordant' },
  { id: 'cluster3', suffix: ' cluster', iv: [0, 1, 2], dis: 0.85, group: 'Discordant' },
  { id: 'cluster5', suffix: ' big cluster', iv: [0, 1, 2, 3, 4], dis: 1, group: 'Discordant' },
  { id: 'minmaj', suffix: ' min/maj', iv: [0, 3, 4, 7], dis: 0.75, group: 'Discordant' },
];

export const CHORD_BY_ID = Object.fromEntries(CHORD_TYPES.map((c) => [c.id, c]));

const pcsKey = (pcs) => [...new Set(pcs.map((p) => ((p % 12) + 12) % 12))].sort((a, b) => a - b).join(',');

/** Name a set of MIDI notes. Prefers the lowest note as root, then any root. */
export function detectChord(notes) {
  if (!notes.length) return '—';
  const sorted = [...notes].sort((a, b) => a - b);
  const set = pcsKey(sorted);
  const bassPc = ((sorted[0] % 12) + 12) % 12;
  const candidates = [bassPc, ...new Set(sorted.map((n) => ((n % 12) + 12) % 12))];
  for (const root of candidates) {
    for (const t of CHORD_TYPES) {
      if (pcsKey(t.iv.map((i) => i + root)) === set) {
        const name = pcName(root) + t.suffix;
        return root === bassPc ? name : `${name}/${pcName(bassPc)}`;
      }
    }
  }
  return [...new Set(sorted.map((n) => pcName(n)))].join('·');
}

/** Rough dissonance of an arbitrary note set (0..1) from its interval content. */
export function dissonanceOf(notes) {
  const pcs = [...new Set(notes.map((n) => ((n % 12) + 12) % 12))];
  if (pcs.length < 2) return 0;
  // Roughness weights per interval class 1..6
  const W = [0, 1, 0.55, 0.15, 0.1, 0.05, 0.7];
  let total = 0, pairs = 0;
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      let ic = Math.abs(pcs[i] - pcs[j]) % 12; if (ic > 6) ic = 12 - ic;
      total += W[ic]; pairs++;
    }
  }
  return Math.min(1, (total / pairs) * 1.6);
}
