import { describe, expect, it } from 'vitest';
import { content, newGame, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameState } from '../state.ts';
import {
  bestTax,
  capitalGainsTax,
  computeTax,
  incomeTax,
  type TaxInput,
  type TaxRegime,
  wealthTax,
} from './taxes.ts';
import { realValue } from './valuation.ts';

const SALARY = 24_000_00; // 2 000 € a month: 21 600 € taxable, 11 % marginal rate.

function input(overrides: Partial<TaxInput>): TaxInput {
  return {
    propertyId: 'p',
    category: 'bare',
    choice: 'auto',
    rents: 6_000_00,
    costs: 1_000_00,
    works: 0,
    energyRenovation: false,
    interest: 2_000_00,
    buildingDepreciation: 0,
    depreciation: 0,
    deferredDepreciation: 0,
    deficitCarry: 0,
    ...overrides,
  };
}

const regimes = (regime: TaxRegime, id = 'p') => new Map([[id, regime]]);

describe('income tax', () => {
  it('applies the 2026 scale (revenus 2025) for one tax share', () => {
    expect(incomeTax(content, 11_600_00)).toBe(0);
    // 11 % from 11 600 € to 29 579 €, then 30 %.
    expect(incomeTax(content, 30_000_00)).toBe(
      Math.round((29_579_00 - 11_600_00) * 0.11 + (30_000_00 - 29_579_00) * 0.3),
    );
  });

  it('charges only the extra tax the rents cause, plus social contributions', () => {
    const { total, assessment } = computeTax(
      content,
      2027,
      SALARY,
      [],
      [input({})],
      regimes('micro'),
    );
    // Micro-foncier: 70 % of 6 000 € taxable at 11 % + 17,2 %.
    expect(assessment.properties[0]?.taxable).toBe(4_200_00);
    expect(total).toBe(Math.round(4_200_00 * 0.11) + Math.round(4_200_00 * 0.172));
  });
});

describe('bare lets, real regime', () => {
  it('turns a deficit into a lower tax on the salary, within the ceiling, and carries the rest', () => {
    // Big costs (works): 30 000 € of costs for 6 000 € of rents.
    const works = input({ costs: 30_000_00, interest: 2_000_00 });
    const result = computeTax(content, 2027, SALARY, [], [works], regimes('real'));
    expect(result.assessment.deficitOnSalary).toBe(10_700_00);
    expect(result.total).toBeLessThan(0);
    // 26 000 € of deficit (accountant included): 10 700 € on the salary, the rest carried.
    const deficit = 30_000_00 + 2_000_00 + 300_00 - 6_000_00;
    expect(result.landlordDeficits).toEqual([{ year: 2027, amount: deficit - 10_700_00 }]);
    // The carried deficit absorbs the next year's bare-let income.
    const next = computeTax(
      content,
      2028,
      SALARY,
      result.landlordDeficits,
      [input({})],
      regimes('micro'),
    );
    expect(next.total).toBe(0);
  });

  it('deducts works in a bare let, with the doubled ceiling for an energy renovation', () => {
    const works = input({ rents: 6_000_00, costs: 1_000_00, interest: 0, works: 30_000_00 });
    const plain = computeTax(content, 2027, SALARY, [], [works], regimes('real'));
    expect(plain.assessment.deficitOnSalary).toBe(10_700_00);
    const energy = { ...works, energyRenovation: true };
    const doubled = computeTax(content, 2027, SALARY, [], [energy], regimes('real'));
    expect(doubled.assessment.deficitOnSalary).toBe(21_400_00);
    // The measure ends with 2027.
    const late = computeTax(content, 2028, SALARY, [], [energy], regimes('real'));
    expect(late.assessment.deficitOnSalary).toBe(10_700_00);
    // Micro-foncier: the works change nothing.
    const micro = computeTax(content, 2027, SALARY, [], [works], regimes('micro'));
    expect(micro.assessment.deficitOnSalary).toBe(0);
  });

  it('keeps the interest part of a deficit for the rents only', () => {
    // Interest beyond the rents: no deficit on the salary.
    const loaded = input({ rents: 3_000_00, costs: 0, interest: 5_000_00 });
    const result = computeTax(content, 2027, SALARY, [], [loaded], regimes('real'));
    expect(result.assessment.deficitOnSalary).toBe(300_00); // only the accountant
    expect(result.landlordDeficits[0]?.amount).toBe(2_000_00);
  });

  it('forgets deficits older than ten years', () => {
    const old = [{ year: 2016, amount: 5_000_00 }];
    expect(
      computeTax(content, 2027, SALARY, old, [input({})], regimes('micro')).total,
    ).toBeGreaterThan(0);
  });
});

