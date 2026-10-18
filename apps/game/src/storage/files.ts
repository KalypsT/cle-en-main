import { type GameState, serializeGame, toIsoDate } from '@cle/engine';
import { engine } from '../engine.ts';

/** Downloads the game as a JSON file. */
export function exportGame(state: GameState): void {
  const blob = new Blob([serializeGame(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cle-en-main-${toIsoDate(state.clock.date)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Reads, migrates and validates a game file; throws SaveFormatError when invalid. */
export async function importGame(file: File): Promise<GameState> {
  return engine.loadGame(await file.text());
}
