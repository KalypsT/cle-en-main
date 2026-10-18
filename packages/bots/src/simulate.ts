import {
  type CalendarDate,
  createGame,
  type GameEventType,
  type GameState,
  HOURS_PER_DAY,
  tick,
} from '@cle/engine';

export interface SimulationOptions {
  seed: number;
  startDate: CalendarDate;
  startHour: number;
  days: number;
}

export interface SimulationResult {
  state: GameState;
  ticks: number;
  eventCounts: Partial<Record<GameEventType, number>>;
}

/** Plays a game without any interface. No strategy yet: bots arrive in milestone 1. */
export function simulate(options: SimulationOptions): SimulationResult {
  let state = createGame(options);
  const eventCounts: Partial<Record<GameEventType, number>> = {};
  const ticks = options.days * HOURS_PER_DAY;
  for (let i = 0; i < ticks; i++) {
    const result = tick(state);
    state = result.state;
    for (const event of result.events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
  }
  return { state, ticks, eventCounts };
}
