import type { GameContent, Mode } from '../content.ts';
import type { GameState } from '../state.ts';

/** The game's mode (docs/02, section 2.5); the default one for an unknown id. */
export function modeOf(content: GameContent, state: Pick<GameState, 'modeId'>): Mode {
  const modes = content.modes.modes;
  const mode =
    modes.find((candidate) => candidate.id === state.modeId) ??
    modes.find((candidate) => candidate.id === content.modes.defaultModeId);
  if (!mode) throw new RangeError('No game mode in content');
  return mode;
}

/** Rewinds left; null: unlimited. */
export function rewindsLeft(content: GameContent, state: GameState): number | null {
  const allowed = modeOf(content, state).rewinds;
  return allowed === null ? null : Math.max(0, allowed - state.rewinds);
}
