import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  advanceUntil,
  content,
  engine,
  newGame,
  sampleOwned,
  systemContext,
  withState,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { deepClone } from '../clone.ts';
import type { GameState } from '../state.ts';
import { retainedIncome } from './banking.ts';
import { expectedSalary } from './household.ts';
import {
  furnitureCost,
  letBanDay,
  lettingBlock,
  marketRent,
  recoverableCharges,
  rentRange,
  runDailyRentalListings,
} from './renting.ts';

/** A new game owning one vacant flat (sampleOwned), with enough cash. */
function owner(overrides: Parameters<typeof sampleOwned>[1] = {}): GameState {
  const state = newGame({ seed: 7 });
  const today = toDayNumber(state.clock.date);
  state.properties = [sampleOwned(today, { let: false, ...overrides })];
  state.player.balance = 20_000_00;
  return state;
}

const PROPERTY = 'property-sample';

function list(
  state: GameState,
  terms: Partial<{ agencyId: string | null; insured: boolean }> = {},
) {
  const quote = engine.rentQuote(state, PROPERTY, 'bare');
  if (!quote) throw new Error('No quote');
  return act(state, {
    type: 'rent/list',
    propertyId: PROPERTY,
    leaseType: 'bare',
    monthlyRent: quote.market,
    agencyId: terms.agencyId ?? null,
    insured: terms.insured ?? false,
  }).state;
}

describe('rents', () => {
  it('prices the rent from the neighbourhood, charges excluded, with a furnished premium', () => {
    const state = owner();
    const property = sampleOwned(0).property;
    const bare = marketRent(content, state, property, 'bare');
    const furnished = marketRent(content, state, property, 'furnished');
    const rentPerM2 = content.cities.dole?.neighbourhoods[0]?.rentPerM2.smallApartment ?? 0;
    // Data rents include charges: the recoverable charges are taken out.
    expect(bare).toBeLessThan(property.surface * rentPerM2 * 100 * 1.2);
    expect(bare).toBeGreaterThan(
      property.surface * rentPerM2 * 100 * 0.8 - recoverableCharges(content, property),
    );
    expect(furnished / bare).toBeCloseTo(content.renting.leaseTypes.furnished.rentFactor, 1);
    expect(marketRent(content, state, withState(property, 1))).toBe(0);
    const range = rentRange(content, state, property, 'bare');
    expect(range.min).toBeLessThan(range.market);
    expect(range.max).toBeGreaterThan(range.market);
  });

  it('follows the real DPE calendar of the loi Climat et résilience', () => {
    const g = letBanDay(content, 'G');
    const f = letBanDay(content, 'F');
    const e = letBanDay(content, 'E');
    expect(g).toBe(toDayNumber({ year: 2025, month: 1, day: 1 }));
    expect(f).toBe(toDayNumber({ year: 2028, month: 1, day: 1 }));
    expect(e).toBe(toDayNumber({ year: 2034, month: 1, day: 1 }));
    expect(letBanDay(content, 'D')).toBeNull();
    const today = toDayNumber({ year: 2026, month: 10, day: 18 });
    const property = sampleOwned(0).property;
    expect(lettingBlock(content, { ...property, dpe: 'G' }, today)).toBe('rent.dpeBanned');
    expect(lettingBlock(content, { ...property, dpe: 'F' }, today)).toBeNull();
    expect(lettingBlock(content, { ...property, dpe: 'F' }, (f ?? 0) + 1)).toBe('rent.dpeBanned');
    expect(lettingBlock(content, withState(property, 1), today)).toBe('rent.indecent');
  });
});

