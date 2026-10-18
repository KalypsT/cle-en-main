import { describe, expect, it } from 'vitest';
import type { GameEvent } from './events.ts';
import { advanceHours, createGame, describeTime, dispatch, tick } from './game.ts';
import { FORMAT_VERSION } from './state.ts';

const options = { seed: 1234, startDate: { year: 2026, month: 10, day: 18 }, startHour: 8 };

function eventTypes(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('createGame', () => {
  it('creates a JSON-serializable state', () => {
    const state = createGame(options);
    expect(state.formatVersion).toBe(FORMAT_VERSION);
    expect(state.clock).toEqual({ date: options.startDate, hour: 8, elapsedHours: 0 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects invalid options', () => {
    expect(() => createGame({ ...options, seed: -1 })).toThrow(RangeError);
    expect(() => createGame({ ...options, seed: 2 ** 32 })).toThrow(RangeError);
    expect(() => createGame({ ...options, startDate: { year: 2026, month: 2, day: 30 } })).toThrow(
      RangeError,
    );
    expect(() => createGame({ ...options, startHour: 24 })).toThrow(RangeError);
  });
});

describe('tick', () => {
  it('advances one hour without mutating the previous state', () => {
    const state = createGame(options);
    const snapshot = JSON.parse(JSON.stringify(state)) as typeof state;
    const { state: next, events } = tick(state);
    expect(state).toEqual(snapshot);
    expect(next.clock.hour).toBe(9);
    expect(next.clock.elapsedHours).toBe(1);
    expect(events).toEqual([]);
  });

  it('starts a new day at midnight', () => {
    const { state, events } = advanceHours(createGame(options), 16);
    expect(describeTime(state)).toBe('2026-10-19 00:00');
    expect(events).toEqual([
      {
        type: 'dayStarted',
        date: { year: 2026, month: 10, day: 19 },
        weekday: 1,
        isWeekend: false,
      },
    ]);
  });

  it('detects weekends, months and years', () => {
    const game = createGame({ ...options, startDate: { year: 2026, month: 12, day: 31 } });
    const { events } = advanceHours(game, 16);
    // 2027-01-01 is a Friday.
    expect(eventTypes(events)).toEqual(['dayStarted', 'monthStarted', 'yearStarted']);
    const saturday = advanceHours(game, 16 + 24).events;
    expect(eventTypes(saturday)).toEqual([
      'dayStarted',
      'monthStarted',
      'yearStarted',
      'dayStarted',
      'weekendStarted',
    ]);
    expect(saturday[3]).toMatchObject({ isWeekend: true, weekday: 6 });
  });

  it('emits the expected number of events over a leap year', () => {
    const game = createGame({
      ...options,
      startDate: { year: 2027, month: 12, day: 31 },
      startHour: 0,
    });
    const { events } = advanceHours(game, 366 * 24);
    const count = (type: string) => events.filter((e) => e.type === type).length;
    expect(count('dayStarted')).toBe(366);
    expect(count('monthStarted')).toBe(12);
    expect(count('yearStarted')).toBe(1);
    // 2028 starts on a Saturday and is a leap year: 53 Saturdays.
    expect(count('weekendStarted')).toBe(53);
  });
});

describe('dispatch', () => {
  it('applies the demo action with the seeded generator', () => {
    const state = createGame(options);
    const result = dispatch(state, { type: 'demo/rollDie', sides: 6 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.demo.rollCount).toBe(1);
    expect(result.state.rng).not.toEqual(state.rng);
    expect(result.events).toEqual([
      { type: 'demo/dieRolled', sides: 6, value: result.state.demo.lastRoll },
    ]);
    // Same state, same action, same outcome.
    expect(dispatch(state, { type: 'demo/rollDie', sides: 6 })).toEqual(result);
  });

  it('refuses invalid actions with a reason and leaves the state untouched', () => {
    const state = createGame(options);
    const result = dispatch(state, { type: 'demo/rollDie', sides: 1 });
    expect(result).toEqual({ ok: false, state, reason: { code: 'demo.invalidSides' } });
  });
});
