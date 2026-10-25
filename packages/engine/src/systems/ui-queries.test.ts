import { describe, expect, it } from 'vitest';
import {
  act,
  advanceToNextMonth,
  advanceUntil,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
  sampleOwned,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { annuityPayment } from '../money.ts';
import type { GameState } from '../state.ts';
import { decisionKey } from './ui-queries.ts';

function withOwned(state: GameState, ...owned: GameState['properties']): GameState {
  return { ...state, properties: [...state.properties, ...owned] };
}

describe('pending decisions', () => {
  it('lists nothing at the start of a game', () => {
    expect(engine.pendingDecisions(newGame())).toEqual([]);
  });

  it('follows a purchase: counter-offer, loan to ask, loan to choose', () => {
    let state = newGame();
    const listing = affordableListing(state);
    // A low offer: the seller refuses or counters.
    state = act(state, {
      type: 'market/offer',
      listingId: listing.id,
      amount: Math.round(listing.askingPrice * 0.9),
    }).state;
    state = advanceUntil(state, (e) => e.type === 'offerAnswered').state;
    const counter = state.listings.find((l) => l.id === listing.id)?.offer?.counter;
    if (counter) {
      const [decision] = engine.pendingDecisions(state);
      expect(decision).toMatchObject({
        kind: 'counterOffer',
        listingId: listing.id,
        amount: counter.amount,
        deadlineDay: counter.expiresDay,
        autoPause: true,
      });
    }

    // At the asking price: a compromis, then a loan to ask for.
    let buying = newGame();
    const target = affordableListing(buying);
    buying = act(buying, {
      type: 'market/offer',
      listingId: target.id,
      amount: target.askingPrice,
    }).state;
    buying = advanceUntil(buying, (e) => e.type === 'compromisSigned').state;
    const purchase = buying.purchases[0];
    if (!purchase) throw new Error('No compromis');
    expect(engine.pendingDecisions(buying)).toEqual([
      {
        kind: 'loanNeeded',
        purchaseId: purchase.id,
        deadlineDay: purchase.loanDeadlineDay,
        autoPause: false,
      },
    ]);
    buying = act(buying, {
      type: 'purchase/requestLoan',
      purchaseId: purchase.id,
      bankId: 'tirelire',
      amount: purchase.price,
      durationYears: 20,
    }).state;
    // Waiting for the bank: nothing to decide about the purchase (events and challenges aside).
    const aboutPurchase = (state: typeof buying) =>
      engine
        .pendingDecisions(state)
        .filter((d) => d.kind !== 'catalogEvent' && d.kind !== 'challengeOffer');
    expect(aboutPurchase(buying)).toEqual([]);
    buying = advanceUntil(buying, (e) => e.type === 'loanAnswered').state;
    const application = buying.purchases[0]?.applications[0];
    expect(aboutPurchase(buying)[0]).toMatchObject({
      kind: 'loanAnswer',
      applicationIds: [application?.id],
    });
  });

  it('lists candidates, incidents and a vacant property, sorted by deadline', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const vacant = sampleOwned(today, { let: false });
    const let_ = sampleOwned(today);
    let_.property = { ...let_.property, id: 'property-let' };
    if (!let_.lease) throw new Error('Sample is let');
    let_.lease.incident = { id: 'incident-1', kindId: 'leak', day: today, repair: null };
    const listed = sampleOwned(today, { let: false });
    listed.property = { ...listed.property, id: 'property-listed' };
    listed.rental = {
      leaseType: 'bare',
      monthlyRent: 520_00,
      agencyId: null,
      insured: false,
      listedDay: today,
      applications: [
        { id: 'app-1', tenant: let_.lease.tenant, expiresDay: today + 2 },
        { id: 'app-2', tenant: let_.lease.tenant, expiresDay: today + 1 },
      ],
    };
    // A plot of land is never let: no « empty home » decision for it.
    const land = sampleOwned(today, {
      let: false,
      property: { id: 'property-land', kind: 'land' },
    });
    const decisions = engine.pendingDecisions(withOwned(state, vacant, let_, listed, land));
    expect(decisions.map((d) => d.kind)).toEqual(['candidates', 'incident', 'vacant']);
    expect(decisions[0]).toMatchObject({ count: 2, deadlineDay: today + 1 });
    expect(decisions[1]).toMatchObject({
      deadlineDay: today + content.renting.incidentPatienceDays,
    });
    expect(new Set(decisions.map(decisionKey)).size).toBe(3);
  });

  it('warns before the DPE ban of an owned property', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const owned = sampleOwned(today);
    owned.property = { ...owned.property, dpe: 'G' };
    const decisions = engine.pendingDecisions(withOwned(state, owned));
    // G is banned from 2025: already past, so no warning; F is banned in 2028.
    expect(decisions.some((d) => d.kind === 'dpeWarning')).toBe(false);
    owned.property = { ...owned.property, dpe: 'F' };
    const warned = engine.pendingDecisions(withOwned(state, owned));
    // F is banned from 1 January 2028, within the warning horizon of a game started in October 2026.
    expect(warned.find((d) => d.kind === 'dpeWarning')).toMatchObject({
      propertyId: 'property-sample',
      deadlineDay: toDayNumber({ year: 2028, month: 1, day: 1 }),
    });
  });
});

