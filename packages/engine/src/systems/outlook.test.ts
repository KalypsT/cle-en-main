import { describe, expect, it } from 'vitest';
import { advanceToNextMonth, newGame, quietContent, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { deepClone } from '../clone.ts';
import { createEngine } from '../engine.ts';
import type { GameState } from '../state.ts';
import { signedLine } from './history.ts';

const content = quietContent();
const engine = createEngine(content);

/** A game with a let flat and its loan, a statement already behind. */
function ownerWithStatement(): GameState {
  const state = deepClone(newGame({ seed: 7 }));
  const owned = sampleOwned(toDayNumber(state.clock.date));
  state.properties = [owned];
  state.loans = [
    {
      id: 'loan-sample',
      bankId: 'tirelire',
      principal: 80_000_00,
      ratePercent: 4,
      durationMonths: 240,
      monthlyPayment: 484_78,
      remaining: 80_000_00,
      paymentsMade: 0,
      interestPaid: 0,
      startDate: { ...state.clock.date },
      renegotiationSuggested: false,
      renegotiationDeclinedPercent: null,
      propertyId: owned.property.id,
    },
  ];
  return advanceToNextMonth(state).state;
}

describe('statement outlook (« Prochain bilan »)', () => {
  it('foresees the next statement line by line, the salary aside', () => {
    const state = ownerWithStatement();
    const outlook = engine.statementOutlook(state);
    const next = advanceToNextMonth(state);
    const statement = next.events.find((e) => e.type === 'monthlyStatement');
    if (statement?.type !== 'monthlyStatement') throw new Error('No statement');
    for (const line of statement.lines) {
      if (line.kind === 'salary') continue;
      const propertyId = 'propertyId' in line ? line.propertyId : null;
      const loanId = 'loanId' in line ? line.loanId : null;
      const expected = outlook.lines.find(
        (o) =>
          o.kind === line.kind &&
          (loanId ? o.loanId === loanId : (o.propertyId ?? null) === propertyId),
      );
      const real = statement.lines
        .filter(
          (other) =>
            other.kind === line.kind &&
            ('propertyId' in other ? other.propertyId : null) === propertyId &&
            ('loanId' in other ? other.loanId : null) === loanId,
        )
        .reduce((sum, other) => sum + signedLine(other), 0);
      expect(expected?.expected, line.kind).toBe(real);
    }
    // The loan's line is filed under the property it financed.
    expect(outlook.lines.find((line) => line.kind === 'loanPayment')?.propertyId).toBe(
      'property-sample',
    );
    expect(outlook.net).toBe(engine.portfolio(state).monthlyBudget);
    expect(outlook.date).toEqual({
      year: state.clock.date.month === 12 ? state.clock.date.year + 1 : state.clock.date.year,
      month: (state.clock.date.month % 12) + 1,
      day: 1,
    });
  });

  it('puts each line next to the last statement, so a change shows', () => {
    const state = ownerWithStatement();
    const before = engine.statementOutlook(state);
    const rent = before.lines.find((line) => line.kind === 'rentalIncome');
    expect(rent?.expected).toBe(rent?.last);
    expect(before.lastNet).not.toBeNull();
    const lowered = deepClone(state);
    const lease = lowered.properties[0]?.lease;
    if (!lease) throw new Error('No lease');
    lease.monthlyRent -= 50_00;
    const after = engine.statementOutlook(lowered);
    const moved = after.lines.find((line) => line.kind === 'rentalIncome');
    expect((moved?.expected ?? 0) - (moved?.last ?? 0)).toBe(-50_00);
    expect(after.net - before.net).toBe(-50_00);
  });

  it('keeps a line of the last statement that is not expected again', () => {
    const state = ownerWithStatement();
    const sold = deepClone(state);
    sold.properties = [];
    sold.loans = [];
    const outlook = engine.statementOutlook(sold);
    const rent = outlook.lines.find((line) => line.kind === 'rentalIncome');
    expect(rent?.expected).toBe(0);
    expect(rent?.last).toBeGreaterThan(0);
  });

  it('expects no rent from a tenant who stopped paying, uninsured', () => {
    const state = ownerWithStatement();
    const unpaid = deepClone(state);
    const lease = unpaid.properties[0]?.lease;
    if (!lease) throw new Error('No lease');
    lease.insured = false;
    lease.arrears = {
      amount: lease.monthlyRent,
      months: 1,
      sinceDay: 0,
      reminderFailed: true,
      procedureEndDay: null,
    };
    const line = engine.statementOutlook(unpaid).lines.find((l) => l.kind === 'rentalIncome');
    expect(line).toMatchObject({ expected: 0, note: 'unpaid' });
  });

  it('has nothing to compare with before the first statement', () => {
    const outlook = engine.statementOutlook(newGame());
    expect(outlook.lastDate).toBeNull();
    expect(outlook.lastNet).toBeNull();
    expect(outlook.lines.every((line) => line.last === null)).toBe(true);
  });
});