describe('furnished lets', () => {
  it('micro-BIC exempts 50 % of the rents', () => {
    const flat = input({ category: 'furnished', rents: 7_000_00 });
    const result = computeTax(content, 2027, SALARY, [], [flat], regimes('micro'));
    expect(result.assessment.properties[0]?.taxable).toBe(3_500_00);
    expect(result.total).toBe(Math.round(3_500_00 * 0.11) + Math.round(3_500_00 * 0.186));
  });

  it('LMNP real regime: depreciation erases the tax and waits when it exceeds the result', () => {
    const flat = input({
      category: 'furnished',
      rents: 7_000_00,
      costs: 1_500_00,
      interest: 2_000_00,
      buildingDepreciation: 2_400_00,
      depreciation: 2_900_00,
    });
    const result = computeTax(content, 2027, SALARY, [], [flat], regimes('real'));
    // 7 000 − 1 500 − 2 000 − 550 (accountant) = 2 950 €; 2 900 € depreciated: 50 € taxable.
    expect(result.assessment.properties[0]?.taxable).toBe(50_00);
    expect(result.furnished.p).toEqual({
      deferredDepreciation: 0,
      deficitCarry: 0,
      buildingDepreciationUsed: Math.round((2_900_00 * 2_400) / 2_900),
    });
    const poor = computeTax(
      content,
      2027,
      SALARY,
      [],
      [{ ...flat, rents: 4_000_00 }],
      regimes('real'),
    );
    expect(poor.total).toBe(0);
    expect(poor.furnished.p?.deficitCarry).toBe(50_00);
    expect(poor.furnished.p?.deferredDepreciation).toBe(2_900_00);
  });

  it('picks the cheapest regime, accountant included, and respects the micro ceilings', () => {
    const small = input({ category: 'furnished', rents: 3_000_00, costs: 500_00, interest: 0 });
    // A small rent: the accountant costs more than the real regime saves.
    expect(bestTax(content, 2027, SALARY, [], [small]).assessment.properties[0]?.regime).toBe(
      'micro',
    );
    const big = input({
      category: 'furnished',
      rents: 12_000_00,
      costs: 2_000_00,
      interest: 3_000_00,
      buildingDepreciation: 3_000_00,
      depreciation: 3_500_00,
    });
    expect(bestTax(content, 2027, SALARY, [], [big]).assessment.properties[0]?.regime).toBe('real');
    // Above 15 000 € of bare rents, the micro regime is not allowed.
    const many = [
      input({ propertyId: 'a', rents: 9_000_00 }),
      input({ propertyId: 'b', rents: 9_000_00, choice: 'micro' }),
    ];
    const result = bestTax(content, 2027, SALARY, [], many);
    expect(result.assessment.properties.every((p) => p.regime === 'real')).toBe(true);
  });
});

