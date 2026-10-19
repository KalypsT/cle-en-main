import { describe, expect, it } from 'vitest';
import { type GameContent, gameContent } from '@cle/content';
import { dwelling, newGame, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { deepClone } from '../clone.ts';
import { createEngine } from '../engine.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, OwnedProperty } from '../state.ts';
import { findItem, itemId } from './dwelling.ts';

/**
 * The content with predictable artisans: reliable, free right away, quotes
 * at their exact price; no hazards unless a test asks for one.
 */
function steadyContent(change?: (content: GameContent) => void): GameContent {
  const content = deepClone(gameContent);
  for (const artisan of content.artisans) {
    artisan.reliability = 1;
    artisan.queueDays = { min: 0, max: 0 };
  }
  content.works.quotes.noise = 0;
  for (const hazard of content.works.hazards) hazard.probability = 0;
  for (const incident of content.renting.incidents) incident.monthlyProbability = 0;
  // No catalogue event either (an artisan's delay or head start would move the dates).
  content.events = [];
  change?.(content);
  return content;
}

/** A 60 m² flat of the 1960s in Dole, classed F, every item at `state`, vacant. */
function flat(state = 1): OwnedProperty {
  const owned = sampleOwned(0, { let: false });
  return {
    ...owned,
    property: dwelling(
      {
        id: 'property-flat',
        cityId: 'dole',
        neighbourhoodId: 'centreHistorique',
        kind: 'apartment',
        surface: 60,
        rooms: 3,
        floor: 2,
        lots: [],
        epoch: 'from1948to1974',
        dpe: 'F',
        defects: [],
        annualPropertyTax: 780_00,
        monthlyCharges: 130_00,
      },
      state,
    ),
  };
}

function withOwned(owned: OwnedProperty, balance = 50_000_00): GameState {
  const state = newGame();
  return { ...state, properties: [owned], player: { ...state.player, balance } };
}

function playUntil(
  engine: ReturnType<typeof createEngine>,
  start: GameState,
  match: (event: GameEvent) => boolean,
  maxDays = 200,
) {
  let state = start;
  const events: GameEvent[] = [];
  for (let day = 1; day <= maxDays; day++) {
    const result = engine.advanceHours(state, 24);
    state = result.state;
    events.push(...result.events);
    if (result.events.some(match)) return { state, events, days: day };
  }
  throw new Error('Expected event did not happen');
}

function act(
  engine: ReturnType<typeof createEngine>,
  state: GameState,
  action: Parameters<ReturnType<typeof createEngine>['dispatch']>[1],
) {
  const result = engine.dispatch(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.reason.code}`);
  return result;
}

describe('works', () => {
  it('runs a costed project: quotes, schedule, bill and DPE before and after', () => {
    const content = steadyContent();
    const engine = createEngine(content);
    let state = withOwned(flat(1));
    const id = 'property-flat';
    // Insulation (mason), windows (carpenter) and heating (heating engineer), standard range.
    const quotes = [
      { artisanId: 'batiJura', itemId: 'insulation' },
      { artisanId: 'fenetresSurDole', itemId: 'windows' },
      { artisanId: 'thermoJura', itemId: 'heating' },
    ];
    const estimate = engine.worksEstimate(
      state,
      id,
      quotes.map((q) => ({ itemId: q.itemId, tier: 'standard' as const })),
    );
    for (const quote of quotes) {
      state = act(engine, state, {
        type: 'works/quote',
        propertyId: id,
        artisanId: quote.artisanId,
        items: [{ itemId: quote.itemId, tier: 'standard' }],
      }).state;
    }
    const received = state.properties[0]?.quotes ?? [];
    // Reference prices, TTC, for Dole (index 0.95) and items to redo entirely (× 1.25):
    // insulation 70 €/m² × 48 m² of walls = 3 990 €; windows 5 × 900 € = 5 344 €;
    // heating (gas condensing boiler) 4 500 € + 50 €/m² × 60 m² = 8 906 €.
    expect(received.map((q) => q.total)).toEqual([3_990_00, 5_344_00, 8_906_00]);
    expect(estimate?.cost).toBe(18_240_00);
    // Insulation 3 + 0.12 × 48 = 9 days, windows 0.5 + 0.4 × 5 = 3 days, heating 4 + 0.04 × 60 = 7 days.
    expect(received.map((q) => q.days)).toEqual([9, 3, 7]);
    // Heating first (phase 2), then insulation and windows together (phase 3): 7 + 9 days.
    expect(estimate?.days).toBe(16);
    expect(estimate?.dpeBefore).toBe('F');
    expect(estimate?.dpeAfter).toBe('C');
    // Four quotes took 30 minutes each of free time.
    const balance = state.player.balance;
    const started = act(engine, state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: received.map((q) => q.id),
      diy: [],
    });
    state = started.state;
    // 30 % deposit now.
    expect(balance - state.player.balance).toBe(Math.round(18_240_00 * 0.3));
    const plan = engine.worksPlan(state, id) ?? [];
    const today = toDayNumber(state.clock.date);
    expect(Math.max(...plan.map((task) => task.endDay)) - today).toBe(17);
    const done = playUntil(engine, state, (e) => e.type === 'worksCompleted');
    // Starts tomorrow, 16 days of works.
    expect(done.days).toBe(17);
    const completed = done.events.find((e) => e.type === 'worksCompleted');
    expect(completed).toMatchObject({ cost: 18_240_00, dpeBefore: 'F', dpeAfter: 'C' });
    const property = done.state.properties[0]?.property;
    expect(property?.dpe).toBe('C');
    for (const item of ['insulation', 'windows', 'heating']) {
      expect(property && findItem(property, item)).toMatchObject({ state: 5, tier: 'standard' });
    }
    expect(done.state.tax.ledgers[id]?.works).toBe(18_240_00);
    expect(done.state.worksDone.dole).toBe(1);
    expect(done.state.artisans.batiJura?.jobs).toBe(1);
  });

  it('raises the value and the rent with the state of the home, within the neighbourhood ceiling', () => {
    const engine = createEngine(steadyContent());
    const state = withOwned(flat(2));
    const all = (tier: 'eco' | 'standard' | 'premium') =>
      (engine.worksCatalog(state, 'property-flat') ?? [])
        .filter((item) => item.trade !== null)
        .map((item) => ({ itemId: item.id, tier }));
    const standard = engine.worksEstimate(state, 'property-flat', all('standard'));
    const premium = engine.worksEstimate(state, 'property-flat', all('premium'));
    if (!standard || !premium) throw new Error('No estimate');
    expect(standard.valueAfter).toBeGreaterThan(standard.valueBefore * 1.4);
    expect(standard.rentAfter).toBeGreaterThan(standard.rentBefore);
    // Premium costs far more than it adds: the ceiling of the neighbourhood stops it.
    expect(premium.cost).toBeGreaterThan(standard.cost * 1.5);
    expect(premium.valueAfter - standard.valueAfter).toBeLessThan(premium.cost - standard.cost);
  });

  it('stops for a hazard: postponing removes the item, treating adds cost and delay', () => {
    const content = steadyContent((c) => {
      const asbestos = c.works.hazards.find((h) => h.id === 'asbestos');
      if (asbestos) asbestos.probability = 1;
    });
    const engine = createEngine(content);
    const id = 'property-flat';
    let state = withOwned(flat(2));
    const floor = 'living.floors';
    state = act(engine, state, {
      type: 'works/quote',
      propertyId: id,
      artisanId: 'jointParfait',
      items: [
        { itemId: floor, tier: 'standard' },
        { itemId: 'kitchen.floors', tier: 'standard' },
      ],
    }).state;
    const quoteId = state.properties[0]?.quotes[0]?.id ?? '';
    state = act(engine, state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [quoteId],
      diy: [],
    }).state;
    const hazard = playUntil(engine, state, (e) => e.type === 'worksHazard', 5);
    const event = hazard.events.find((e) => e.type === 'worksHazard');
    if (event?.type !== 'worksHazard') throw new Error('No hazard');
    expect(event.hazardId).toBe('asbestos');
    const postponed = act(engine, hazard.state, {
      type: 'works/hazard',
      propertyId: id,
      choice: 'postpone',
    }).state;
    const owned = postponed.properties[0];
    expect(owned?.property.postponedHazards).toEqual([
      { hazardId: 'asbestos', itemId: event.itemId },
    ]);
    const task = owned?.works?.tasks[0];
    expect(task?.items.map((line) => line.itemId)).not.toContain(event.itemId);
    // At most one hazard per task: the other floor is laid.
    const first = playUntil(engine, postponed, (e) => e.type === 'worksCompleted', 30);
    const floors = (s: GameState) =>
      s.properties[0]?.property.items.filter((item) => item.kind === 'floors' && item.state === 5)
        .length;
    expect(floors(first.state)).toBe(1);
    // The postponed hazard comes back for sure; unanswered, it is treated after three days.
    let again = act(engine, first.state, {
      type: 'works/quote',
      propertyId: id,
      artisanId: 'jointParfait',
      items: [{ itemId: event.itemId, tier: 'standard' }],
    }).state;
    const quote = again.properties[0]?.quotes[0];
    again = act(engine, again, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [quote?.id ?? ''],
      diy: [],
    }).state;
    const back = playUntil(engine, again, (e) => e.type === 'worksHazard', 5);
    const resolved = playUntil(engine, back.state, (e) => e.type === 'worksHazardResolved', 10);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'worksHazardResolved', choice: 'treat' }),
    );
    const finished = playUntil(engine, resolved.state, (e) => e.type === 'worksCompleted', 60);
    const completed = finished.events.find((e) => e.type === 'worksCompleted');
    const cost = back.events.find((e) => e.type === 'worksHazard');
    // The bill includes the asbestos removal.
    expect(completed?.type === 'worksCompleted' && completed.cost).toBe(
      (quote?.total ?? 0) + (cost?.type === 'worksHazard' ? cost.cost : 0),
    );
    expect(finished.state.properties[0]?.property.postponedHazards).toEqual([]);
    expect(floors(finished.state)).toBe(2);
  });

  it('allows only small works with a tenant in place, at the cost of his satisfaction', () => {
    const engine = createEngine(steadyContent());
    const id = 'property-sample';
    const owned = sampleOwned(toDayNumber({ year: 2026, month: 10, day: 1 }));
    let state = withOwned({
      ...owned,
      property: {
        ...owned.property,
        items: owned.property.items.map((item) => ({ ...item, state: 2 })),
      },
    });
    state = act(engine, state, {
      type: 'works/quote',
      propertyId: id,
      artisanId: 'elecComtoise',
      items: [{ itemId: 'electricity', tier: 'standard' }],
    }).state;
    state = act(engine, state, {
      type: 'works/quote',
      propertyId: id,
      artisanId: 'couleursDuDoubs',
      items: [{ itemId: 'living.walls', tier: 'standard' }],
    }).state;
    const [electricity, painting] = state.properties[0]?.quotes ?? [];
    const refused = engine.dispatch(state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [electricity?.id ?? ''],
      diy: [],
    });
    expect(refused.ok ? null : refused.reason.code).toBe('works.occupied');
    state = act(engine, state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [painting?.id ?? ''],
      diy: [],
    }).state;
    const before = state.properties[0]?.lease?.satisfaction ?? 0;
    const done = playUntil(engine, state, (e) => e.type === 'worksCompleted', 30);
    expect(done.state.properties[0]?.lease?.satisfaction ?? 100).toBeLessThan(before);
  });

  it('lets anyone paint, only an electrician rewire, on free time', () => {
    const engine = createEngine(steadyContent());
    const id = 'property-flat';
    const state = withOwned(flat(2));
    const rewire = engine.dispatch(state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [],
      diy: [{ itemId: 'electricity', tier: 'standard' }],
    });
    expect(rewire.ok ? null : rewire.reason.code).toBe('works.diyNotAllowed');
    const painting = act(engine, state, {
      type: 'works/start',
      propertyId: id,
      quoteIds: [],
      diy: [{ itemId: 'living.walls', tier: 'eco' }],
    }).state;
    const task = painting.properties[0]?.works?.tasks[0];
    expect(task?.artisanId).toBeNull();
    expect(task?.minutesNeeded).toBeGreaterThan(0);
    const done = playUntil(engine, painting, (e) => e.type === 'worksCompleted', 60);
    // Only the materials are paid.
    const cost = done.events.find((e) => e.type === 'worksCompleted');
    const catalog = engine.worksCatalog(state, id)?.find((item) => item.id === 'living.walls');
    expect(cost).toMatchObject({ cost: catalog?.diy?.tiers.eco.materials });
    const walls = done.state.properties[0]?.property.items.find(
      (item) => itemId(item) === 'living.walls',
    );
    expect(walls?.state).toBeGreaterThanOrEqual(3);
    expect(walls?.tier).toBe('eco');

    const electrician = { ...state, player: { ...state.player, jobId: 'electrician' } };
    expect(
      engine.dispatch(electrician, {
        type: 'works/start',
        propertyId: id,
        quoteIds: [],
        diy: [{ itemId: 'electricity', tier: 'standard' }],
      }).ok,
    ).toBe(true);
  });

  it('wears renovated items over the years, faster in the Éco range', () => {
    const content = steadyContent((c) => {
      c.works.tiers.eco.wear = 1;
      c.works.tiers.premium.wear = 0;
    });
    const engine = createEngine(content);
    const owned = flat(5);
    const items = owned.property.items.map((item, i) => ({
      ...item,
      tier: i % 2 === 0 ? ('eco' as const) : ('premium' as const),
    }));
    let state = withOwned({ ...owned, property: { ...owned.property, items } });
    state = playUntil(engine, state, (e) => e.type === 'yearStarted', 400).state;
    for (const item of state.properties[0]?.property.items ?? []) {
      const factor = content.works.items[item.kind].wearFactor;
      if (item.tier === 'premium') expect(item.state).toBe(5);
      else if (factor >= 1) expect(item.state).toBe(4);
    }
  });

  it('holds a general meeting: vote, call for funds, better common parts', () => {
    const content = steadyContent((c) => {
      for (const resolution of c.works.copro.resolutions)
        resolution.support = { min: 0.45, max: 0.45 };
      c.works.copro.resolutionsPerMeeting = { min: 1, max: 1 };
    });
    const engine = createEngine(content);
    const owned = flat(3);
    // The player owns a third of a small building: his vote decides.
    const property = { ...owned.property, copro: { lots: 3, meetingMonth: 11 } };
    let state = withOwned({ ...owned, property });
    const called = playUntil(engine, state, (e) => e.type === 'coproMeetingCalled', 40);
    const event = called.events.find((e) => e.type === 'coproMeetingCalled');
    if (event?.type !== 'coproMeetingCalled') throw new Error('No meeting');
    const resolution = event.resolutions[0];
    if (!resolution) throw new Error('No resolution');
    const free = called.state.player.freeTimeMinutes;
    state = act(engine, called.state, {
      type: 'copro/vote',
      propertyId: property.id,
      resolutionId: resolution.id,
      vote: 'for',
    }).state;
    expect(free - state.player.freeTimeMinutes).toBe(content.works.copro.attendMinutes);
    const held = playUntil(engine, state, (e) => e.type === 'coproMeetingHeld', 20);
    const result = held.events.find((e) => e.type === 'coproMeetingHeld');
    expect(result).toMatchObject({ results: [{ id: resolution.id, passed: true }] });
    const rule = content.works.copro.resolutions.find((r) => r.id === resolution.id);
    expect(held.state.properties[0]?.coproCalls).toEqual([
      { monthly: Math.round(resolution.cost / (rule?.months ?? 1)), monthsLeft: rule?.months },
    ]);
    const month = playUntil(engine, held.state, (e) => e.type === 'monthStarted', 40);
    const statement = month.events.find((e) => e.type === 'monthlyStatement');
    expect(statement?.type === 'monthlyStatement' && statement.lines).toContainEqual(
      expect.objectContaining({ kind: 'coproCall', propertyId: property.id }),
    );
  });
});
