import { toDayNumber } from '../calendar.ts';
import { describe, expect, it } from 'vitest';
import { act, advanceToNextMonth, content, engine, newGame } from '../../test/helpers.ts';
import { deepClone } from '../clone.ts';
import { findBank } from '../content.ts';
import type { GameEvent } from '../events.ts';
import { annuityPayment, toCents } from '../money.ts';
import type { GameState } from '../state.ts';
import {
  durationSpread,
  evaluateLoan,
  grantLoan,
  type LoanOffer,
  notaryFees,
  type LoanRequest,
  quoteRate,
  requiredContribution,
} from './banking.ts';
import type { SystemContext } from './context.ts';

const tirelire = findBank(content, 'tirelire');
if (!tirelire) throw new Error('Missing test bank');

function request(overrides: Partial<LoanRequest> = {}): LoanRequest {
  const price = toCents(90_000);
  return {
    bankId: 'tirelire',
    amount: price,
    durationYears: 25,
    price,
    works: 0,
    contribution: requiredContribution(content, price),
    ...overrides,
  };
}

function withLoan(state: GameState, offer: LoanOffer): GameState {
  const draft = deepClone(state);
  const ctx: SystemContext = { content, state: draft, events: [], today: 0 };
  grantLoan(ctx, offer);
  return draft;
}

function acceptedOffer(state: GameState, overrides: Partial<LoanRequest> = {}): LoanOffer {
  const decision = evaluateLoan(content, state, request(overrides));
  if (decision.decision !== 'accepted')
    throw new Error(`Expected acceptance, got ${decision.decision}`);
  return decision.offer;
}

describe('rates', () => {
  it('interpolates the duration spread', () => {
    expect(durationSpread(content, 20)).toBe(0);
    expect(durationSpread(content, 25)).toBeCloseTo(0.1);
    expect(durationSpread(content, 22)).toBeCloseTo(0.04);
    expect(durationSpread(content, 1)).toBe(content.credit.durationSpreadPercent['5']);
  });

  it('explains the offered rate', () => {
    const state = newGame();
    const quote = quoteRate(content, state, tirelire, 20);
    const sum =
      quote.marketPercent +
      quote.durationSpreadPercent +
      quote.insurancePercent +
      quote.bankMarginPercent +
      quote.profilePercent +
      quote.trustPercent +
      quote.reputationPercent;
    expect(quote.ratePercent).toBeCloseTo(sum, 2);
    expect(quote.marketPercent).toBe(content.marketRate.startPercent);
    expect(quote.insurancePercent).toBe(content.credit.insurancePercent);
  });

  it('lowers the margin as trust rises', () => {
    const state = newGame();
    const trusted = deepClone(state);
    const relation = trusted.banks.tirelire;
    if (relation) relation.trust = 100;
    expect(quoteRate(content, trusted, tirelire, 20).ratePercent).toBeLessThan(
      quoteRate(content, state, tirelire, 20).ratePercent,
    );
  });
});

