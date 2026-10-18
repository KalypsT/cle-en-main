import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/engine.ts';
import type { GameEvent, StatementLine } from '../src/events.ts';
import { annuityPayment } from '../src/money.ts';
import type { GameState, OwnedProperty } from '../src/state.ts';
import { toDayNumber } from '../src/calendar.ts';
import { quietContent } from './helpers.ts';

/**
 * Milestone 2 acceptance test (docs/09): the cash flow of one property must
 * match a realistic calculation made by hand.
 *
 * A T2 of 45 m² in Dole, bought 80 000 € (plus 6 000 € of notary fees and
 * 800 € of bank fees), entirely borrowed at 3,95 % over 20 years. A
 * fonctionnaire (2 000 € net a month) lets it bare, manages it himself, with
 * no unpaid-rent insurance, for 520 € a month excluding charges. Chance is
 * switched off (no incident, unpaid rent, departure or life event) so that the
 * year can be computed by hand.
 *
 * Every month:
 *   + 520,00 € rent
 *   +  69,30 € recoverable charges (70 % of 99 €)
 *   −  99,00 € co-ownership charges (45 m² × 2,20 €)
 *   −  12,29 € landlord insurance (80 € + 1,50 € × 45 m², a year, ÷ 12)
 *   − 482,68 € loan payment (annuity of 80 000 € at 3,95 % over 240 months, rounded up)
 *   =  −4,67 € a month, −56,04 € over the year;
 * and on 15 October − 585 € of property tax (45 m² × 13 €): −641,04 € before tax.
 *
 * Tax of the year, assessed on 1 January:
 *   interest paid in the year: 12 × 482,68 − capital repaid ≈ 3 111,8 €;
 *   micro-foncier: 6 240 × 70 % = 4 368 € taxable;
 *   real regime: 6 240 − 356,40 (charges not recovered) − 585 (property tax)
 *     − 147,48 (insurance) − 300 (accountant) − 3 111,8 (interest) ≈ 1 739,3 €;
 *   the real regime wins: 1 739,3 × (11 % marginal rate + 17,2 % social
 *   contributions) ≈ 490,5 €, paid in 12 instalments of ≈ 40,87 €, plus the
 *   accountant's 300 € (against 4 368 × 28,2 % = 1 231,8 € with the micro regime).
 *
 * Cash flow of the first year, tax included: −641,04 − 490,5 − 300 ≈ −1 431,5 €,
 * about −119 € a month.
 */

const RENT = 520_00;
const CHARGES = 99_00;
const PROPERTY_TAX = 585_00;
const PRICE = 80_000_00;
const RATE_PERCENT = 3.95;
const MONTHS = 240;

const content = quietContent();
const engine = createEngine(content);

function handInterest(): number {
  // Balance after 12 payments of an annuity, then interest = payments − capital repaid.
  const r = RATE_PERCENT / 100 / 12;
  const principal = PRICE / 100;
  const payment = 482.68;
  const growth = (1 + r) ** 12;
  const balance = principal * growth - (payment * (growth - 1)) / r;
  return 12 * payment - (principal - balance);
}

function setup(): GameState {
  // 31 December 2026 at 23:00: the next tick opens the 2027 tax year.
  const state = engine.createGame({
    seed: 2,
    startDate: { year: 2026, month: 12, day: 31 },
    startHour: 23,
    jobId: 'civilServant',
  });
  const today = toDayNumber(state.clock.date);
  const owned: OwnedProperty = {
    property: {
      id: 'property-t2',
      cityId: 'dole',
      neighbourhoodId: 'centreHistorique',
      kind: 'apartment',
      surface: 45,
      rooms: 2,
      floor: 1,
      lots: [],
      epoch: 'from1948to1974',
      dpe: 'D',
      condition: 'good',
      defects: [],
      annualPropertyTax: PROPERTY_TAX,
      monthlyCharges: CHARGES,
    },
    purchasePrice: PRICE,
    acquisitionCost: PRICE + 6_000_00 + 800_00,
    purchaseDate: { year: 2026, month: 12, day: 15 },
    sale: null,
    rental: null,
    lease: {
      leaseType: 'bare',
      tenant: {
        firstName: 'Camille',
        lastName: 'Martin',
        profileId: 'employee',
        traitId: 'plantLover',
        monthlyIncome: 2_000_00,
        guarantor: false,
        desiredYears: 4,
        reliability: 0.9,
        mobility: 1,
      },
      monthlyRent: RENT,
      startDay: today,
      termDay: today + 3 * 365,
      // No revision during the year.
      anniversaryDay: today + 400,
      revisionFactor: 1,
      deposit: RENT,
      agencyId: null,
      insured: false,
      satisfaction: 75,
      noticeEndDay: null,
      incident: null,
      arrears: null,
    },
    furniture: null,
    taxRegime: 'auto',
    furnishedTax: { deferredDepreciation: 0, deficitCarry: 0, buildingDepreciationDeducted: 0 },
  };
  state.properties = [owned];
  state.loans = [
    {
      id: 'loan-t2',
      bankId: 'tirelire',
      principal: PRICE,
      ratePercent: RATE_PERCENT,
      durationMonths: MONTHS,
      monthlyPayment: annuityPayment(PRICE, RATE_PERCENT, MONTHS),
      remaining: PRICE,
      paymentsMade: 0,
      startDate: { year: 2026, month: 12, day: 15 },
      renegotiationSuggested: false,
      propertyId: 'property-t2',
    },
  ];
  // Plenty of cash: no overdraft interest blurs the flows.
  state.player.balance = 50_000_00;
  return state;
}

