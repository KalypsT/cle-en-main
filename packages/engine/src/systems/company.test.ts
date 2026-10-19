import { describe, expect, it } from 'vitest';
import {
  act,
  advanceUntil,
  affordableListing,
  content,
  engine,
  newGame,
  sampleOwned,
  systemContext,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { toCents } from '../money.ts';
import type { GameState } from '../state.ts';
import {
  debtRatio,
  evaluateLoan,
  grantLoan,
  type LoanRequest,
  requiredContribution,
} from './banking.ts';
import { companyDebt, potentialRent } from './company.ts';
import { bestTax, companyAccountantFees, type TaxInput } from './taxes.ts';

function withCompany(state: GameState): GameState {
  return act(state, { type: 'company/create' }).state;
}

/** A request through the SCI for a listing at its asking price, the contribution required. */
function companyRequest(state: GameState, listingId: string, bankId = 'tirelire'): LoanRequest {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error('Unknown listing');
  const price = listing.askingPrice;
  const contribution =
    requiredContribution(content, price) +
    Math.round(price * content.company.credit.extraContributionShare);
  return {
    bankId,
    amount: price + requiredContribution(content, price) - contribution,
    durationYears: 25,
    price,
    works: 0,
    contribution,
    holder: 'company',
    propertyId: listingId,
  };
}

describe('SCI (docs/03-systemes/06, milestone 8)', () => {
  it('is created once, for its cost', () => {
    const state = newGame();
    const created = act(state, { type: 'company/create' });
    expect(created.state.company).toEqual({ createdDay: toDayNumber(state.clock.date) });
    expect(created.state.player.balance).toBe(
      state.player.balance - toCents(content.company.creationCost),
    );
    expect(created.events).toContainEqual({
      type: 'companyCreated',
      cost: toCents(content.company.creationCost),
    });
    const again = engine.dispatch(created.state, { type: 'company/create' });
    expect(again.ok ? null : again.reason.code).toBe('company.exists');
  });

  it('lends on the property’s own rent, not on the player’s debt ratio', () => {
    const state = withCompany(newGame());
    const listing = affordableListing(state, 60_000);
    // No SCI loan without the SCI, nor from a bank that does not lend to companies.
    expect(evaluateLoan(content, newGame(), companyRequest(state, listing.id))).toMatchObject({
      decision: 'refused',
      reason: 'noCompany',
    });
    expect(
      evaluateLoan(content, state, companyRequest(state, listing.id, 'zeroPapier')),
    ).toMatchObject({ decision: 'refused', reason: 'companyNotServed' });
    // The contribution asks 10 % of the price beyond the fees.
    const short = { ...companyRequest(state, listing.id) };
    short.contribution -= 100_00;
    expect(evaluateLoan(content, state, short)).toMatchObject({
      decision: 'refused',
      reason: 'insufficientContribution',
    });
    const request = companyRequest(state, listing.id);
    const decision = evaluateLoan(content, state, request);
    if (decision.decision === 'refused') throw new Error(`refused: ${decision.reason}`);
    const rent = potentialRent(content, state, listing.property, false);
    const counted = Math.round(rent * content.company.credit.rentCoverageShare);
    expect(decision.offer.monthlyPayment).toBeLessThanOrEqual(counted);
    expect(decision.offer.rentCoverage).toBeCloseTo(counted / decision.offer.monthlyPayment, 6);
    // The player's own debt ratio does not move.
    expect(decision.offer.debtRatioAfter).toBe(debtRatio(content, state));
  });

  it('refuses when the rent cannot cover the payment, or the SCI owes too much', () => {
    const state = withCompany(newGame());
    // Rich enough for the leverage ceiling not to matter at first.
    state.player.balance += 500_000_00;
    const listing = affordableListing(state, 60_000);
    // Twice the price lent: the rent no longer covers the payment, even over 25 years.
    const request = { ...companyRequest(state, listing.id), price: listing.askingPrice * 4 };
    request.contribution =
      requiredContribution(content, request.price) +
      Math.round(request.price * content.company.credit.extraContributionShare);
    request.amount =
      request.price + requiredContribution(content, request.price) - request.contribution;
    const decision = evaluateLoan(content, state, request);
    expect(['partial', 'refused']).toContain(decision.decision);
    if (decision.decision === 'refused') expect(decision.reason).toBe('rentCoverage');
    // Debts beyond 6 times the net worth: refused whatever the rent.
    const ctx = systemContext(state);
    const owned = sampleOwned(ctx.today);
    owned.holder = 'company';
    ctx.state.properties.push(owned);
    const net = engine.netWorth(ctx.state);
    const big = evaluateLoan(content, ctx.state, request);
    grantLoan(
      ctx,
      { ...(big.decision === 'refused' ? fakeOffer() : big.offer), amount: net * 6 },
      owned.property.id,
    );
    expect(companyDebt(ctx.state)).toBeGreaterThan(0);
    expect(evaluateLoan(content, ctx.state, companyRequest(ctx.state, listing.id))).toMatchObject({
      decision: 'refused',
      reason: 'leverage',
    });
  });

  it('buys through the SCI: chosen before the loan, only bare lets, never the home', () => {
    const start = withCompany(newGame({ seed: 99 }));
    const listing = affordableListing(start);
    let state = act(start, {
      type: 'market/offer',
      listingId: listing.id,
      amount: listing.askingPrice,
    }).state;
    state = advanceUntil(state, (e) => e.type === 'compromisSigned').state;
    const purchase = state.purchases[0];
    if (!purchase) throw new Error('No compromis');
    state = act(state, {
      type: 'purchase/setHolder',
      purchaseId: purchase.id,
      holder: 'company',
    }).state;
    expect(state.purchases[0]?.holder).toBe('company');
    state = act(state, { type: 'purchase/payCash', purchaseId: purchase.id }).state;
    const late = engine.dispatch(state, {
      type: 'purchase/setHolder',
      purchaseId: purchase.id,
      holder: 'player',
    });
    expect(late.ok ? null : late.reason.code).toBe('purchase.applicationsMade');
    state.player.balance += purchase.price * 2;
    state = advanceUntil(state, (e) => e.type === 'deedSigned').state;
    const owned = state.properties.find((o) => o.property.id === purchase.property.id);
    expect(owned?.holder).toBe('company');
    const furnished = engine.dispatch(state, {
      type: 'rent/list',
      propertyId: purchase.property.id,
      leaseType: 'furnished',
      monthlyRent: 500_00,
      agencyId: null,
      insured: false,
    });
    expect(furnished.ok ? null : furnished.reason.code).toBe('company.leaseType');
    const home = engine.dispatch(state, { type: 'home/moveIn', propertyId: purchase.property.id });
    expect(home.ok ? null : home.reason.code).toBe('company.noHome');
  });

  it('is taxed at the real regime, with its own accountant', () => {
    const base: TaxInput = {
      propertyId: 'p',
      category: 'bare',
      choice: 'auto',
      rents: 6_000_00,
      costs: 500_00,
      works: 0,
      energyRenovation: false,
      interest: 1_000_00,
      buildingDepreciation: 0,
      depreciation: 0,
      deferredDepreciation: 0,
      deficitCarry: 0,
    };
    // In one's own name, the micro regime wins here; through the SCI, only the real one.
    const own = bestTax(content, 2027, 24_000_00, [], [base]);
    expect(own.assessment.properties[0]).toMatchObject({ regime: 'micro' });
    const sci = bestTax(content, 2027, 24_000_00, [], [{ ...base, company: true }]);
    expect(sci.assessment.properties[0]).toMatchObject({ regime: 'real' });
    // The SCI's accountant is not the personal one.
    expect(sci.assessment.accountantFees).toBe(0);
    const state = withCompany(newGame());
    expect(companyAccountantFees(content, state)).toBe(
      toCents(content.company.accountantFees.first),
    );
    expect(companyAccountantFees(content, newGame())).toBe(0);
  });
});

function fakeOffer() {
  return {
    bankId: 'tirelire',
    amount: 0,
    durationYears: 25,
    ratePercent: 4,
    rate: {
      marketPercent: 3.65,
      durationSpreadPercent: 0,
      insurancePercent: 0.3,
      bankMarginPercent: 0,
      profilePercent: 0,
      trustPercent: 0,
      reputationPercent: 0,
      ratePercent: 4,
    },
    monthlyPayment: 0,
    totalCost: 0,
    debtRatioAfter: 0,
    rentCoverage: null,
  };
}
