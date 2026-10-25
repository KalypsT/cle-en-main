import { describe, expect, it } from 'vitest';
import {
  act,
  advanceUntil,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
} from '../../test/helpers.ts';
import type { GameState } from '../state.ts';

function owner(): { state: GameState; propertyId: string } {
  const start = newGame({ seed: 99 });
  const listing = affordableListing(start);
  const { state } = buyWithLoan(start, listing.id);
  return { state, propertyId: listing.property.id };
}

describe('resale', () => {
  it('sells through an agency, repays the loan and pays the fees', () => {
    const { state, propertyId } = owner();
    const value = engine.realValue(state, propertyId)?.value ?? 0;
    let current = act(state, {
      type: 'sale/list',
      propertyId,
      askingPrice: value,
      mode: 'agency',
    }).state;
    const received = advanceUntil(current, (e) => e.type === 'saleOfferReceived', 200);
    if (received.event.type !== 'saleOfferReceived') return;
    expect(received.event.amount).toBeLessThanOrEqual(value);
    current = act(received.state, {
      type: 'sale/acceptOffer',
      propertyId,
      offerId: received.event.offerId,
    }).state;
    const loan = current.loans.find((l) => l.propertyId === propertyId);
    expect(loan).toBeDefined();
    const closed = advanceUntil(
      current,
      (e) => e.type === 'propertySold' || e.type === 'saleFellThrough',
      content.market.resale.deedDelayDays + 2,
    );
    if (closed.event.type === 'saleFellThrough') {
      expect(closed.state.properties[0]?.sale?.agreement).toBeNull();
      return;
    }
    if (closed.event.type !== 'propertySold') throw new Error('unreachable');
    const { price, agencyFees, loanRepaid, loanFees, net } = closed.event;
    expect(agencyFees).toBe(Math.round(price * content.market.resale.agencyFeeShare));
    expect(loanRepaid).toBeGreaterThan(0);
    expect(loanFees).toBeGreaterThan(0);
    // The penalty of an early repayment of the whole loan (docs/03-systemes/02).
    const rules = content.credit.earlyRepayment;
    const rate = loan?.ratePercent ?? 0;
    expect(loanFees).toBe(
      Math.round(
        Math.min(
          loanRepaid * rules.penaltyShareOfAmount,
          ((loanRepaid * rate) / 100 / 12) * rules.penaltyInterestMonths,
        ),
      ),
    );
    expect(net).toBe(price - agencyFees - loanRepaid - loanFees);
    expect(closed.state.properties).toEqual([]);
    expect(closed.state.loans.some((l) => l.propertyId === propertyId)).toBe(false);
    // Kept among the properties sold, with its history; its loan among the closed ones.
    const owned = current.properties[0];
    expect(closed.state.soldProperties).toEqual([
      expect.objectContaining({
        forced: false,
        price,
        agencyFees,
        net,
        gain: closed.event.gain,
        purchasePrice: owned?.purchasePrice,
        log: owned?.log,
        // The curve went on until the deed.
        valueHistory: expect.arrayContaining(owned?.valueHistory ?? []),
        property: expect.objectContaining({ id: propertyId }),
      }),
    ]);
    expect(closed.state.closedLoans).toEqual([
      expect.objectContaining({
        id: loan?.id,
        reason: 'sold',
        remaining: loanRepaid,
        fees: loanFees,
        subject: expect.objectContaining({ propertyId }),
      }),
    ]);
  });

  it('gets fewer visits when overpriced, and self-selling costs free time', () => {
    const { state, propertyId } = owner();
    const value = engine.realValue(state, propertyId)?.value ?? 0;
    const count = (askingPrice: number, mode: 'agency' | 'self') => {
      let current = act(state, { type: 'sale/list', propertyId, askingPrice, mode }).state;
      let visits = 0;
      for (let day = 0; day < 600; day++) {
        const result = engine.advanceHours(current, 24);
        current = result.state;
        visits += result.events.filter((e) => e.type === 'saleVisit').length;
        // Keep the property on the market: decline every offer.
        for (const offer of current.properties[0]?.sale?.offers ?? []) {
          current = act(current, { type: 'sale/rejectOffer', propertyId, offerId: offer.id }).state;
        }
      }
      return visits;
    };
    expect(count(value, 'agency')).toBeGreaterThan(count(Math.round(value * 1.3), 'agency'));
    expect(count(value, 'agency')).toBeGreaterThan(count(value, 'self'));
    // Long enough (600 days) for the agency's extra visits to show whatever the draws.
  }, 30_000);

  it('accepts a counter-offer within the buyer’s margin', () => {
    const { state, propertyId } = owner();
    const value = engine.realValue(state, propertyId)?.value ?? 0;
    const listed = act(state, {
      type: 'sale/list',
      propertyId,
      askingPrice: value,
      mode: 'agency',
    }).state;
    const received = advanceUntil(listed, (e) => e.type === 'saleOfferReceived', 200);
    const { event } = received;
    if (event.type !== 'saleOfferReceived') return;
    const offer = received.state.properties[0]?.sale?.offers.find((o) => o.id === event.offerId);
    if (!offer) throw new Error('No offer');
    const countered = act(received.state, {
      type: 'sale/counterOffer',
      propertyId,
      offerId: offer.id,
      amount: offer.buyerMax,
    }).state;
    const answer = advanceUntil(
      countered,
      (e) => e.type === 'saleCounterAccepted' || e.type === 'saleCounterRefused',
      2,
    );
    expect(answer.event.type).toBe('saleCounterAccepted');
    expect(answer.state.properties[0]?.sale?.agreement?.price).toBe(offer.buyerMax);
  });

  it('validates sale actions', () => {
    const { state, propertyId } = owner();
    const code = (action: Parameters<typeof engine.dispatch>[1], s = state) => {
      const result = engine.dispatch(s, action);
      return result.ok ? null : result.reason.code;
    };
    expect(code({ type: 'sale/list', propertyId: 'nope', askingPrice: 1, mode: 'self' })).toBe(
      'property.unknown',
    );
    expect(code({ type: 'sale/list', propertyId, askingPrice: 0, mode: 'self' })).toBe(
      'sale.invalidPrice',
    );
    expect(code({ type: 'sale/withdraw', propertyId })).toBe('sale.notListed');
    const listed = act(state, {
      type: 'sale/list',
      propertyId,
      askingPrice: 10_000_000,
      mode: 'self',
    }).state;
    expect(code({ type: 'sale/list', propertyId, askingPrice: 1, mode: 'self' }, listed)).toBe(
      'sale.alreadyListed',
    );
    expect(
      act(listed, { type: 'sale/update', propertyId, askingPrice: 9_000_000 }).state.properties[0]
        ?.sale?.askingPrice,
    ).toBe(9_000_000);
    expect(act(listed, { type: 'sale/withdraw', propertyId }).state.properties[0]?.sale).toBeNull();
  });
});
