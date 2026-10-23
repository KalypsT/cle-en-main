import { describe, expect, it } from 'vitest';
import { newGame, quietContent, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameContent } from '../content.ts';
import { createEngine } from '../engine.ts';
import type { GameEvent } from '../events.ts';
import type { GameState, Lease } from '../state.ts';
import { rentLevel } from './renting.ts';

const PROPERTY = 'property-sample';

function setup(content: GameContent, change: (lease: Lease, state: GameState) => void = () => {}) {
  const engine = createEngine(content);
  const state = newGame({ seed: 11 });
  const today = toDayNumber(state.clock.date);
  const owned = sampleOwned(today);
  state.properties = [owned];
  state.player.balance = 20_000_00;
  if (owned.lease) change(owned.lease, state);
  return { engine, state, today };
}

/** Advances day by day (to 08:00) until `match`, within `maxDays`. */
function until(
  engine: ReturnType<typeof createEngine>,
  start: GameState,
  match: (event: GameEvent, state: GameState) => boolean,
  maxDays = 400,
) {
  let state = start;
  const events: GameEvent[] = [];
  for (let day = 0; day < maxDays; day++) {
    const result = engine.advanceHours(state, 24);
    state = result.state;
    events.push(...result.events);
    const event = result.events.find((e) => match(e, state));
    if (event) return { state, events, event };
  }
  throw new Error('Expected event did not happen');
}

describe('unpaid rents', () => {
  function badPayer(insured: boolean) {
    const content = quietContent();
    content.renting.unpaid.monthlyProbability = 1;
    content.renting.unpaid.procedureMonths = { min: 1, max: 1 };
    return setup(content, (lease) => {
      lease.tenant.reliability = 0;
      lease.insured = insured;
    });
  }

  it('goes from a late rent to a reminder, a procedure and an eviction after the winter truce', () => {
    const { engine, state } = badPayer(false);
    const { state: evicted, events } = until(
      engine,
      state,
      (e) => e.type === 'tenantLeft' && e.reason === 'evicted',
    );
    const types = events.map((e) => e.type);
    expect(types.indexOf('rentMissed')).toBeLessThan(types.indexOf('reminderSent'));
    expect(events).toContainEqual({ type: 'reminderSent', propertyId: PROPERTY, settled: false });
    expect(types.indexOf('reminderSent')).toBeLessThan(types.indexOf('procedureStarted'));
    const procedure = events.find((e) => e.type === 'procedureStarted');
    if (procedure?.type !== 'procedureStarted') throw new Error('No procedure');
    expect(procedure.cost).toBeGreaterThan(0);
    // The procedure ends in winter: the eviction waits for April.
    expect(evicted.clock.date.month).toBe(4);
    expect(evicted.clock.date.day).toBe(1);
    const gains = engine.content.progression.reputation;
    expect(evicted.player.reputation).toBe(
      Math.max(
        0,
        state.player.reputation -
          engine.content.renting.unpaid.reputationPenalty +
          gains.procedure +
          gains.eviction,
      ),
    );
    // The deposit covers part of the debt: nothing is given back.
    const left = events.find((e) => e.type === 'tenantLeft');
    expect(left).toMatchObject({ depositReturned: 0 });
    expect(evicted.properties[0]?.lease).toBeNull();
    expect(evicted.properties[0]?.rental).not.toBeNull();
  });

  it('is paid by the unpaid-rent insurance, which also pays the procedure', () => {
    const { engine, state } = badPayer(true);
    const { events } = until(engine, state, (e) => e.type === 'procedureStarted');
    const statements = events.flatMap((e) => (e.type === 'monthlyStatement' ? [e.lines] : []));
    for (const lines of statements) {
      expect(lines.some((l) => l.kind === 'rentalIncome')).toBe(true);
      expect(lines.some((l) => l.kind === 'legalCosts')).toBe(false);
    }
    expect(events.find((e) => e.type === 'procedureStarted')).toMatchObject({ cost: 0 });
  });

  it('counts the premiums of the insurance and what it paid in the tenant’s place', () => {
    const { engine, state } = badPayer(true);
    const { state: after, events } = until(engine, state, (e) => e.type === 'procedureStarted');
    let premiums = 0;
    let paidOut = 0;
    for (const event of events) {
      if (event.type === 'rentMissed') paidOut += event.amount;
      if (event.type !== 'monthlyStatement') continue;
      for (const line of event.lines) {
        if (line.kind === 'ownerInsurance') premiums += line.amount;
      }
    }
    const owned = after.properties[0];
    expect(owned?.unpaidRentInsurance.paidOut).toBe(paidOut);
    expect(paidOut).toBeGreaterThan(0);
    // The landlord insurance is not the unpaid-rent one: the premiums are less than the line.
    expect(owned?.unpaidRentInsurance.premiums).toBeGreaterThan(0);
    expect(owned?.unpaidRentInsurance.premiums).toBeLessThan(premiums);
  });
});

