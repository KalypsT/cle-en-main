import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState } from '../src/index.ts';
import { engine } from './helpers.ts';

const GOLDEN_SEED = 20261018;
const DAYS = 365;

/**
 * Plays one year as a fonctionnaire who meets the Tirelire banker at the start
 * of every month, and summarizes it.
 */
function playReferenceGame(): { state: GameState; eventCounts: Record<string, number> } {
  let state = engine.createGame({
    seed: GOLDEN_SEED,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
  });
  const eventCounts: Record<string, number> = {};
  const record = (events: GameEvent[]) => {
    for (const event of events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
  };
  for (let hour = 0; hour < DAYS * 24; hour++) {
    const result = engine.tick(state);
    state = result.state;
    record(result.events);
    if (state.clock.date.day === 2 && state.clock.hour === 18) {
      const met = engine.dispatch(state, { type: 'bank/meet', bankId: 'tirelire' });
      if (met.ok) {
        state = met.state;
        record(met.events);
      }
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
