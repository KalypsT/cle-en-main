import { gameContent } from '@cle/content';
import {
  type CalendarDate,
  createEngine,
  type GameEventType,
  type GameState,
  HOURS_PER_DAY,
} from '@cle/engine';

export const engine = createEngine(gameContent);

export interface SimulationOptions {
  seed: number;
  startDate: CalendarDate;
  startHour: number;
  days: number;
  jobId?: string;
}

export interface SimulationResult {
  state: GameState;
  ticks: number;
  eventCounts: Partial<Record<GameEventType, number>>;
}

/** Plays a game without any interface. No strategy yet: bots arrive in milestone 1c. */
export function simulate(options: SimulationOptions): SimulationResult {
  const { days, ...gameOptions } = options;
  let state = engine.createGame(gameOptions);
  const eventCounts: Partial<Record<GameEventType, number>> = {};
  const ticks = days * HOURS_PER_DAY;
  for (let i = 0; i < ticks; i++) {
    const result = engine.tick(state);
    state = result.state;
    for (const event of result.events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
  }
  return { state, ticks, eventCounts };
}