describe('capital gains', () => {
  function sellerAt(year: number, overrides: Partial<ReturnType<typeof sampleOwned>> = {}) {
    const state: GameState = newGame();
    const owned = { ...sampleOwned(toDayNumber(state.clock.date)), ...overrides };
    state.properties = [owned];
    state.clock.date = { year, month: 12, day: 20 };
    return { state, owned };
  }

  it('taxes the gain at 19 % + 17,2 % with the flat fees, then the holding allowances', () => {
    const { state, owned } = sellerAt(2028);
    // Two years: no allowance; fees: the real 6 800 € beat the flat 7,5 % (6 000 €).
    const gain = 100_000_00 - (80_000_00 + 6_800_00);
    expect(capitalGainsTax({ content, state }, owned, 100_000_00)).toEqual({
      gain,
      yearsHeld: 2,
      tax: Math.round(gain * 0.19) + Math.round(gain * 0.172),
      home: null,
    });
    // Ten years: the flat 15 % for works, 30 % of income-tax allowance, 8,25 % of social.
    const later = sellerAt(2036);
    const tenYears = capitalGainsTax({ content, state: later.state }, later.owned, 120_000_00);
    const gain10 = 120_000_00 - (80_000_00 + 6_800_00 + 12_000_00);
    expect(tenYears.gain).toBe(gain10);
    expect(tenYears.tax).toBe(
      Math.round(gain10 * (1 - 0.3) * 0.19) + Math.round(gain10 * (1 - 5 * 0.0165) * 0.172),
    );
  });

  it('replaces the flat works allowance by the real works when they are higher', () => {
    // Works not deducted from the rents (micro regime, or a vacant home): 20 000 €.
    const { state, owned } = sellerAt(2036, { worksForCapitalGains: 20_000_00 });
    const real = capitalGainsTax({ content, state }, owned, 120_000_00);
    expect(real.gain).toBe(120_000_00 - (80_000_00 + 6_800_00 + 20_000_00));
    // Below the flat 15 % (12 000 €), the flat allowance stays.
    const low = sellerAt(2036, { worksForCapitalGains: 5_000_00 });
    expect(capitalGainsTax({ content, state: low.state }, low.owned, 120_000_00).gain).toBe(
      120_000_00 - (80_000_00 + 6_800_00 + 12_000_00),
    );
    // Real works count even before five years.
    const early = sellerAt(2028, { worksForCapitalGains: 20_000_00 });
    expect(capitalGainsTax({ content, state: early.state }, early.owned, 120_000_00).gain).toBe(
      120_000_00 - (80_000_00 + 6_800_00 + 20_000_00),
    );
  });

  it('counts this year’s works of a property never let, or let furnished', () => {
    const ledger = (category: 'bare' | 'furnished' | null) => ({
      category,
      regime: 'auto' as const,
      company: false,
      rents: 0,
      costs: 0,
      works: 20_000_00,
      energyRenovation: false,
      interest: 0,
      sold: false,
    });
    const gainWith = (category: 'bare' | 'furnished' | null) => {
      const { state, owned } = sellerAt(2028);
      state.tax.ledgers[owned.property.id] = ledger(category);
      return capitalGainsTax({ content, state }, owned, 120_000_00).gain;
    };
    const withWorks = 120_000_00 - (80_000_00 + 6_800_00 + 20_000_00);
    // A marchand's flat, renovated and sold without a tenant: its works count.
    expect(gainWith(null)).toBe(withWorks);
    expect(gainWith('furnished')).toBe(withWorks);
    // Bare: they are deducted from the rents at the review, not from the gain.
    expect(gainWith('bare')).toBe(120_000_00 - (80_000_00 + 6_800_00));
  });

  it('exempts the income tax after 22 years and everything after 30', () => {
    const at22 = sellerAt(2048);
    const t22 = capitalGainsTax({ content, state: at22.state }, at22.owned, 200_000_00);
    expect(t22.tax).toBe(Math.round(t22.gain * (1 - (16 * 0.0165 + 0.016)) * 0.172));
    const at30 = sellerAt(2056);
    expect(capitalGainsTax({ content, state: at30.state }, at30.owned, 200_000_00).tax).toBe(0);
  });

  it('adds back the LMNP building depreciation (2025 rule)', () => {
    const { state, owned } = sellerAt(2028, {
      furnishedTax: {
        deferredDepreciation: 0,
        deficitCarry: 0,
        buildingDepreciationDeducted: 5_000_00,
        works: [],
      },
    });
    expect(capitalGainsTax({ content, state }, owned, 100_000_00).gain).toBe(
      100_000_00 - (80_000_00 + 6_800_00) + 5_000_00,
    );
  });

  it('charges the IFI on the net real-estate wealth from 1.3 M€, with its discount', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const owned = sampleOwned(today);
    state.properties = [owned];
    const market = state.market.cities.dole?.[owned.property.neighbourhoodId];
    if (!market) throw new Error('no market');
    const value = () => realValue(content, state, owned.property).value;
    // Under the threshold: nothing, whatever the scale says.
    expect(wealthTax(content, state).tax).toBe(0);
    // 2 M€ of net wealth: 0,5 % from 800 k€ to 1,3 M€, then 0,7 %.
    market.priceIndex *= 2_000_000_00 / value();
    const base = value();
    const expected = Math.round(500_000_00 * 0.005 + (base - 1_300_000_00) * 0.007);
    expect(wealthTax(content, state)).toEqual({ base, tax: expected });
    // Loans are deducted; the main residence has a 30 % allowance.
    state.loans = [{ ...loanOn(owned.property.id), remaining: 500_000_00 }];
    expect(wealthTax(content, state).base).toBe(base - 500_000_00);
    state.loans = [];
    state.player.homePropertyId = owned.property.id;
    expect(wealthTax(content, state).base).toBe(Math.round(base * 0.7));
    // Just over the threshold, the discount lowers the tax.
    state.player.homePropertyId = null;
    market.priceIndex *= 1_350_000_00 / value();
    const small = value();
    const scale = 500_000_00 * 0.005 + (small - 1_300_000_00) * 0.007;
    expect(wealthTax(content, state).tax).toBe(Math.round(scale - (17_500_00 - small * 0.0125)));
  });
});

function loanOn(propertyId: string): GameState['loans'][number] {
  return {
    id: 'loan-ifi',
    bankId: 'tirelire',
    principal: 0,
    ratePercent: 4,
    durationMonths: 240,
    monthlyPayment: 0,
    remaining: 0,
    paymentsMade: 0,
    startDate: { year: 2027, month: 1, day: 1 },
    interestPaid: 0,
    renegotiationSuggested: false,
    renegotiationDeclinedPercent: null,
    propertyId,
  };
}
