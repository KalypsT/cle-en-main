import type { CalendarDate } from './calendar.ts';
import type { Clock } from './clock.ts';
import type { RngState } from './random.ts';

/** Current version of the serialized game state. Bump it with a migration. */
export const FORMAT_VERSION = 1;

/** Placeholder state for the milestone 0 demo action; removed once real systems exist. */
export interface DemoState {
  rollCount: number;
  lastRoll: number | null;
}

/** The whole world. Must stay plain JSON data: no classes, no functions. */
export interface GameState {
  formatVersion: number;
  seed: number;
  rng: RngState;
  startDate: CalendarDate;
  clock: Clock;
  demo: DemoState;
}