describe('cash flow of a property', () => {
  it('matches the monthly statement of a let flat', () => {
    let state = newGame();
    const today = toDayNumber(state.clock.date);
    state = withOwned(state, sampleOwned(today));
    const flow = engine.cashFlow(state, 'property-sample');
    // 520 € rent, 69,30 € charges back, 99 € charges, 12,29 € insurance, 48,75 € property tax.
    expect(flow).toEqual({
      rent: 520_00,
      recoverableCharges: 69_30,
      charges: 99_00,
      insurance: 12_29,
      managementFees: 0,
      coproCalls: 0,
      propertyTax: 48_75,
      loanPayment: 0,
      loanInterest: 0,
      net: 520_00 + 69_30 - 99_00 - 12_29 - 48_75,
    });
    // Same flows as the statement of the next 1st (property tax aside).
    const { events } = advanceToNextMonth(state);
    const statement = events.find((e) => e.type === 'monthlyStatement');
    if (statement?.type !== 'monthlyStatement') throw new Error('No statement');
    const lines = statement.lines.filter(
      (line) => 'propertyId' in line && line.propertyId === 'property-sample',
    );
    const net = lines.reduce(
      (sum, line) => sum + (line.kind === 'rentalIncome' ? line.amount : -line.amount),
      0,
    );
    expect(net).toBe(flow ? flow.net + flow.propertyTax : NaN);
  });

  it('counts the loan of a bought property', () => {
    const start = newGame();
    const { state, event } = buyWithLoan(start, affordableListing(start).id);
    if (event.type !== 'deedSigned') throw new Error('Not bought');
    const loan = state.loans[0];
    const flow = engine.cashFlow(state, event.propertyId);
    expect(flow?.loanPayment).toBe(loan?.monthlyPayment);
    expect(flow?.loanInterest).toBeGreaterThan(0);
    expect(flow?.rent).toBe(0);
  });
});

