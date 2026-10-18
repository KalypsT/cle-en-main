import { gameContent } from '@cle/content';
import { createEngine, type CreateGameOptions } from '../src/index.ts';

export const content = gameContent;
export const engine = createEngine(content);

export const defaultOptions: CreateGameOptions = {
  seed: 1234,
  // A Sunday, as in the milestone 0 tests.
  startDate: { year: 2026, month: 10, day: 18 },
  startHour: 8,
};

export function newGame(overrides: Partial<CreateGameOptions> = {}) {
  return engine.createGame({ ...defaultOptions, ...overrides });
}

/** Advances to 00:00 on the first day of the next month and returns that tick's events. */
export function advanceToNextMonth(state: ReturnType<typeof newGame>) {
  let current = state;
  for (;;) {
    const result = engine.tick(current);
    current = result.state;
    if (result.events.some((event) => event.type === 'monthStarted')) {
      return { state: current, events: result.events };
    }
  }
}