describe('evaluateLoan', () => {
  const state = newGame();

  it('accepts a reasonable request', () => {
    const decision = evaluateLoan(content, state, request());
    expect(decision.decision).toBe('accepted');
    if (decision.decision !== 'accepted') return;
    expect(decision.offer.debtRatioAfter).toBeLessThanOrEqual(content.credit.maxDebtRatio);
    expect(decision.offer.totalCost).toBeGreaterThan(0);
  });

  it('never charges notary fees below their minimum', () => {
    const minimum = toCents(content.credit.notaryFeesMinimum);
    const flat = toCents(100_000);
    expect(notaryFees(content, flat)).toBe(Math.round(flat * content.credit.notaryFeesShare));
    // A parking: the fixed costs weigh far more than the share of its price.
    expect(notaryFees(content, toCents(9_000))).toBe(minimum);
    expect(requiredContribution(content, toCents(9_000))).toBe(
      minimum + Math.round(toCents(9_000) * content.credit.bankFeesShare),
    );
  });

  it('requires the contribution to cover the fees', () => {
    expect(evaluateLoan(content, state, request({ contribution: 0 }))).toMatchObject({
      decision: 'refused',
      reason: 'insufficientContribution',
    });
    expect(evaluateLoan(content, state, request({ amount: toCents(100_000) }))).toMatchObject({
      decision: 'refused',
      reason: 'overFinancing',
    });
  });

  it('caps the duration, longer with heavy works', () => {
    expect(evaluateLoan(content, state, request({ durationYears: 27 }))).toMatchObject({
      reason: 'invalidDuration',
    });
    const withWorks = request({
      works: toCents(20_000),
      amount: toCents(100_000),
      durationYears: 27,
    });
    expect(evaluateLoan(content, state, withWorks).decision).not.toBe('refused');
  });

  it('offers a longer duration, then a smaller amount, then refuses', () => {
    const big = toCents(130_000);
    const counter = evaluateLoan(
      content,
      state,
      request({
        price: big,
        amount: big,
        durationYears: 20,
        contribution: requiredContribution(content, big),
      }),
    );
    expect(counter.decision).toBe('counterOffer');
    if (counter.decision === 'counterOffer')
      expect(counter.offer.durationYears).toBeGreaterThan(20);

    const bigger = toCents(160_000);
    const partial = evaluateLoan(
      content,
      state,
      request({
        price: bigger,
        amount: bigger,
        contribution: requiredContribution(content, bigger),
      }),
    );
    expect(partial.decision).toBe('partial');
    if (partial.decision === 'partial') {
      expect(partial.offer.amount).toBeLessThan(bigger);
      expect(partial.offer.debtRatioAfter).toBeLessThanOrEqual(content.credit.maxDebtRatio);
    }

    const huge = toCents(400_000);
    expect(
      evaluateLoan(
        content,
        state,
        request({ price: huge, amount: huge, contribution: requiredContribution(content, huge) }),
      ),
    ).toMatchObject({
      decision: 'refused',
      reason: 'debtRatio',
    });
    // Banks without counter-proposals refuse at once.
    expect(
      evaluateLoan(
        content,
        state,
        request({
          bankId: 'zeroPapier',
          price: big,
          amount: big,
          durationYears: 20,
          contribution: requiredContribution(content, big),
        }),
      ),
    ).toMatchObject({
      decision: 'refused',
      reason: 'debtRatio',
    });
  });

  it('applies each bank policy', () => {
    const sales = newGame({ jobId: 'salesperson' });
    expect(evaluateLoan(content, sales, request({ bankId: 'rigueur' }))).toMatchObject({
      reason: 'jobProfile',
    });
    expect(evaluateLoan(content, sales, request({ bankId: 'fougueux' })).decision).toBe('accepted');
    expect(evaluateLoan(content, state, request({ bankId: 'nowhere' }))).toMatchObject({
      reason: 'unknownBank',
    });
  });

  it('freezes credit during an overdraft and without salary history', () => {
    const overdrawn = deepClone(state);
    overdrawn.player.balance = -1;
    expect(evaluateLoan(content, overdrawn, request())).toMatchObject({ reason: 'creditFrozen' });
    const resigned = engine.dispatch(state, { type: 'job/resign' });
    expect(evaluateLoan(content, resigned.state, request())).toMatchObject({
      reason: 'noIncomeHistory',
    });
  });

  it('counts existing loans in the debt ratio', () => {
    const offer = acceptedOffer(state);
    const indebted = withLoan(state, offer);
    expect(evaluateLoan(content, indebted, request()).decision).not.toBe('accepted');
  });
});