describe('financing simulation', () => {
  it('borrows everything but the fees by default', () => {
    const state = newGame();
    const listing = affordableListing(state);
    const sim = engine.simulateFinancing(state, listing.id, {
      bankId: 'tirelire',
      durationYears: 20,
    });
    if (!sim) throw new Error('No simulation');
    const price = listing.askingPrice;
    const notary = Math.round(price * content.credit.notaryFeesShare);
    const bank = Math.round(price * content.credit.bankFeesShare);
    expect(sim).toMatchObject({ price, notaryFees: notary, bankFees: bank, works: 0 });
    expect(sim.contribution).toBe(sim.minContribution);
    expect(sim.loanAmount).toBe(price);
    expect(sim.monthlyPayment).toBe(annuityPayment(price, sim.rate.ratePercent, 240));
    expect(sim.rate.ratePercent).toBe(engine.quoteRate(state, 'tirelire', 20)?.ratePercent);
    expect(sim.rent).toBe(engine.rentQuote(state, listing.id, 'bare')?.market);
    expect(sim.netEffort).toBe(
      sim.rent + sim.recoverableCharges - sim.ownerCosts - sim.monthlyPayment,
    );
    expect(sim.cashAfter).toBe(state.player.balance - sim.contribution);
    expect(sim.decision.decision).not.toBe('refused');
  });

  it('takes a price, a contribution and works', () => {
    const state = newGame();
    const listing = affordableListing(state);
    const sim = engine.simulateFinancing(state, listing.id, {
      bankId: 'tirelire',
      durationYears: 25,
      price: listing.askingPrice - 1_000_00,
      contribution: 12_000_00,
      works: 10_000_00,
    });
    if (!sim) throw new Error('No simulation');
    expect(sim.loanAmount).toBe(sim.price + sim.works + sim.notaryFees + sim.bankFees - 12_000_00);
    expect(sim.cashAfter).toBe(state.player.balance - 12_000_00);
    expect(
      engine.simulateFinancing(state, listing.id, { bankId: 'nope', durationYears: 20 }),
    ).toBeNull();
  });
});

describe('cash-flow outlook (progression, step 3)', () => {
  it('finances the listing with the account bank and finds the price that pays for itself', () => {
    const state = newGame();
    const listing = affordableListing(state);
    const outlook = engine.cashFlowOutlook(state, listing.id);
    if (!outlook) throw new Error('No outlook');
    const years = content.yvon.thresholds.outlookYears;
    const sim = engine.simulateFinancing(state, listing.id, {
      bankId: content.start.accountBankId,
      durationYears: years,
    });
    expect(outlook.monthly).toBe(sim?.netEffort);
    const margin = content.yvon.thresholds.cashFlowEuros * 100;
    expect(outlook.tone).toBe(
      outlook.monthly >= margin ? 'positive' : outlook.monthly <= -margin ? 'negative' : 'balanced',
    );
    // At the break-even price the flat pays for itself; 2 000 € more and it no longer does.
    const breakEven = outlook.breakEvenPrice;
    if (breakEven === null) throw new Error('No break-even price');
    expect(breakEven % 1_000_00).toBe(0);
    expect(engine.cashFlowOutlook(state, listing.id, breakEven)?.monthly).toBeGreaterThanOrEqual(0);
    expect(engine.cashFlowOutlook(state, listing.id, breakEven + 2_000_00)?.monthly).toBeLessThan(
      0,
    );
    // A lower offer costs less each month.
    const lower = engine.cashFlowOutlook(state, listing.id, listing.askingPrice - 10_000_00);
    expect(lower?.monthly).toBeGreaterThan(outlook.monthly);
    expect(engine.cashFlowOutlook(state, 'nope')).toBeNull();
  });
});

describe('deal verdict (game feel, lot 3)', () => {
  it('compares the asking price with the estimate the player can make', () => {
    const state = newGame();
    const { bargainShare, expensiveShare } = content.market.verdict;
    let kinds = 0;
    for (const listing of state.listings) {
      const verdict = engine.dealVerdict(state, listing.id);
      if (!verdict) throw new Error('No verdict');
      const estimate = engine.estimate(state, listing.id)?.estimate ?? 0;
      expect(verdict.priceGap).toBeCloseTo(listing.askingPrice / estimate - 1, 10);
      const expected =
        verdict.priceGap <= -bargainShare
          ? 'bargain'
          : verdict.priceGap >= expensiveShare
            ? 'expensive'
            : 'fair';
      expect(verdict.kind).toBe(expected);
      kinds |= verdict.kind === 'bargain' ? 1 : verdict.kind === 'fair' ? 2 : 4;
    }
    // The market of a new game offers some of each.
    expect(kinds).toBe(7);
    expect(engine.dealVerdict(state, 'nope')).toBeNull();
  });

  it('follows the asking price and never looks at hidden defects', () => {
    const state = newGame();
    const listing = affordableListing(state);
    const estimate = engine.estimate(state, listing.id)?.estimate ?? 0;
    const at = (askingPrice: number) =>
      engine.dealVerdict(
        {
          ...state,
          listings: state.listings.map((l) => (l.id === listing.id ? { ...l, askingPrice } : l)),
        },
        listing.id,
      )?.kind;
    expect(at(Math.round(estimate * 0.85))).toBe('bargain');
    expect(at(estimate)).toBe('fair');
    expect(at(Math.round(estimate * 1.15))).toBe('expensive');
    // Hidden defects stay secret: a listing that has some reads like one that has none.
    const flawed = state.listings.find((l) => l.property.defects.some((d) => !d.revealed));
    if (!flawed) throw new Error('No listing with a hidden defect');
    const flawless = {
      ...state,
      listings: state.listings.map((l) =>
        l.id === flawed.id ? { ...l, property: { ...l.property, defects: [] } } : l,
      ),
    };
    expect(engine.dealVerdict(flawless, flawed.id)).toEqual(engine.dealVerdict(state, flawed.id));
  });
});

