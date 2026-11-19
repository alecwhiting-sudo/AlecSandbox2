// Every song in the app. Each has its own saved copy in the browser and its
// own list of chat revisions (see revisions.js). Add new songs at the end.

import { buildSong } from './song.js';
import { buildSong2 } from './song2.js';
import { buildSong3 } from './song3.js';
import { REVISIONS, applyRevisions } from './revisions.js';

export const SONGS = [
  { id: 'one', title: 'Untitled Detroit', blurb: 'F minor', build: buildSong, revisions: REVISIONS },
  { id: 'undertow', title: 'Undertow', blurb: 'D minor, darker', build: buildSong2, revisions: [] },
  { id: 'woodward', title: 'Woodward Swing', blurb: 'C Dorian, jazzy', build: buildSong3, revisions: [] },
];

/** The first song's saved copies predate song ids. */
export const songIdOf = (song) => song?.songId ?? 'one';
export const songDef = (id) => SONGS.find((s) => s.id === id) ?? SONGS[0];

/** Apply the chat revisions this song hasn't had yet; returns their summaries. */
export function applySongRevisions(song) {
  return applyRevisions(song, songDef(songIdOf(song)).revisions);
}