/** Plays from 1 January 2027 to 1 January 2028 included (the yearly review). */
function playYear() {
  let state = setup();
  const events: GameEvent[] = [];
  for (;;) {
    const result = engine.tick(state);
    state = result.state;
    events.push(...result.events);
    if (result.events.some((e) => e.type === 'taxAssessed' && e.year === 2027)) break;
  }
  return { state, events };
}

const PROPERTY_LINES = new Set<StatementLine['kind']>([
  'rentalIncome',
  'propertyCharges',
  'ownerInsurance',
  'managementFees',
  'loanPayment',
]);

describe('cash flow of a let property, checked by hand', () => {
  const { state, events } = playYear();
  const statements = events.flatMap((e) => (e.type === 'monthlyStatement' ? [e.lines] : []));
  // January 2027 to December 2027, then January 2028.
  const year = statements.slice(0, 12);

  it('uses the loan payment of the hand calculation', () => {
    expect(annuityPayment(PRICE, RATE_PERCENT, MONTHS)).toBe(482_68);
  });

  it('collects the rent and pays the costs every month, as by hand', () => {
    expect(year).toHaveLength(12);
    for (const lines of year) {
      const property = lines.filter((l) => PROPERTY_LINES.has(l.kind));
      expect(property.map((l) => [l.kind, l.amount])).toEqual([
        ['propertyCharges', 99_00],
        ['ownerInsurance', 12_29],
        ['rentalIncome', 520_00 + 69_30],
        ['loanPayment', 482_68],
      ]);
      const flow = property.reduce(
        (sum, l) => sum + (l.kind === 'rentalIncome' ? l.amount : -l.amount),
        0,
      );
      expect(flow).toBe(-4_67);
    }
  });

  it('charges the property tax on 15 October', () => {
    const charged = events.filter((e) => e.type === 'propertyTaxCharged');
    expect(charged).toEqual([{ type: 'propertyTaxCharged', amount: PROPERTY_TAX }]);
  });

  it('assesses the tax under the real regime, as by hand', () => {
    const interest = handInterest();
    expect(interest).toBeCloseTo(3_111.8, 0);
    const taxableByHand = 6_240 - 356.4 - 585 - 147.48 - 300 - interest;
    const assessment = state.tax.lastAssessment;
    expect(assessment?.year).toBe(2027);
    expect(assessment?.properties).toHaveLength(1);
    const [property] = assessment?.properties ?? [];
    expect(property?.regime).toBe('real');
    // Within a euro: the engine rounds the interest month by month.
    expect(Math.abs((property?.taxable ?? 0) / 100 - taxableByHand)).toBeLessThan(1);
    expect(assessment?.accountantFees).toBe(300_00);
    const taxByHand = taxableByHand * (0.11 + 0.172);
    const total = (assessment?.incomeTax ?? 0) + (assessment?.socialContributions ?? 0);
    expect(Math.abs(total / 100 - taxByHand)).toBeLessThan(1);
    expect(Math.abs(state.tax.installments.monthly / 100 - taxByHand / 12)).toBeLessThan(0.1);
    // The first instalment was taken with the January 2028 statement.
    expect(state.tax.installments.remaining).toBe(11);
  });

  it('prefers it to the micro regime, as by hand', () => {
    // Same year, micro-foncier forced: 4 368 € taxable.
    const forced = engine.estimateTaxes(playMicro()).assessment;
    const [property] = forced.properties;
    expect(property?.regime).toBe('micro');
    expect(property?.taxable).toBe(4_368_00);
    expect(forced.incomeTax + forced.socialContributions).toBe(
      Math.round(4_368_00 * 0.11) + Math.round(4_368_00 * 0.172),
    );
  });

  it('ends the year with the hand-made cash flow, tax included', () => {
    const before = setup().player.balance;
    // Salary, home rent and living costs are the household's: taken out.
    const household = year
      .flat()
      .reduce(
        (sum, l) =>
          sum +
          (l.kind === 'salary' ? l.amount : 0) -
          (l.kind === 'rent' || l.kind === 'livingCosts' ? l.amount : 0),
        0,
      );
    const january2028 = statements[12] ?? [];
    const nextYearFlows = january2028.reduce(
      (sum, l) =>
        sum +
        (l.kind === 'salary' || l.kind === 'rentalIncome' ? l.amount : 0) -
        (PROPERTY_LINES.has(l.kind) && l.kind !== 'rentalIncome' ? l.amount : 0) -
        (l.kind === 'rent' || l.kind === 'livingCosts' || l.kind === 'taxInstalment'
          ? l.amount
          : 0),
      0,
    );
    const cashFlowBeforeTax = state.player.balance - before - household - nextYearFlows;
    // −641,04 € before tax, minus the accountant paid at the yearly review.
    expect(cashFlowBeforeTax).toBe(-641_04 - 300_00);
    const yearTax =
      (state.tax.lastAssessment?.incomeTax ?? 0) +
      (state.tax.lastAssessment?.socialContributions ?? 0);
    const withTax = (cashFlowBeforeTax - yearTax) / 100;
    expect(withTax).toBeGreaterThan(-1_433);
    expect(withTax).toBeLessThan(-1_430);
  });
});

/** The same year with the micro regime chosen, estimated on 31 December. */
function playMicro(): GameState {
  let state = setup();
  state.properties[0] = { ...(state.properties[0] as OwnedProperty), taxRegime: 'micro' };
  for (;;) {
    const result = engine.tick(state);
    if (result.state.clock.date.year === 2027 && result.state.clock.date.month === 12) {
      if (result.state.clock.date.day === 31 && result.state.clock.hour === 23) {
        return result.state;
      }
    }
    state = result.state;
  }
}