describe('cash forecast', () => {
  it('follows the monthly flows of the household', () => {
    const state = newGame();
    const forecast = engine.cashForecast(state, 40);
    // A fonctionnaire saves a little each month: no alert.
    expect(forecast.lowest).toBe(state.player.balance);
    expect(forecast.endBalance).toBeGreaterThan(state.player.balance);
    // The forecast of the 1st matches the statement.
    const next = advanceToNextMonth(state).state;
    expect(forecast.endBalance - state.player.balance).toBe(
      next.player.balance - state.player.balance,
    );
  });

  it('raises a cash alert when a deed cannot be paid', () => {
    const start = newGame();
    const today = toDayNumber(start.clock.date);
    // A purchase paid cash in ten days, far beyond the savings.
    const listing = affordableListing(start);
    const state: GameState = {
      ...start,
      purchases: [
        {
          id: 'purchase-x',
          holder: 'player',
          listingId: listing.id,
          property: listing.property,
          price: listing.askingPrice,
          deposit: 0,
          signedDay: today,
          loanDeadlineDay: today + 5,
          deedDay: today + 10,
          applications: [],
          acceptedApplicationId: null,
          cash: true,
        },
      ],
    };
    const forecast = engine.cashForecast(state);
    expect(forecast.lowest).toBeLessThan(0);
    expect(forecast.lowestDay).toBe(today + 10);
    const kinds = engine.pendingDecisions(state).map((d) => d.kind);
    expect(kinds).toContain('cashAlert');
    expect(kinds).toContain('deedFunds');
  });
});

describe('map position', () => {
  it('puts a pin inside its neighbourhood, always at the same place', () => {
    const state = newGame();
    for (const listing of state.listings.slice(0, 10)) {
      const point = engine.mapPosition(state, listing.id);
      expect(point).not.toBeNull();
      expect(engine.mapPosition(state, listing.id)).toEqual(point);
    }
    expect(engine.mapPosition(state, 'nowhere')).toBeNull();
  });
});

