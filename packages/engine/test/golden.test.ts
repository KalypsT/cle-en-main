import { describe, expect, it } from 'vitest';
import { createGame, dispatch, type GameEvent, type GameState, tick } from '../src/index.ts';

const GOLDEN_SEED = 20261018;
const DAYS = 365;

/** Plays one year, rolling a die at the start of every month, and summarizes it. */
function playReferenceGame(): { state: GameState; eventCounts: Record<string, number> } {
  let state = createGame({
    seed: GOLDEN_SEED,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
  });
  const eventCounts: Record<string, number> = {};
  const record = (events: GameEvent[]) => {
    for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  };
  for (let hour = 0; hour < DAYS * 24; hour++) {
    const result = tick(state);
    state = result.state;
    record(result.events);
    if (result.events.some((e) => e.type === 'monthStarted')) {
      const rolled = dispatch(state, { type: 'demo/rollDie', sides: 6 });
      if (!rolled.ok) throw new Error('Reference roll refused');
      state = rolled.state;
      record(rolled.events);
    }
  }
  return { state, eventCounts };
}

describe('golden seed', () => {
  it('reproduces the frozen reference game', async () => {
    const result = playReferenceGame();
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      './golden/seed-20261018-365-days.json',
    );
  });

  it('is deterministic across runs', () => {
    expect(playReferenceGame()).toEqual(playReferenceGame());
  });
});
