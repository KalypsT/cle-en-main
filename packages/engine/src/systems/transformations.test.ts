import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  content,
  dwelling,
  engine,
  newGame,
  sampleOwned,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameState, OwnedProperty, Property, TransformationKind } from '../state.ts';
import type { TransformationQuote } from './transformations.ts';

function owning(property: Property, balance = 400_000_00): GameState {
  const state = newGame({ seed: 3 });
  const today = toDayNumber(state.clock.date);
  const owned: OwnedProperty = { ...sampleOwned(today, { let: false }), property };
  state.properties = [owned];
  state.player.balance = balance;
  return state;
}

function basics(overrides: Partial<Parameters<typeof dwelling>[0]>) {
  return {
    id: 'property-t',
    cityId: 'dole',
    neighbourhoodId: 'centreHistorique',
    kind: 'house' as const,
    surface: 150,
    rooms: 6,
    floor: null,
    lots: [],
    epoch: 'before1948' as const,
    dpe: 'E' as const,
    defects: [],
    annualPropertyTax: 1_200_00,
    monthlyCharges: 0,
    ...overrides,
  };
}

function quoteOf(state: GameState, kind: TransformationKind): TransformationQuote {
  const quote = engine.transformationQuote(state, 'property-t', kind);
  if (!quote || typeof quote === 'string') throw new Error(`no quote: ${String(quote)}`);
  return quote;
}

/** Starts the transformation and plays until it is done. */
function transform(state: GameState, kind: TransformationKind) {
  const quote = quoteOf(state, kind);
  const started = act(state, { type: 'works/transform', propertyId: 'property-t', kind });
  const deposit = Math.round(quote.total * content.works.quotes.depositShare);
  expect(state.player.balance - started.state.player.balance).toBe(deposit);
  const done = advanceDays(started.state, quote.days + 1);
  const event = done.events.find((e) => e.type === 'transformationCompleted');
  if (!event || event.type !== 'transformationCompleted') throw new Error('not completed');
  return { quote, state: done.state, event };
}

describe('transformations (milestone 8)', () => {
  it('divides a large house into flats, each owned, the loan on the first one', () => {
    const house = dwelling(basics({}), 2);
    const state = owning(house);
    state.loans = [
      {
        id: 'loan-t',
        bankId: 'tirelire',
        principal: 100_000_00,
        ratePercent: 4,
        durationMonths: 300,
        monthlyPayment: 528_00,
        remaining: 100_000_00,
        paymentsMade: 0,
        startDate: { ...state.clock.date },
        interestPaid: 0,
        renegotiationSuggested: false,
        renegotiationDeclinedPercent: null,
        propertyId: 'property-t',
      },
    ];
    const before = engine.realValue(state, 'property-t')?.value ?? 0;
    const { quote, state: after, event } = transform(state, 'division');
    expect(quote.lots).toHaveLength(3);
    expect(event.propertyIds).toHaveLength(3);
    const flats = after.properties.filter((o) => event.propertyIds.includes(o.property.id));
    expect(flats.map((o) => o.property.kind)).toEqual(['apartment', 'apartment', 'apartment']);
    expect(flats.every((o) => o.property.items.every((item) => item.state === 5))).toBe(true);
    expect(flats.reduce((sum, o) => sum + o.purchasePrice, 0)).toBeCloseTo(
      sampleOwned(0).purchasePrice,
      -2,
    );
    expect(after.loans[0]?.propertyId).toBe(event.propertyIds[0]);
    expect(after.progress.counters.transformations).toBe(1);
    const value = flats.reduce(
      (sum, o) => sum + (engine.realValue(after, o.property.id)?.value ?? 0),
      0,
    );
    expect(value).toBeGreaterThan(before);
  });

  it('sells a building flat by flat: its flats keep their rooms’ state', () => {
    const building = dwelling(
      basics({
        kind: 'building',
        surface: 180,
        rooms: 9,
        lots: [
          { surface: 45, rooms: 2 },
          { surface: 45, rooms: 2 },
          { surface: 45, rooms: 2 },
          { surface: 45, rooms: 3 },
        ],
      }),
      4,
    );
    const state = owning(building);
    const before = engine.realValue(state, 'property-t')?.value ?? 0;
    const { state: after, event } = transform(state, 'splitBuilding');
    expect(event.propertyIds).toHaveLength(4);
    const flats = after.properties.filter((o) => event.propertyIds.includes(o.property.id));
    // Every room kept its state (a few items wore at the new year, never improved).
    const items = flats.flatMap((o) => o.property.items);
    expect(items.every((item) => item.state <= 4)).toBe(true);
    expect(items.filter((item) => item.state === 4).length).toBeGreaterThan(items.length * 0.85);
    const value = flats.reduce(
      (sum, o) => sum + (engine.realValue(after, o.property.id)?.value ?? 0),
      0,
    );
    // No more discount of a building sold whole.
    expect(value).toBeGreaterThan(before / content.market.building.valueFactor - event.cost);
  });

  it('converts an attic into one more room, and builds a new house on land', () => {
    const house = { ...dwelling(basics({ surface: 90, rooms: 4 }), 4), atticSurface: 30 };
    const { state: converted } = transform(owning(house), 'attic');
    expect(converted.properties[0]?.property).toMatchObject({
      surface: 120,
      rooms: 5,
      atticSurface: 0,
    });
    const flatOne = engine.dispatch(owning({ ...house, atticSurface: 0 }), {
      type: 'works/transform',
      propertyId: 'property-t',
      kind: 'attic',
    });
    expect(flatOne.ok ? null : flatOne.reason.code).toBe('transformation.noAttic');

    const land: Property = {
      ...basics({ kind: 'land', surface: 500, rooms: 0 }),
      spaces: [],
      items: [],
      energyFactor: 1,
      atticSurface: 0,
      copro: null,
      postponedHazards: [],
    };
    const { state: built } = transform(owning(land), 'construction');
    const home = built.properties[0]?.property;
    expect(home?.kind).toBe('house');
    expect(home?.dpe).toBe(content.works.transformations.constructionDpe);
    expect(home?.surface).toBe(125);
  });

  it('needs an empty property', () => {
    const state = owning(dwelling(basics({}), 2));
    const owned = state.properties[0];
    if (!owned) throw new Error('no property');
    owned.lease = sampleOwned(0).lease;
    const refused = engine.dispatch(state, {
      type: 'works/transform',
      propertyId: 'property-t',
      kind: 'division',
    });
    expect(refused.ok ? null : refused.reason.code).toBe('transformation.occupied');
  });

  it('hands ordinary works to the project manager: no free time, a fee', () => {
    const state = owning(dwelling(basics({ surface: 90, rooms: 4 }), 2));
    const free = state.player.freeTimeMinutes;
    const delegated = act(state, {
      type: 'works/delegate',
      propertyId: 'property-t',
      items: [
        { itemId: 'electricity', tier: 'standard' },
        { itemId: 'heating', tier: 'standard' },
      ],
    });
    const project = delegated.state.properties[0]?.works;
    expect(project?.managed).toBe(true);
    expect(project?.tasks).toHaveLength(2);
    expect(delegated.state.player.freeTimeMinutes).toBe(free);
    const fee = delegated.events.find((e) => e.type === 'worksDelegated');
    expect(fee).toMatchObject({ type: 'worksDelegated' });
  });
});
