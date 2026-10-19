import { type GameState, serializeGame, toIsoDate } from '@cle/engine';
import { engine } from '../engine.ts';
import type { JournalEntry } from './saves.ts';

function download(text: string, name: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Downloads the game as a JSON file. */
export function exportGame(state: GameState): void {
  download(serializeGame(state), `cle-en-main-${toIsoDate(state.clock.date)}.json`);
}

/** Downloads the game log (docs/08, 8.5): one JSON line per event or action. */
export function exportJournal(state: GameState, entries: readonly JournalEntry[]): void {
  const lines = entries.map((entry) => JSON.stringify(entry)).join('\n');
  download(lines, `cle-en-main-journal-${toIsoDate(state.clock.date)}.jsonl`);
}

/** Reads, migrates and validates a game file; throws SaveFormatError when invalid. */
export async function importGame(file: File): Promise<GameState> {
  return engine.loadGame(await file.text());
}
