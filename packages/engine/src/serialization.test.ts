import { describe, expect, it } from 'vitest';
import v1Save from '../test/fixtures/save-v1-milestone-0.json' with { type: 'json' };
import v2Save from '../test/fixtures/save-v2-milestone-1a.json' with { type: 'json' };
import { content, engine, newGame } from '../test/helpers.ts';
import {
  deserializeGame,
  type MigrationRegistry,
  migrateRaw,
  SaveFormatError,
  serializeGame,
} from './serialization.ts';
import { FORMAT_VERSION } from './state.ts';

const context = { content };

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
    let state = engine.advanceHours(newGame(), 1000).state;
    const met = engine.dispatch(state, { type: 'bank/meet', bankId: 'tirelire' });
    if (met.ok) state = met.state;

    const restored = engine.loadGame(serializeGame(state));
    expect(restored).toEqual(state);
    expect(engine.advanceHours(restored, 2000)).toEqual(engine.advanceHours(state, 2000));
  });

  it('rejects broken saves with an error code', () => {
    const valid = JSON.parse(serializeGame(newGame())) as Record<string, unknown>;
    const load = (value: unknown) => () => deserializeGame(JSON.stringify(value), context);
    expect(errorCode(() => deserializeGame('{not json', context))).toBe('invalidJson');
    expect(errorCode(load([]))).toBe('missingVersion');
    expect(errorCode(load({ ...valid, formatVersion: 999 }))).toBe('unsupportedVersion');
    expect(errorCode(load({ ...valid, formatVersion: 0 }))).toBe('missingMigration');
    expect(errorCode(load({ ...valid, seed: 'abc' }))).toBe('invalidState');
    expect(errorCode(load({ ...valid, extra: true }))).toBe('invalidState');
  });
});

describe('migrations', () => {
  it('chains migrations up to the target version', () => {
    const registry: MigrationRegistry = {
      1: (raw) => ({ ...raw, coins: 0 }),
      2: ({ coins, ...rest }) => ({ ...rest, wallet: { coins } }),
    };
    expect(migrateRaw({ formatVersion: 1, name: 'a' }, context, 3, registry)).toEqual({
      formatVersion: 3,
      name: 'a',
      wallet: { coins: 0 },
    });
  });

  it('upgrades a milestone 0 save (version 1) to the current format', () => {
    const v1 = JSON.stringify(v1Save);
    const migrated = engine.loadGame(v1);
    const original = JSON.parse(v1) as { clock: unknown; rng: unknown; seed: number };
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.clock).toEqual(original.clock);
    expect(migrated.seed).toBe(original.seed);
    expect(migrated.player.jobId).toBe(content.start.defaultJobId);
    expect(migrated.loans).toEqual([]);
    expect('demo' in migrated).toBe(false);
    expect(migrated.listings.length).toBeGreaterThan(0);
    // The migrated game keeps running.
    expect(engine.advanceHours(migrated, 24 * 40).state.clock.elapsedHours).toBe(
      migrated.clock.elapsedHours + 24 * 40,
    );
  });

  it('upgrades a milestone 1a save (version 2): loans, price levels and a stocked market', () => {
    const v2 = JSON.stringify(v2Save);
    const original = JSON.parse(v2) as {
      clock: unknown;
      player: { balance: number };
      banks: unknown;
      market: { ratePercent: number };
    };
    const migrated = engine.loadGame(v2);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.clock).toEqual(original.clock);
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.banks).toEqual(original.banks);
    expect(migrated.market.laggedRatePercent).toBe(original.market.ratePercent);
    expect(Object.keys(migrated.market.cities.dole ?? {})).toHaveLength(5);
    expect(migrated.listings.length).toBeGreaterThan(20);
    expect(migrated.purchases).toEqual([]);
    expect(migrated.properties).toEqual([]);
    // Deterministic, and the game keeps running.
    expect(engine.loadGame(v2)).toEqual(migrated);
    expect(engine.advanceHours(migrated, 24 * 40).state.listings.length).toBeGreaterThan(0);
  });
});
