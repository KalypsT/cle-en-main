import { describe, expect, it } from 'vitest';
import v1Save from '../test/fixtures/save-v1-milestone-0.json' with { type: 'json' };
import v2Save from '../test/fixtures/save-v2-milestone-1a.json' with { type: 'json' };
import v3Save from '../test/fixtures/save-v3-milestone-1b.json' with { type: 'json' };
import v4Save from '../test/fixtures/save-v4-milestone-1c.json' with { type: 'json' };
import v5Save from '../test/fixtures/save-v5-milestone-2.json' with { type: 'json' };
import v6Save from '../test/fixtures/save-v6-milestone-3.json' with { type: 'json' };
import v7Save from '../test/fixtures/save-v7-milestone-5.json' with { type: 'json' };
import v8Save from '../test/fixtures/save-v8-milestone-6.json' with { type: 'json' };
import v9Save from '../test/fixtures/save-v9-milestone-7.json' with { type: 'json' };
import v10Save from '../test/fixtures/save-v10-milestone-8.json' with { type: 'json' };
import { advanceToNextMonth, content, engine, newGame } from '../test/helpers.ts';
import {
  deserializeGame,
  type MigrationRegistry,
  migrateRaw,
  SaveFormatError,
  serializeGame,
} from './serialization.ts';
import { toDayNumber } from './calendar.ts';
import { FORMAT_VERSION } from './state.ts';
import { conditionLabel, dpeOf, energyNeeds, isIndecent } from './systems/dwelling.ts';

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

  it('upgrades a milestone 1b save (version 3): rivals, tenants and household buyers', () => {
    const v3 = JSON.stringify(v3Save);
    const original = JSON.parse(v3) as {
      clock: { date: { year: number; month: number; day: number } };
      player: { balance: number };
      properties: { property: { id: string }; sale: Record<string, unknown> }[];
    };
    const migrated = engine.loadGame(v3);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.player.bankruptDay).toBeNull();
    expect(Object.keys(migrated.rivals)).toEqual(content.rivals.map((rival) => rival.id));
    const owned = migrated.properties[0];
    expect(owned?.property.id).toBe(original.properties[0]?.property.id);
    expect(owned?.lease).toBeNull();
    // Version 5: the vacant property is offered for rent (unless the law forbids it).
    if (owned && owned.property.dpe !== 'G' && !isIndecent(content, owned.property)) {
      expect(owned?.rental?.listedDay).toBe(toDayNumber(original.clock.date));
    }

    // Offers and agreements of a version 3 save came from households.
    const withOffer = JSON.parse(v3) as typeof original;
    const sale = withOffer.properties[0]?.sale;
    if (!sale) throw new Error('The fixture has a property for sale');
    sale.offers = [
      { id: 'offer-x', amount: 100_000, buyerMax: 101_000, expiresDay: 0, counterAmount: null },
    ];
    sale.agreement = { price: 100_000, deedDay: 0 };
    const upgraded = engine.loadGame(JSON.stringify(withOffer)).properties[0]?.sale;
    expect(upgraded?.offers[0]?.buyerId).toBeNull();
    expect(upgraded?.agreement?.buyerId).toBeNull();

    // The migrated game keeps running.
    expect(engine.advanceHours(migrated, 24 * 40).state.clock.elapsedHours).toBe(
      migrated.clock.elapsedHours + 24 * 40,
    );
  });

  it('upgrades a milestone 1c save (version 4): real leases, rentals and taxes', () => {
    const v4 = JSON.stringify(v4Save);
    const original = JSON.parse(v4) as {
      clock: { date: { year: number; month: number; day: number } };
      player: { balance: number };
      properties: {
        property: { id: string; monthlyCharges: number };
        lease: { monthlyRent: number; startDay: number } | null;
      }[];
    };
    const migrated = engine.loadGame(v4);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.player.homePropertyId).toBeNull();
    expect(migrated.tax.year).toBe(original.clock.date.year);
    const [let_, vacant] = migrated.properties;
    const oldLease = original.properties[0]?.lease;
    if (!let_?.lease || !oldLease) throw new Error('The fixture has a let property');
    // Same tenant start; the rent loses the recoverable charges it included.
    expect(let_.lease.startDay).toBe(oldLease.startDay);
    expect(let_.lease.leaseType).toBe('bare');
    expect(let_.lease.monthlyRent).toBe(
      oldLease.monthlyRent -
        Math.round(
          (original.properties[0]?.property.monthlyCharges ?? 0) *
            content.renting.recoverableChargesShare,
        ),
    );
    expect(let_.lease.tenant.firstName.length).toBeGreaterThan(0);
    expect(let_.lease.termDay).toBeGreaterThan(toDayNumber(original.clock.date));
    // The deposit reaches the account: the net worth is unchanged by it.
    expect(migrated.player.balance).toBe(original.player.balance + let_.lease.deposit);
    expect(vacant?.lease).toBeNull();
    expect(vacant?.rental?.leaseType).toBe('bare');
    // Deterministic, and the game keeps running with rents and taxes.
    expect(engine.loadGame(v4)).toEqual(migrated);
    const later = engine.advanceHours(migrated, 24 * 400);
    expect(later.events.some((e) => e.type === 'taxAssessed')).toBe(true);
    // Managed by the owner: candidates wait for his answer.
    expect(later.events.some((e) => e.type === 'applicationReceived')).toBe(true);
  });

  it('upgrades a milestone 2 save (version 5): rooms, items, energy model and works', () => {
    const v5 = JSON.stringify(v5Save);
    const original = JSON.parse(v5) as {
      player: { balance: number };
      listings: { id: string; visited: boolean; property: { dpe: string } }[];
      properties: {
        property: { id: string; dpe: string; condition: string; defects: { id: string }[] };
        lease: { monthlyRent: number } | null;
      }[];
    };
    const migrated = engine.loadGame(v5);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.artisans).toEqual({});
    expect(migrated.worksDone).toEqual({});
    const owned = migrated.properties[0];
    const old = original.properties[0];
    if (!owned || !old) throw new Error('The fixture has a property');
    // Same DPE, same lease; every item known to the owner, around the old condition.
    expect(owned.property.dpe).toBe(old.property.dpe);
    expect(owned.lease?.monthlyRent).toBe(old.lease?.monthlyRent);
    expect(owned.property.items.every((item) => item.known)).toBe(true);
    expect(conditionLabel(content, owned.property)).toBe(old.property.condition);
    // The model is calibrated on the DPE: no works, no change of class.
    expect(dpeOf(content, energyNeeds(content, owned.property))).toBe(owned.property.dpe);
    // Old defects become broken items.
    expect(old.property.defects.map((d) => d.id)).toContain('wiring');
    expect(owned.property.items.find((item) => item.kind === 'electricity')?.state).toBe(1);
    expect(owned.property.defects).toEqual([]);
    expect(owned).toMatchObject({ quotes: [], works: null, worksFund: null, coproCalls: [] });
    // A visited listing shows its rooms; the others nothing yet.
    const visited = migrated.listings.find((l) => l.visited);
    expect(visited?.property.items.some((item) => item.known)).toBe(true);
    const unseen = migrated.listings.find((l) => !l.visited);
    expect(unseen?.property.items.some((item) => item.known)).toBe(false);
    // Deterministic, and the game keeps running with works.
    expect(engine.loadGame(v5)).toEqual(migrated);
    const later = engine.advanceHours(migrated, 24 * 400);
    expect(later.state.clock.elapsedHours).toBe(migrated.clock.elapsedHours + 24 * 400);
  });

  it('upgrades a milestone 3 save (version 6): name, avatar and interface data', () => {
    const v6 = JSON.stringify(v6Save);
    const original = JSON.parse(v6) as { player: { balance: number }; properties: unknown[] };
    const migrated = engine.loadGame(v6);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.player.name).toBe(content.start.defaultPlayerName);
    expect(migrated.player.avatar).toEqual({ face: 0, hair: 0, skin: 0, outfit: 0 });
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.properties).toHaveLength(original.properties.length);
    // A game under way does not start the tutorial again.
    expect(migrated.tutorial).toEqual({ enabled: false, step: 0 });
    expect(migrated).toMatchObject({ favorites: [], history: [], lastStatement: null });
    // The wealth curve and the monthly review fill up from the next month.
    const later = advanceToNextMonth(migrated).state;
    expect(later.history).toHaveLength(1);
    expect(later.lastStatement?.lines.length).toBeGreaterThan(0);
    // A v7 save round-trips.
    expect(engine.loadGame(serializeGame(later))).toEqual(later);
  });

  it('upgrades a milestone 5 save (version 7): mode, progression, catalogue and agenda', () => {
    const v7 = JSON.stringify(v7Save);
    const original = JSON.parse(v7) as {
      player: { balance: number; reputation: number };
      properties: unknown[];
      agenda: { listingId: string }[];
      history: unknown[];
    };
    const migrated = engine.loadGame(v7);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.modeId).toBe(content.modes.defaultModeId);
    expect(migrated.rewinds).toBe(0);
    expect(migrated.gameOver).toBeNull();
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.properties).toHaveLength(original.properties.length);
    // A planned visit keeps its listing.
    expect(migrated.agenda[0]).toMatchObject({
      kind: 'visit',
      listingId: original.agenda[0]?.listingId,
    });
    // The curve gains its new columns.
    expect(migrated.history).toHaveLength(original.history.length);
    expect(migrated.history[0]).toMatchObject({
      monthlyRent: 0,
      reputation: original.player.reputation,
    });
    // The starting title, counters from what is owned, an empty catalogue.
    expect(migrated.progress.titles.map((title) => title.id)).toEqual(['ambitiousTenant']);
    expect(migrated.progress.counters.purchases).toBe(original.properties.length);
    expect(migrated.catalog).toEqual({ pending: [], lastDay: {}, anecdotes: [] });
    expect(migrated.chronicle[0]?.kind).toBe('start');
    // Titles and achievements already deserved come on the next day.
    const later = engine.advanceHours(migrated, 24).state;
    expect(later.progress.titles.map((title) => title.id)).toContain('firstInvestor');
    expect(later.progress.achievements.map((a) => a.id)).toContain('firstStone');
    // A v8 save round-trips.
    expect(engine.loadGame(serializeGame(later))).toEqual(later);
  });
  it('upgrades a milestone 6 save (version 8): base city, renown, trips and the new cities', () => {
    const v8 = JSON.stringify(v8Save);
    const original = JSON.parse(v8) as {
      player: { balance: number };
      properties: { property: { cityId: string } }[];
      market: { cities: Record<string, unknown> };
      listings: { property: { cityId: string } }[];
    };
    expect(Object.keys(original.market.cities)).toEqual(['dole']);
    const migrated = engine.loadGame(v8);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    // The player stays in Dole, with no renown anywhere and no trip made today.
    expect(migrated.player).toMatchObject({
      baseCityId: content.start.cityId,
      tripsToday: [],
      lastMoveDay: null,
      renown: {},
      balance: original.player.balance,
    });
    expect(migrated.properties).toHaveLength(original.properties.length);
    // Dole's market is kept as it was; the other cities get theirs.
    expect(migrated.market.cities.dole).toEqual(original.market.cities.dole);
    expect(Object.keys(migrated.market.cities).sort()).toEqual(Object.keys(content.cities).sort());
    // They arrive with a first stock of listings, Dole's own listings untouched.
    const inCity = (cityId: string) =>
      migrated.listings.filter((listing) => listing.property.cityId === cityId);
    expect(inCity('dole')).toHaveLength(original.listings.length);
    for (const cityId of ['dijon', 'besancon', 'chalon']) {
      expect(inCity(cityId).length).toBeGreaterThan(10);
    }
    // Playing on works, and the result round-trips.
    const later = advanceToNextMonth(migrated).state;
    expect(engine.loadGame(serializeGame(later))).toEqual(later);
    // The migration is deterministic.
    expect(engine.loadGame(v8)).toEqual(migrated);
  });

  it('upgrades a milestone 7 save (version 9): no SCI, own name, IFI and crises at zero', () => {
    const v9 = JSON.stringify(v9Save);
    const original = JSON.parse(v9) as {
      player: { balance: number };
      properties: { property: { id: string } }[];
      listings: unknown[];
      tax: { lastAssessment: unknown };
    };
    const migrated = engine.loadGame(v9);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.company).toBeNull();
    expect(migrated.player.balance).toBe(original.player.balance);
    expect(migrated.properties.map((o) => o.property.id)).toEqual(
      original.properties.map((o) => o.property.id),
    );
    expect(migrated.properties.every((o) => o.holder === 'player')).toBe(true);
    expect(migrated.properties.every((o) => o.property.atticSurface === 0)).toBe(true);
    expect(migrated.properties.every((o) => o.lease === null || o.lease.missedDays === 0)).toBe(
      true,
    );
    expect(migrated.listings).toHaveLength(original.listings.length);
    expect(migrated.market.crises).toEqual([]);
    expect(migrated.rivals.horizon?.arrivedDay).toBeNull();
    if (original.tax.lastAssessment) {
      expect(migrated.tax.lastAssessment).toMatchObject({ wealthTax: 0, taxableWealth: 0 });
    }
    // Playing on works, and the result round-trips.
    const later = advanceToNextMonth(migrated).state;
    expect(engine.loadGame(serializeGame(later))).toEqual(later);
    expect(engine.loadGame(v9)).toEqual(migrated);
  });

  it('upgrades a milestone 8 save (version 10): value curves empty, no indemnity offered', () => {
    const v10 = JSON.stringify(v10Save);
    const original = JSON.parse(v10) as { properties: { property: { id: string } }[] };
    const migrated = engine.loadGame(v10);
    expect(migrated.formatVersion).toBe(FORMAT_VERSION);
    expect(migrated.properties.map((o) => o.property.id)).toEqual(
      original.properties.map((o) => o.property.id),
    );
    expect(migrated.properties.every((o) => o.valueHistory.length === 0)).toBe(true);
    // Version 14: the history of each property starts empty.
    expect(migrated.properties.every((o) => o.log.length === 0)).toBe(true);
    // Version 13: no refused offer was ever kept.
    expect(migrated.offerNotices).toEqual([]);
    // Version 12: no tenant was ever offered an indemnity.
    expect(migrated.properties.some((o) => o.lease !== null)).toBe(true);
    expect(
      migrated.properties.every((o) => o.lease === null || o.lease.buyoutRefusedDay === null),
    ).toBe(true);
    // The 1st of the next month adds a point to each curve, and the result round-trips.
    const later = advanceToNextMonth(migrated).state;
    expect(later.properties.every((o) => o.valueHistory.length === 1)).toBe(true);
    expect(later.properties[0]?.valueHistory[0]?.value).toBe(
      engine.estimate(later, later.properties[0]?.property.id ?? '')?.estimate,
    );
    expect(engine.loadGame(serializeGame(later))).toEqual(later);
    expect(engine.loadGame(v10)).toEqual(migrated);
  });

  it('completes the tenant exits of a version 14 history from the matching arrival', () => {
    const raw = {
      formatVersion: 14,
      properties: [
        {
          log: [
            { kind: 'tenantIn', day: 100, tenantName: 'Lucas Arnaud', monthlyRent: 52_000 },
            { kind: 'tenantOut', day: 400, tenantName: 'Lucas Arnaud', reason: 'notice' },
            { kind: 'tenantOut', day: 500, tenantName: 'Inconnu', reason: 'dpe' },
          ],
        },
      ],
    };
    const migrated = migrateRaw(raw, context, 15) as { properties: { log: unknown[] }[] };
    expect(migrated.properties[0]?.log).toEqual([
      raw.properties[0]?.log[0],
      {
        kind: 'tenantOut',
        day: 400,
        tenantName: 'Lucas Arnaud',
        reason: 'notice',
        startDay: 100,
        monthlyRent: 52_000,
        damages: 0,
        depositReturned: 0,
      },
      {
        kind: 'tenantOut',
        day: 500,
        tenantName: 'Inconnu',
        reason: 'dpe',
        startDay: 500,
        monthlyRent: 0,
        damages: 0,
        depositReturned: 0,
      },
    ]);
  });
});