describe('loans', () => {
  it('pays the amount out, then repays it monthly down to zero', () => {
    const state = newGame();
    const offer = acceptedOffer(state, {
      amount: toCents(10_000),
      price: toCents(90_000),
      durationYears: 5,
    });
    let current = withLoan(state, offer);
    expect(current.player.balance).toBe(state.player.balance + offer.amount);
    const events: GameEvent[] = [];
    let interest = 0;
    for (let month = 0; month < 60; month++) {
      const result = advanceToNextMonth(current);
      current = result.state;
      events.push(...result.events);
      for (const event of result.events) {
        if (event.type !== 'monthlyStatement') continue;
        for (const line of event.lines) if (line.kind === 'loanPayment') interest += line.interest;
      }
    }
    expect(current.loans).toEqual([]);
    expect(events.filter((e) => e.type === 'loanRepaid')).toHaveLength(1);
    expect(Math.abs(interest - offer.totalCost)).toBeLessThan(100);
    // Kept among the closed loans, with the interest it cost.
    expect(current.closedLoans).toEqual([
      expect.objectContaining({
        bankId: offer.bankId,
        principal: offer.amount,
        reason: 'repaid',
        remaining: 0,
        fees: 0,
        paymentsMade: 60,
        replacedBy: null,
      }),
    ]);
    expect(Math.abs((current.closedLoans[0]?.interestPaid ?? 0) - interest)).toBeLessThan(100);
  });

  it('keeps a refinanced loan, with its fees and the loan that took it over', () => {
    const state = newGame();
    const offer = acceptedOffer(state, { amount: toCents(60_000) });
    const ratePercent = offer.ratePercent + 1.5;
    const monthlyPayment = annuityPayment(offer.amount, ratePercent, offer.durationYears * 12);
    const owing = withLoan(state, { ...offer, ratePercent, monthlyPayment });
    const [sheet] = engine.loanSheets(owing);
    const [loan] = owing.loans;
    const refinance = sheet?.refinance[0];
    if (!refinance || !loan) throw new Error('No refinancing');
    const result = act(owing, {
      type: 'bank/refinance',
      loanId: loan.id,
      bankId: refinance.bankId,
    });
    expect(result.state.closedLoans).toEqual([
      expect.objectContaining({
        id: loan.id,
        reason: 'refinanced',
        remaining: loan.remaining,
        fees: refinance.fees,
        replacedBy: result.state.loans[0]?.id,
      }),
    ]);
  });

  it('builds trust with payments made on time', () => {
    const state = newGame();
    const current = withLoan(state, acceptedOffer(state, { bankId: 'fougueux' }));
    const after = advanceToNextMonth(current).state;
    const rules = content.credit.trust;
    expect(after.banks.fougueux?.trust).toBeCloseTo(
      (current.banks.fougueux?.trust ?? 0) + rules.relationshipMonth + rules.onTimePayment,
    );
    // No relationship yet with Rigueur: no change.
    expect(after.banks.rigueur?.trust).toBe(current.banks.rigueur?.trust);
  });
});

describe('loan sheets', () => {
  it('tells what is repaid, the interest paid and left, and the end of a loan', () => {
    const state = newGame();
    const offer = acceptedOffer(state, {
      amount: toCents(10_000),
      price: toCents(90_000),
      durationYears: 5,
    });
    let current = withLoan(state, offer);
    const [fresh] = engine.loanSheets(current);
    expect(fresh?.repaidShare).toBe(0);
    expect(fresh?.interestPaid).toBe(0);
    expect(Math.abs((fresh?.interestLeft ?? 0) - offer.totalCost)).toBeLessThan(100);
    expect(fresh?.monthsLeft).toBe(60);
    expect(fresh?.remainingByYear).toHaveLength(6);
    const start = current.loans[0]?.startDate;
    expect(fresh?.endDate).toEqual({
      year: (start?.year ?? 0) + 5,
      month: start?.month,
      day: 1,
    });
    for (let month = 0; month < 24; month++) current = advanceToNextMonth(current).state;
    const [later] = engine.loanSheets(current);
    expect(later?.monthsLeft).toBe(36);
    expect(later?.repaidShare).toBeGreaterThan(0.3);
    expect(later?.interestPaid).toBeGreaterThan(0);
    // Paid and left add up to the cost of the loan, to rounding.
    expect(
      Math.abs((later?.interestPaid ?? 0) + (later?.interestLeft ?? 0) - offer.totalCost),
    ).toBeLessThan(200);
  });

  it('shows the cheapest bank of the day when it beats the loan rate', () => {
    const state = newGame();
    const offer = acceptedOffer(state, { amount: toCents(60_000) });
    const ratePercent = offer.ratePercent + 1.5;
    const monthlyPayment = annuityPayment(offer.amount, ratePercent, offer.durationYears * 12);
    const [sheet] = engine.loanSheets(withLoan(state, { ...offer, ratePercent, monthlyPayment }));
    const best = sheet?.refinance.at(-1);
    expect(best?.ratePercent).toBeLessThan(ratePercent);
    expect(best?.monthlyPayment).toBeLessThan(monthlyPayment);
    expect(best?.saving).toBeGreaterThan(0);
  });
});

