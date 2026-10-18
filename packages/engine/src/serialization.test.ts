import { describe, expect, it } from 'vitest';
import { advanceHours, createGame, dispatch } from './game.ts';
import {
  deserializeGame,
  type MigrationRegistry,
  migrateRaw,
  SaveFormatError,
  serializeGame,
} from './serialization.ts';
import { FORMAT_VERSION } from './state.ts';

const options = { seed: 77, startDate: { year: 2026, month: 10, day: 18 }, startHour: 8 };

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveFormatError) return error.code;
    throw error;
  }
  return undefined;
}

describe('serialization', () => {
  it('round-trips a game and resumes identically', () => {
    let state = advanceHours(createGame(options), 1000).state;
    const rolled = dispatch(state, { type: 'demo/rollDie', sides: 20 });
    if (rolled.ok) state = rolled.state;

    const restored = deserializeGame(serializeGame(state));
    expect(restored).toEqual(state);

    const continueGame = (s: typeof state) => {
      const advanced = advanceHours(s, 500).state;
      return dispatch(advanced, { type: 'demo/rollDie', sides: 100 });
    };
    expect(continueGame(restored)).toEqual(continueGame(state));
  });

  it('rejects broken saves with an error code', () => {
    const valid = JSON.parse(serializeGame(createGame(options))) as Record<string, unknown>;
    expect(errorCode(() => deserializeGame('{not json'))).toBe('invalidJson');
    expect(errorCode(() => deserializeGame('[]'))).toBe('missingVersion');
    expect(errorCode(() => deserializeGame(JSON.stringify({ ...valid, formatVersion: 999 })))).toBe(
      'unsupportedVersion',
    );
    expect(errorCode(() => deserializeGame(JSON.stringify({ ...valid, formatVersion: 0 })))).toBe(
      'missingMigration',
    );
    expect(errorCode(() => deserializeGame(JSON.stringify({ ...valid, seed: 'abc' })))).toBe(
      'invalidState',
    );
    expect(errorCode(() => deserializeGame(JSON.stringify({ ...valid, extra: true })))).toBe(
      'invalidState',
    );
  });
});

describe('migrations', () => {
  it('chains migrations up to the target version', () => {
    const registry: MigrationRegistry = {
      1: (raw) => ({ ...raw, coins: 0 }),
      2: ({ coins, ...rest }) => ({ ...rest, wallet: { coins } }),
    };
    expect(migrateRaw({ formatVersion: 1, name: 'a' }, 3, registry)).toEqual({
      formatVersion: 3,
      name: 'a',
      wallet: { coins: 0 },
    });
  });

  it('upgrades an old save through a fake migration into a valid current state', () => {
    // Fake version 0 stored the clock as a flat `hoursSinceStart` field.
    const current = JSON.parse(serializeGame(createGame(options))) as Record<string, unknown>;
    const { clock, ...rest } = current as { clock: { elapsedHours: number } };
    const legacy = { ...rest, formatVersion: FORMAT_VERSION - 1, legacyClock: clock };
    const registry: MigrationRegistry = {
      [FORMAT_VERSION - 1]: ({ legacyClock, ...raw }) => ({ ...raw, clock: legacyClock }),
    };
    expect(deserializeGame(JSON.stringify(legacy), registry)).toEqual(current);
  });
});