describe('offering a property for rent', () => {
  it('refuses rents outside the range, banned or indecent homes and the home', () => {
    const state = owner();
    const quote = engine.rentQuote(state, PROPERTY, 'bare');
    if (!quote) throw new Error('No quote');
    const terms = {
      type: 'rent/list',
      propertyId: PROPERTY,
      leaseType: 'bare',
      monthlyRent: quote.market,
      agencyId: null,
      insured: false,
    } as const;
    const refusal = (s: GameState, action = terms) => {
      const result = engine.dispatch(s, action);
      return result.ok ? null : result.reason.code;
    };
    expect(refusal(state, { ...terms, monthlyRent: quote.max + 100 })).toBe('rent.invalidRent');
    expect(refusal(state, { ...terms, agencyId: 'nowhere' } as never)).toBe('agency.unknown');
    expect(refusal(owner({ property: { dpe: 'G' } }))).toBe('rent.dpeBanned');
    expect(
      refusal(owner({ property: { items: withState(sampleOwned(0).property, 1).items } })),
    ).toBe('rent.indecent');
    const home = act(state, { type: 'home/moveIn', propertyId: PROPERTY }).state;
    expect(refusal(home)).toBe('rent.isHome');
    expect(refusal(state)).toBeNull();
  });

  it('buys the furniture for a furnished let', () => {
    const state = owner();
    const quote = engine.rentQuote(state, PROPERTY, 'furnished');
    if (!quote) throw new Error('No quote');
    const { state: listed, events } = act(state, {
      type: 'rent/list',
      propertyId: PROPERTY,
      leaseType: 'furnished',
      monthlyRent: quote.market,
      agencyId: null,
      insured: false,
    });
    const cost = furnitureCost(content, sampleOwned(0).property);
    expect(quote.furnitureCost).toBe(cost);
    expect(listed.player.balance).toBe(state.player.balance - cost);
    expect(listed.properties[0]?.furniture?.cost).toBe(cost);
    expect(events).toContainEqual({ type: 'furnitureBought', propertyId: PROPERTY, cost });
  });
});

describe('candidates and move-in', () => {
  it('receives candidates, each visit taking the owner’s free time', () => {
    const listed = list(owner());
    const { state } = advanceUntil(listed, (e) => e.type === 'applicationReceived', 60);
    const application = state.properties[0]?.rental?.applications[0];
    expect(application?.tenant.monthlyIncome).toBeGreaterThan(0);
    expect(content.tenantTexts.firstNames).toContain(application?.tenant.firstName);
    expect(content.tenantTexts.traits[application?.tenant.traitId ?? '']).toBeDefined();

    // A candidate every day: the visit takes free time, or is missed without it.
    const eager = deepClone(content);
    eager.renting.applications.dailyProbability = 1;
    const minutes = content.renting.selfManagement.visitMinutes;
    const ctx = { ...systemContext(listed), content: eager };
    ctx.state.player.freeTimeMinutes = minutes;
    runDailyRentalListings(ctx);
    expect(ctx.state.player.freeTimeMinutes).toBe(0);
    expect(ctx.state.properties[0]?.rental?.applications).toHaveLength(1);
    runDailyRentalListings(ctx);
    expect(ctx.events.at(-1)).toEqual({ type: 'rentalVisitMissed', propertyId: PROPERTY });
    expect(ctx.state.properties[0]?.rental?.applications).toHaveLength(1);
  });

  it('signs a lease with the chosen candidate: deposit received, rent counted by the banks', () => {
    const listed = list(owner());
    let state = advanceUntil(listed, (e) => e.type === 'applicationReceived', 60).state;
    // Accepting needs the time of the inventory: wait for a free evening if needed.
    for (let day = 0; day < 10; day++) {
      const application = state.properties[0]?.rental?.applications[0];
      if (!application) break;
      const result = engine.dispatch(state, {
        type: 'rent/accept',
        propertyId: PROPERTY,
        applicationId: application.id,
      });
      if (result.ok) {
        state = result.state;
        break;
      }
      expect(result.reason.code).toBe('time.notEnoughFreeTime');
      state = advanceDays(state, 1).state;
    }
    const lease = state.properties[0]?.lease;
    if (!lease) throw new Error('No lease');
    expect(state.properties[0]?.rental).toBeNull();
    expect(lease.deposit).toBe(lease.monthlyRent * content.renting.leaseTypes.bare.depositMonths);
    expect(retainedIncome(content, state)).toBe(
      Math.round(
        expectedSalary(content, state.player) +
          content.credit.retainedRentShare * lease.monthlyRent,
      ),
    );
    // The first rent arrives with the next statement.
    const statement = advanceUntil(state, (e) => e.type === 'monthlyStatement', 40).event;
    if (statement.type !== 'monthlyStatement') throw new Error('unreachable');
    expect(statement.lines).toContainEqual({
      kind: 'rentalIncome',
      propertyId: PROPERTY,
      amount: lease.monthlyRent + recoverableCharges(content, sampleOwned(0).property),
    });
  });

  it('lets an agency pick a tenant on its own', () => {
    const listed = list(owner(), { agencyId: 'bonnePioche' });
    const { event } = advanceUntil(listed, (e) => e.type === 'tenantMovedIn', 90);
    expect(event).toMatchObject({ propertyId: PROPERTY, agencyId: 'bonnePioche' });
  });

  it('gets fewer and more fragile candidates when the rent is high', () => {
    const count = (ratio: number) => {
      const ctx = systemContext(list(owner(), { agencyId: 'immoZen' }));
      const rental = ctx.state.properties[0]?.rental;
      if (!rental) throw new Error('No rental');
      rental.monthlyRent = Math.round(rental.monthlyRent * ratio);
      let received = 0;
      let reliability = 0;
      for (let day = 0; day < 2000; day++) {
        rental.applications = [];
        // The agency would pick before the count: keep it waiting.
        rental.listedDay = ctx.today;
        ctx.events.length = 0;
        runDailyRentalListings(ctx);
        const application = rental.applications[0];
        if (application) {
          received += 1;
          reliability += application.tenant.reliability;
        }
      }
      return { received, reliability: reliability / received };
    };
    const market = count(1);
    const high = count(1.25);
    expect(high.received).toBeLessThan(market.received * 0.5);
    expect(high.reliability).toBeLessThan(market.reliability);
  });
});

