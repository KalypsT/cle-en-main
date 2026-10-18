import type { DispatchResult, GameAction } from './actions.ts';
import { type CalendarDate, isValidDate, toIsoDate } from './calendar.ts';
import { advanceClock, createClock, HOURS_PER_DAY } from './clock.ts';
import type { GameEvent } from './events.ts';
import { nextInt, type RngState, seedRng } from './random.ts';
import { FORMAT_VERSION, type GameState } from './state.ts';

export interface CreateGameOptions {
  /** uint32 seed of the random generator. */
  seed: number;
  /** First day of the game, supplied by the caller (the engine never reads the system clock). */
  startDate: CalendarDate;
  /** Hour of day the game starts at, 0 … 23. */
  startHour: number;
}

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export function createGame(options: CreateGameOptions): GameState {
  const { seed, startDate, startHour } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`Seed must be a uint32, got ${seed}`);
  }
  if (!isValidDate(startDate)) {
    throw new RangeError(`Invalid start date ${JSON.stringify(startDate)}`);
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour >= HOURS_PER_DAY) {
    throw new RangeError(`Invalid start hour ${startHour}`);
  }
  return {
    formatVersion: FORMAT_VERSION,
    seed,
    rng: seedRng(seed),
    startDate: { ...startDate },
    clock: createClock(startDate, startHour),
    demo: { rollCount: 0, lastRoll: null },
  };
}

/** Advances the world by one hour. Does not mutate `state`. */
export function tick(state: GameState): TickResult {
  const { clock, events } = advanceClock(state.clock);
  // Systems will run here, in a fixed order, once they exist.
  return { state: { ...state, clock }, events };
}

/** Advances the world by `hours` ticks and returns every event emitted. */
export function advanceHours(state: GameState, hours: number): TickResult {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < hours; i++) {
    const result = tick(current);
    current = result.state;
    for (const event of result.events) events.push(event);
  }
  return { state: current, events };
}

/** Validates and applies a decision. Does not mutate `state`. */
export function dispatch(state: GameState, action: GameAction): DispatchResult {
  switch (action.type) {
    case 'demo/rollDie': {
      if (!Number.isInteger(action.sides) || action.sides < 2) {
        return { ok: false, state, reason: { code: 'demo.invalidSides' } };
      }
      const rng: RngState = [...state.rng];
      const value = nextInt(rng, 1, action.sides);
      return {
        ok: true,
        state: { ...state, rng, demo: { rollCount: state.demo.rollCount + 1, lastRoll: value } },
        events: [{ type: 'demo/dieRolled', sides: action.sides, value }],
      };
    }
  }
}

/** Short human-oriented identifier of the current game time, for logs and tools. */
export function describeTime(state: GameState): string {
  return `${toIsoDate(state.clock.date)} ${String(state.clock.hour).padStart(2, '0')}:00`;
}