describe('incidents', () => {
  function withLeak() {
    return setup(quietContent(), (lease, state) => {
      lease.incident = {
        id: 'incident-x',
        kindId: 'leak',
        day: toDayNumber(state.clock.date),
        repair: null,
      };
    });
  }

  it('can be fixed by the owner himself, with his free time', () => {
    const { engine, state } = withLeak();
    const leak = engine.content.renting.incidents.find((k) => k.id === 'leak');
    if (!leak) throw new Error('No leak rule');
    const tired = engine.dispatch(
      { ...state, player: { ...state.player, freeTimeMinutes: 0 } },
      {
        type: 'rent/repair',
        propertyId: PROPERTY,
        method: 'self',
      },
    );
    // No free time left today: the repair is planned in the agenda.
    if (!tired.ok) throw new Error(tired.reason.code);
    expect(tired.state.agenda[0]).toMatchObject({ kind: 'selfRepair', propertyId: PROPERTY });
    const rested = { ...state, player: { ...state.player, freeTimeMinutes: leak.selfMinutes } };
    const fixed = engine.dispatch(rested, {
      type: 'rent/repair',
      propertyId: PROPERTY,
      method: 'self',
    });
    if (!fixed.ok) throw new Error(fixed.reason.code);
    const repaired = fixed.events.find((e) => e.type === 'incidentRepaired');
    if (repaired?.type !== 'incidentRepaired') throw new Error('Not repaired');
    expect(repaired.cost).toBeGreaterThanOrEqual(leak.selfCost.min * 100);
    expect(repaired.cost).toBeLessThanOrEqual(leak.selfCost.max * 100);
    expect(fixed.state.properties[0]?.lease?.incident).toBeNull();
    expect(fixed.state.player.freeTimeMinutes).toBe(0);
  });

  it('can be fixed by an artisan a few days later, for more', () => {
    const { engine, state } = withLeak();
    const booked = engine.dispatch(state, {
      type: 'rent/repair',
      propertyId: PROPERTY,
      method: 'artisan',
    });
    if (!booked.ok) throw new Error(booked.reason.code);
    const { event } = until(engine, booked.state, (e) => e.type === 'incidentRepaired', 10);
    const leak = engine.content.renting.incidents.find((k) => k.id === 'leak');
    if (event.type !== 'incidentRepaired' || !leak) throw new Error('unreachable');
    // The cheapest artisan of the address book applies his own price factor.
    const factors = engine.content.artisans.map((artisan) => artisan.priceFactor);
    expect(event.cost).toBeGreaterThanOrEqual(
      Math.floor(leak.artisanCost.min * 100 * Math.min(1, ...factors)),
    );
  });

  it('makes the tenant leave when nobody fixes it', () => {
    const { engine, state } = withLeak();
    const { state: after, event } = until(engine, state, (e) => e.type === 'tenantGaveNotice', 40);
    expect(event).toMatchObject({ reason: 'incident' });
    expect(after.properties[0]?.lease?.satisfaction).toBeLessThan(50);
  });
});

describe('the life of a lease', () => {
  it('ends with the notice: deposit returned, the property offered again on the same terms', () => {
    const { engine, state } = setup(quietContent(), (lease, s) => {
      lease.noticeEndDay = toDayNumber(s.clock.date) + 2;
      // An agency handles the exit inventory.
      lease.agencyId = 'immoZen';
    });
    const { state: after, event } = until(engine, state, (e) => e.type === 'tenantLeft', 5);
    expect(event).toMatchObject({ reason: 'notice', damages: 0, depositReturned: 520_00 });
    expect(after.properties[0]?.rental).toMatchObject({
      leaseType: 'bare',
      agencyId: 'immoZen',
      monthlyRent: 520_00,
    });
  });

  it('revises the rent each year like the IRL: up with the market, capped, never down', () => {
    const revise = (factor: number) => {
      const content = quietContent();
      const { engine, state } = setup(content, (lease, s) => {
        lease.anniversaryDay = toDayNumber(s.clock.date) + 1;
        lease.revisionFactor = rentLevel(content, s, sampleOwned(0).property) * factor;
      });
      return engine.advanceHours(state, 48).state.properties[0]?.lease?.monthlyRent;
    };
    expect(revise(0.8)).toBe(Math.round(520_00 * 1.035));
    expect(revise(1.2)).toBe(520_00);
  });

  it('keeps an F-rated lease running but does not renew it after 2028', () => {
    const { engine, state } = setup(quietContent(), (lease, s) => {
      lease.termDay = toDayNumber({ year: 2028, month: 3, day: 1 });
      lease.anniversaryDay = toDayNumber(s.clock.date) + 10_000;
    });
    const owned = state.properties[0];
    if (owned) owned.property.dpe = 'F';
    const warned = until(engine, state, (e) => e.type === 'dpeWarning', 120);
    expect(warned.event).toMatchObject({
      propertyId: PROPERTY,
      banDay: toDayNumber({ year: 2028, month: 1, day: 1 }),
    });
    const { state: after, events } = until(
      engine,
      warned.state,
      (e) => e.type === 'tenantLeft',
      500,
    );
    expect(after.clock.date).toEqual({ year: 2028, month: 3, day: 1 });
    expect(events.find((e) => e.type === 'tenantLeft')).toMatchObject({ reason: 'dpe' });
    expect(events).toContainEqual({
      type: 'rentalBlocked',
      propertyId: PROPERTY,
      reason: 'rent.dpeBanned',
    });
    expect(after.properties[0]?.rental).toBeNull();
  });
});
