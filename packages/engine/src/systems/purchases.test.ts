import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  advanceUntil,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
} from '../../test/helpers.ts';
import type { GameState } from '../state.ts';

function underCompromis(state: GameState = newGame()) {
  const listing = affordableListing(state);
  const offered = act(state, {
    type: 'market/offer',
    listingId: listing.id,
    amount: listing.askingPrice,
  });
  const signed = advanceUntil(offered.state, (e) => e.type === 'compromisSigned', 3);
  const purchase = signed.state.purchases[0];
  if (!purchase) throw new Error('No compromis');
  return { state: signed.state, purchase, listing };
}

describe('purchase', () => {
  it('goes from offer to deed with a loan', () => {
    const start = newGame();
    const listing = affordableListing(start);
    const balanceBefore = start.player.balance;
    const { state, event, purchase } = buyWithLoan(start, listing.id);
    expect(event.type).toBe('deedSigned');
    if (event.type !== 'deedSigned') return;
    const owned = state.properties[0];
    expect(owned?.property.id).toBe(listing.property.id);
    expect(owned?.property.defects.every((d) => d.revealed)).toBe(true);
    const loan = state.loans[0];
    expect(loan?.propertyId).toBe(listing.property.id);
    expect(loan?.principal).toBe(purchase.price);
    // Paid from savings: notary and bank fees (the loan covers the price).
    const fees = event.notaryFees + event.bankFees;
    expect(event.notaryFees).toBe(Math.round(purchase.price * content.credit.notaryFeesShare));
    expect(event.bankFees).toBe(Math.round(purchase.price * content.credit.bankFeesShare));
    expect(owned?.acquisitionCost).toBe(purchase.price + fees);
    // Salary, rent and living costs flowed meanwhile: compare through net worth.
    expect(state.player.balance).toBeLessThan(balanceBefore);
    const value = engine.realValue(state, listing.property.id)?.value ?? 0;
    expect(engine.netWorth(state)).toBe(state.player.balance + value - (loan?.remaining ?? 0));
  });

  it('answers immediately at ZéroPapier and slowly elsewhere', () => {
    const { state, purchase } = underCompromis();
    const request = (bankId: string) =>
      act(state, {
        type: 'purchase/requestLoan',
        purchaseId: purchase.id,
        bankId,
        amount: purchase.price,
        durationYears: 20,
      });
    const neo = request('zeroPapier');
    expect(neo.events).toContainEqual(
      expect.objectContaining({ type: 'loanAnswered', bankId: 'zeroPapier' }),
    );
    const tirelire = request('tirelire');
    expect(tirelire.events.some((e) => e.type === 'loanAnswered')).toBe(false);
    expect(tirelire.state.purchases[0]?.applications[0]?.responseDay).toBeGreaterThan(
      purchase.signedDay,
    );
  });

  it('is cancelled without penalty when no loan is chosen in time', () => {
    const { state, purchase } = underCompromis();
    const balance = state.player.balance;
    const { state: after, event } = advanceUntil(state, (e) => e.type === 'purchaseCancelled', 30);
    expect(event).toMatchObject({ reason: 'noLoan', depositRefunded: purchase.deposit });
    expect(after.purchases).toEqual([]);
    // Deposit back; monthly flows may have happened meanwhile.
    expect(after.player.balance).toBeGreaterThan(balance - 300_000);
  });

  it('refunds the deposit on withdrawal during the loan condition only', () => {
    const { state, purchase } = underCompromis();
    const withdrawn = act(state, { type: 'purchase/withdraw', purchaseId: purchase.id });
    expect(withdrawn.state.player.balance).toBe(state.player.balance + purchase.deposit);
    const cash = act(state, { type: 'purchase/payCash', purchaseId: purchase.id }).state;
    const refused = engine.dispatch(cash, { type: 'purchase/withdraw', purchaseId: purchase.id });
    expect(refused.ok ? null : refused.reason.code).toBe('purchase.binding');
  });

  it('keeps the deposit when the buyer cannot pay at the deed', () => {
    const { state, purchase } = underCompromis();
    // Cash purchase with far too little money.
    const cash = act(state, { type: 'purchase/payCash', purchaseId: purchase.id }).state;
    const due = engine.cashDueAtDeed(cash, purchase.id) ?? 0;
    expect(due).toBeGreaterThan(cash.player.balance);
    const { event } = advanceUntil(
      cash,
      (e) => e.type === 'purchaseCancelled' || e.type === 'deedSigned',
      40,
    );
    expect(event).toMatchObject({
      type: 'purchaseCancelled',
      reason: 'fundsMissing',
      depositRefunded: 0,
    });
  });

  it('validates loan requests', () => {
    const { state, purchase } = underCompromis();
    const code = (action: Parameters<typeof engine.dispatch>[1]) => {
      const result = engine.dispatch(state, action);
      return result.ok ? null : result.reason.code;
    };
    const base = {
      type: 'purchase/requestLoan',
      purchaseId: purchase.id,
      amount: purchase.price,
      durationYears: 20,
    } as const;
    expect(code({ ...base, bankId: 'nowhere' })).toBe('bank.unknown');
    expect(code({ ...base, bankId: 'tirelire', amount: 0 })).toBe('loan.invalidAmount');
    expect(code({ ...base, purchaseId: 'nope', bankId: 'tirelire' })).toBe('purchase.unknown');
    const late = advanceDays(state, content.market.purchase.loanConditionDays).state;
    if (late.purchases[0]) {
      expect(engine.dispatch(late, { ...base, bankId: 'tirelire' }).ok).toBe(false);
    }
  });

  it('lends for the works into an envelope kept on the property, over 27 years', () => {
    const { state, purchase } = underCompromis();
    // Works of 30 % of the price: the 27-year duration is allowed.
    const works = Math.round(purchase.price * 0.3);
    let current = act(state, {
      type: 'purchase/requestLoan',
      purchaseId: purchase.id,
      bankId: 'tirelire',
      amount: purchase.price + works,
      durationYears: 27,
      works,
    }).state;
    const answered = advanceUntil(current, (e) => e.type === 'loanAnswered');
    current = answered.state;
    const application = current.purchases[0]?.applications[0];
    const decision = application?.decision;
    expect(application?.works).toBe(works);
    if (!decision || decision.decision === 'refused') throw new Error('Loan refused');
    expect(decision.offer.durationYears).toBe(27);
    current = act(current, {
      type: 'purchase/acceptLoan',
      purchaseId: purchase.id,
      applicationId: application?.id ?? '',
    }).state;
    // The works part of the loan does not pay the price.
    const due = engine.cashDueAtDeed(current, purchase.id) ?? 0;
    const lent = decision.offer.amount - Math.min(works, decision.offer.amount);
    expect(due).toBe(
      purchase.price +
        Math.round(purchase.price * content.credit.notaryFeesShare) +
        Math.round(purchase.price * content.credit.bankFeesShare) -
        purchase.deposit -
        lent,
    );
    const deed = advanceUntil(current, (e) => e.type === 'deedSigned');
    const owned = deed.state.properties[0];
    expect(owned?.worksFund?.amount).toBe(Math.min(works, decision.offer.amount));
    expect(owned?.property.items.every((item) => item.known)).toBe(true);
    // Unused, the envelope goes back to the bank after two years.
    const later = advanceDays(deed.state, 2 * 365 + 10);
    expect(later.events).toContainEqual(expect.objectContaining({ type: 'worksFundReturned' }));
    const loan = later.state.loans.find((l) => l.propertyId === owned?.property.id);
    const before = deed.state.loans.find((l) => l.propertyId === owned?.property.id);
    expect(loan?.monthlyPayment ?? 0).toBeLessThan(before?.monthlyPayment ?? 0);
  });
});
