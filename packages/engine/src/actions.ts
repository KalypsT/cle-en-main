import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';

/** Every player or bot decision goes through one of these actions. */
export type GameAction = { type: 'demo/rollDie'; sides: number };

/** Machine-readable refusal; the interface maps `code` to a text from `content/`. */
export interface Refusal {
  code: 'demo.invalidSides';
}

export type DispatchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; reason: Refusal };