describe('interface data in the state', () => {
  it('keeps favourites until the listing goes', () => {
    let state = newGame();
    const listing = affordableListing(state);
    state = act(state, { type: 'market/favorite', listingId: listing.id, favorite: true }).state;
    state = act(state, { type: 'market/favorite', listingId: listing.id, favorite: true }).state;
    expect(state.favorites).toEqual([listing.id]);
    state = act(state, { type: 'market/favorite', listingId: listing.id, favorite: false }).state;
    expect(state.favorites).toEqual([]);
    expect(
      engine.dispatch(state, { type: 'market/favorite', listingId: 'x', favorite: true }).ok,
    ).toBe(false);
    // Bought: the listing leaves the market and the favourites.
    state = act(state, { type: 'market/favorite', listingId: listing.id, favorite: true }).state;
    state = act(state, {
      type: 'market/offer',
      listingId: listing.id,
      amount: listing.askingPrice,
    }).state;
    state = advanceUntil(state, (e) => e.type === 'compromisSigned').state;
    expect(state.favorites).toEqual([]);
  });

  it('stores the tutorial step and the monthly history', () => {
    let state = newGame({ name: '  Thibaud  ', avatar: { face: 1, hair: 2, skin: 3, outfit: 0 } });
    expect(state.player.name).toBe('Thibaud');
    expect(state.tutorial).toEqual({ enabled: true, step: 0 });
    expect(newGame({ name: '' }).player.name).toBe(content.start.defaultPlayerName);
    expect(newGame({ tutorial: false }).tutorial.enabled).toBe(false);
    state = act(state, { type: 'tutorial/set', step: 3 }).state;
    state = act(state, { type: 'tutorial/set', enabled: false }).state;
    expect(state.tutorial).toEqual({ enabled: false, step: 3 });
    expect(engine.dispatch(state, { type: 'tutorial/set', step: -1 }).ok).toBe(false);
    expect(state.history).toHaveLength(1);
    const next = advanceToNextMonth(state).state;
    expect(next.history).toHaveLength(2);
    expect(next.history[1]).toMatchObject({
      date: next.clock.date,
      balance: next.player.balance,
      netWorth: engine.netWorth(next),
      cashFlow: next.player.balance - state.player.balance,
    });
    expect(next.lastStatement?.date).toEqual(next.clock.date);
  });
});

describe('listing view and portfolio', () => {
  it('compares a listing with its neighbourhood', () => {
    const state = newGame();
    const listing = affordableListing(state);
    const view = engine.listingView(state, listing.id);
    if (!view) throw new Error('No view');
    expect(view.pricePerM2).toBe(Math.round(listing.askingPrice / listing.property.surface));
    expect(view.neighbourhoodPricePerM2).toBeGreaterThan(0);
    expect(view.priceGap).toBeCloseTo(view.pricePerM2 / view.neighbourhoodPricePerM2 - 1, 10);
    expect(view.rent).toBe(engine.rentQuote(state, listing.id, 'bare')?.market);
    expect(view.grossYieldPercent).toBeCloseTo((view.rent * 1200) / listing.askingPrice, 10);
    expect(view.estimate).toEqual(engine.estimate(state, listing.id));
    expect(view.totalItems).toBe(listing.property.items.length);
    expect(view.valueGap).toBeCloseTo(view.estimate.estimate / listing.askingPrice - 1, 10);
    expect(engine.listingView(state, 'gone')).toBeNull();
    // The neighbourhood's price on the map is the listing's reference.
    const markets = engine.neighbourhoodMarkets(state, 'dole');
    expect(markets).toHaveLength(content.cities.dole?.neighbourhoods.length ?? 0);
    if (listing.property.kind === 'apartment') {
      const market = markets.find((m) => m.neighbourhoodId === listing.property.neighbourhoodId);
      expect(market?.pricePerM2).toBe(view.neighbourhoodPricePerM2);
    }
  });

  it('sums the properties and debts', () => {
    const start = newGame();
    const empty = engine.portfolio(start);
    expect(empty).toMatchObject({
      netWorth: start.player.balance,
      balance: start.player.balance,
      propertiesValue: 0,
      debt: 0,
      propertiesCashFlow: 0,
      properties: [],
    });
    const { state, event } = buyWithLoan(start, affordableListing(start).id);
    if (event.type !== 'deedSigned') throw new Error('Not bought');
    const summary = engine.portfolio(state);
    expect(summary.netWorth).toBe(engine.netWorth(state));
    expect(summary.debt).toBe(state.loans[0]?.remaining);
    expect(summary.properties).toHaveLength(1);
    expect(summary.properties[0]).toMatchObject({ propertyId: event.propertyId, status: 'vacant' });
    expect(summary.propertiesValue).toBe(engine.estimate(state, event.propertyId)?.estimate);
    // The next statement: the household and the property, loan included.
    const next = advanceToNextMonth(state).state;
    expect(summary.monthlyBudget).toBe(next.player.balance - state.player.balance);
  });
});