describe('a sale agreed', () => {
  it('takes the property off the rental market', () => {
    const ctx = systemContext(list(owner()));
    const owned = ctx.state.properties[0];
    if (!owned) throw new Error('No property');
    owned.sale = {
      askingPrice: 90_000_00,
      mode: 'self',
      listedDay: ctx.today,
      offers: [],
      agreement: { price: 90_000_00, deedDay: ctx.today + 60, buyerId: null },
    };
    runDailyRentalListings(ctx);
    expect(owned.rental).toBeNull();
    expect(ctx.events).toContainEqual({ type: 'rentalWithdrawn', propertyId: PROPERTY });
  });
});

describe('main residence', () => {
  it('stops the home rent and the landlord insurance, and back', () => {
    const state = owner();
    const home = act(state, { type: 'home/moveIn', propertyId: PROPERTY }).state;
    expect(home.player.monthlyRent).toBe(0);
    expect(home.player.homePropertyId).toBe(PROPERTY);
    const statement = advanceUntil(home, (e) => e.type === 'monthlyStatement', 40).event;
    if (statement.type !== 'monthlyStatement') throw new Error('unreachable');
    expect(statement.lines.some((l) => l.kind === 'ownerInsurance')).toBe(false);
    expect(statement.lines).toContainEqual({ kind: 'rent', amount: 0 });
    const back = act(home, { type: 'home/moveOut' }).state;
    expect(back.player.monthlyRent).toBe(content.start.monthlyRent * 100);
    expect(back.player.homePropertyId).toBeNull();
  });

  it('is exempt from the capital gains tax', () => {
    const state = owner();
    const home = act(state, { type: 'home/moveIn', propertyId: PROPERTY }).state;
    expect(engine.capitalGainsTax(home, PROPERTY, 150_000_00)?.tax).toBe(0);
    expect(engine.capitalGainsTax(state, PROPERTY, 150_000_00)?.tax).toBeGreaterThan(0);
  });
});