describe('overdraft', () => {
  it('charges interest daily, lowers trust and reports it', () => {
    const state = deepClone(newGame());
    state.player.balance = -toCents(1000);
    const { state: next, events } = engine.advanceHours(state, 16 + 24);
    expect(next.player.overdraftDays).toBe(2);
    const daily = Math.round((toCents(1000) * content.credit.overdraftAnnualPercent) / 100 / 365);
    expect(next.player.balance).toBeLessThan(-toCents(1000) - daily);
    expect(next.banks.tirelire?.trust).toBe(
      (state.banks.tirelire?.trust ?? 0) + 2 * content.credit.trust.overdraftDay,
    );
    expect(events.filter((e) => e.type === 'overdraftStarted')).toHaveLength(1);

    const repaid = deepClone(next);
    repaid.player.balance = 0;
    expect(engine.advanceHours(repaid, 24).events.map((e) => e.type)).toContain('overdraftEnded');
  });
});

describe('meetings', () => {
  it('trades free time for trust, once per cooldown', () => {
    const monday = engine.advanceHours(newGame(), 16).state;
    const met = engine.dispatch(monday, { type: 'bank/meet', bankId: 'tirelire' });
    expect(met.ok).toBe(true);
    if (!met.ok) return;
    expect(met.state.banks.tirelire?.trust).toBe(
      (monday.banks.tirelire?.trust ?? 0) + content.credit.trust.meeting,
    );
    // Kept in the history of the bank, and its trust on the 1st of the next month.
    expect(met.state.banks.tirelire?.log).toEqual([
      {
        kind: 'meeting',
        day: toDayNumber(monday.clock.date),
        trust: met.state.banks.tirelire?.trust,
      },
    ]);
    const nextMonth = advanceToNextMonth(met.state).state;
    expect(nextMonth.banks.tirelire?.trustHistory).toEqual([
      { date: nextMonth.clock.date, trust: nextMonth.banks.tirelire?.trust },
    ]);
    expect(met.state.player.freeTimeMinutes).toBe(
      monday.player.freeTimeMinutes - content.credit.trust.meetingMinutes,
    );
    expect(engine.dispatch(met.state, { type: 'bank/meet', bankId: 'tirelire' })).toMatchObject({
      ok: false,
      reason: { code: 'bank.meetingTooSoon' },
    });
    expect(engine.dispatch(monday, { type: 'bank/meet', bankId: 'zeroPapier' })).toMatchObject({
      reason: { code: 'bank.noMeetings' },
    });
    // Without enough free time today, the meeting goes to the agenda (milestone 6).
    const tired = deepClone(monday);
    tired.player.freeTimeMinutes = 10;
    const planned = engine.dispatch(tired, { type: 'bank/meet', bankId: 'tirelire' });
    if (!planned.ok) throw new Error(planned.reason.code);
    expect(planned.events[0]).toMatchObject({ type: 'bankMeetingPlanned', bankId: 'tirelire' });
    const item = planned.state.agenda[0];
    expect(item).toMatchObject({ kind: 'bankMeeting', bankId: 'tirelire' });
    expect(engine.dispatch(planned.state, { type: 'bank/meet', bankId: 'tirelire' }).ok).toBe(
      false,
    );
    const until = ((item?.day ?? 0) - toDayNumber(tired.clock.date)) * 24 + 1;
    const after = engine.advanceHours(planned.state, until);
    expect(after.events.some((e) => e.type === 'bankMeetingHeld')).toBe(true);
    expect(after.state.agenda).toEqual([]);
  });
});

