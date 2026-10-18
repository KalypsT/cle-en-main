import type { GameContent } from '../content.ts';
import type { GameEvent } from '../events.ts';
import type { GameState } from '../state.ts';

/** What a system receives while the engine advances: a draft it may mutate. */
export interface SystemContext {
  content: GameContent;
  /** Deep copy of the state, owned by the current tick or action. */
  state: GameState;
  events: GameEvent[];
  /** Day number of the current game day (calendar.toDayNumber). */
  today: number;
}