describe('renegotiation', () => {
  function expensiveLoan(): GameState {
    const state = newGame();
    const offer = acceptedOffer(state, { amount: toCents(60_000) });
    const ratePercent = offer.ratePercent + 1.5;
    const monthlyPayment = annuityPayment(offer.amount, ratePercent, offer.durationYears * 12);
    return withLoan(state, { ...offer, ratePercent, monthlyPayment });
  }

  it('suggests a renegotiation once when the market is well below the loan rate', () => {
    const first = advanceToNextMonth(expensiveLoan());
    expect(first.events.filter((e) => e.type === 'renegotiationAvailable')).toHaveLength(1);
    const second = advanceToNextMonth(first.state);
    expect(second.events.filter((e) => e.type === 'renegotiationAvailable')).toHaveLength(0);
  });

  it('replaces the loan by a cheaper one and charges the fees', () => {
    const state = expensiveLoan();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    const result = engine.dispatch(state, {
      type: 'bank/refinance',
      loanId: loan.id,
      bankId: 'tirelire',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const replacement = result.state.loans[0];
    expect(replacement?.ratePercent).toBeLessThan(loan.ratePercent);
    expect(replacement?.monthlyPayment).toBeLessThan(loan.monthlyPayment);
    expect(replacement?.remaining).toBe(loan.remaining);
    const fees =
      Math.round(loan.remaining * content.credit.renegotiation.feesShareOfRemaining) +
      toCents(content.credit.renegotiation.fixedFees);
    expect(result.state.player.balance).toBe(state.player.balance - fees);
  });

  it('does not suggest a renegotiation that no bank would really grant', () => {
    // Only the market's rate is low: every bank's margin and the profile keep the
    // real offers within the threshold, so the player is not told for nothing.
    const state = newGame();
    const offer = acceptedOffer(state, { amount: toCents(60_000) });
    const best = Math.min(
      ...content.banks.map(
        (bank) => quoteRate(content, state, bank, offer.durationYears).ratePercent,
      ),
    );
    const ratePercent = best + content.credit.renegotiation.thresholdPercent - 0.2;
    const monthlyPayment = annuityPayment(offer.amount, ratePercent, offer.durationYears * 12);
    const owing = withLoan(state, { ...offer, ratePercent, monthlyPayment });
    const next = advanceToNextMonth(owing);
    expect(next.events.filter((e) => e.type === 'renegotiationAvailable')).toHaveLength(0);
    expect(engine.pendingDecisions(next.state).some((d) => d.kind === 'renegotiation')).toBe(false);
  });

  it('names the bank of the offer and lists the own bank first', () => {
    const owing = expensiveLoan();
    const next = advanceToNextMonth(owing);
    const told = next.events.find((e) => e.type === 'renegotiationAvailable');
    if (told?.type !== 'renegotiationAvailable') throw new Error('Not suggested');
    const [sheet] = engine.loanSheets(next.state);
    expect(sheet?.refinance[0]).toMatchObject({ own: true, bankId: owing.loans[0]?.bankId });
    expect(sheet?.worthy).toMatchObject({ bankId: told.bankId, ratePercent: told.offerPercent });
    expect(engine.pendingDecisions(next.state)).toContainEqual(
      expect.objectContaining({ kind: 'renegotiation', bankId: told.bankId }),
    );
  });

  it('stops reminding once declined, until an offer drops further', () => {
    const suggested = advanceToNextMonth(expensiveLoan()).state;
    const loan = suggested.loans[0];
    if (!loan) throw new Error('Missing loan');
    const declined = act(suggested, { type: 'bank/declineRefinancing', loanId: loan.id }).state;
    expect(engine.pendingDecisions(declined).some((d) => d.kind === 'renegotiation')).toBe(false);
    expect(engine.loanSheets(declined)[0]?.declined).toBe(true);
    const later = advanceToNextMonth(declined);
    expect(later.events.filter((e) => e.type === 'renegotiationAvailable')).toHaveLength(0);
    // Rates fall by more than the step: the player is told again.
    const lower = deepClone(later.state);
    lower.market.ratePercent -= content.credit.renegotiation.renotifyStepPercent + 0.2;
    const again = advanceToNextMonth(lower);
    expect(again.events.filter((e) => e.type === 'renegotiationAvailable')).toHaveLength(1);
    expect(engine.pendingDecisions(again.state).some((d) => d.kind === 'renegotiation')).toBe(true);
    expect(
      engine.dispatch(newGame(), { type: 'bank/declineRefinancing', loanId: 'loan-x' }),
    ).toMatchObject({ reason: { code: 'loan.unknown' } });
  });

  it('refuses a refinancing that would not lower the rate', () => {
    const state = newGame();
    const current = withLoan(state, acceptedOffer(state, { bankId: 'rigueur' }));
    const loan = current.loans[0];
    if (!loan) throw new Error('Missing loan');
    expect(
      engine.dispatch(current, { type: 'bank/refinance', loanId: loan.id, bankId: 'fougueux' }),
    ).toMatchObject({
      reason: { code: 'loan.notWorthRefinancing' },
    });
    expect(
      engine.dispatch(current, { type: 'bank/refinance', loanId: 'loan-x', bankId: 'tirelire' }),
    ).toMatchObject({
      reason: { code: 'loan.unknown' },
    });
  });
});

describe('early repayment', () => {
  function owing(): GameState {
    const state = deepClone(newGame());
    state.player.balance = toCents(50_000);
    return withLoan(state, acceptedOffer(state, { amount: toCents(60_000) }));
  }

  it('caps the penalty at the lower of 3 % and six months of interest', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    const rules = content.credit.earlyRepayment;
    const amount = toCents(10_000);
    const expected = Math.round(
      Math.min(
        amount * rules.penaltyShareOfAmount,
        ((amount * loan.ratePercent) / 100 / 12) * rules.penaltyInterestMonths,
      ),
    );
    expect(engine.previewPrepayment(state, loan.id, amount, 'payment')?.fees).toBe(expected);
  });

  it('lowers the payment and keeps the end of the loan', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    const amount = toCents(10_000);
    const preview = engine.previewPrepayment(state, loan.id, amount, 'payment');
    if (!preview) throw new Error('No preview');
    expect(preview.refusal).toBeNull();
    const result = act(state, { type: 'bank/prepay', loanId: loan.id, amount, mode: 'payment' });
    const after = result.state.loans[0];
    expect(after?.remaining).toBe(loan.remaining - amount);
    expect(after?.monthlyPayment).toBe(preview.monthlyPayment);
    expect(after?.monthlyPayment).toBeLessThan(loan.monthlyPayment);
    expect(after?.durationMonths).toBe(loan.durationMonths);
    expect(result.state.player.balance).toBe(state.player.balance - amount - preview.fees);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'loanPrepaid', amount, fees: preview.fees, full: false }),
    );
  });

  it('keeps the payment and shortens the loan', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    const amount = toCents(20_000);
    const preview = engine.previewPrepayment(state, loan.id, amount, 'duration');
    const payment = engine.previewPrepayment(state, loan.id, amount, 'payment');
    if (!preview || !payment) throw new Error('No preview');
    // Shorter, and saves more interest than a lower payment.
    expect(preview.monthsLeft).toBeLessThan(loan.durationMonths);
    expect(preview.interestSaved).toBeGreaterThan(payment.interestSaved);
    const after = act(state, { type: 'bank/prepay', loanId: loan.id, amount, mode: 'duration' })
      .state.loans[0];
    expect(after?.monthlyPayment).toBe(loan.monthlyPayment);
    expect(after?.durationMonths).toBe(preview.monthsLeft);
    expect(engine.loanSheets({ ...state, loans: after ? [after] : [] })[0]?.endDate).toEqual(
      preview.endDate,
    );
  });

  it('ends the loan when everything is repaid, and keeps its penalty', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    const result = act(state, {
      type: 'bank/prepay',
      loanId: loan.id,
      amount: loan.remaining + toCents(5_000),
      mode: 'payment',
    });
    const fees = engine.previewPrepayment(state, loan.id, loan.remaining, 'payment')?.fees ?? -1;
    expect(result.state.loans).toEqual([]);
    expect(result.state.player.balance).toBe(state.player.balance - loan.remaining - fees);
    expect(result.events.some((e) => e.type === 'loanRepaid')).toBe(true);
    expect(result.state.closedLoans).toEqual([
      expect.objectContaining({ id: loan.id, reason: 'repaid', fees, remaining: loan.remaining }),
    ]);
  });

  it('refuses a repayment too small or above the cash', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    expect(
      engine.dispatch(state, {
        type: 'bank/prepay',
        loanId: loan.id,
        amount: 100,
        mode: 'payment',
      }),
    ).toMatchObject({ reason: { code: 'loan.prepaymentTooSmall' } });
    const poor = { ...state, player: { ...state.player, balance: toCents(2_000) } };
    expect(
      engine.dispatch(poor, {
        type: 'bank/prepay',
        loanId: loan.id,
        amount: toCents(5_000),
        mode: 'payment',
      }),
    ).toMatchObject({ reason: { code: 'account.insufficientFunds' } });
  });

  it('counts the interest really paid after an early repayment', () => {
    const state = owing();
    const loan = state.loans[0];
    if (!loan) throw new Error('Missing loan');
    let current = act(state, {
      type: 'bank/prepay',
      loanId: loan.id,
      amount: toCents(10_000),
      mode: 'payment',
    }).state;
    let interest = 0;
    for (let month = 0; month < 3; month++) {
      const next = advanceToNextMonth(current);
      current = next.state;
      for (const event of next.events) {
        if (event.type !== 'monthlyStatement') continue;
        for (const line of event.lines) if (line.kind === 'loanPayment') interest += line.interest;
      }
    }
    expect(current.loans[0]?.interestPaid).toBe(interest);
  });
});
