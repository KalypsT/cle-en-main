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
} from './taxes.ts';

const SALARY = 24_000_00; // 2 000 € a month: 21 600 € taxable, 11 % marginal rate.

function input(overrides: Partial<TaxInput>): TaxInput {
  return {
    propertyId: 'p',
    category: 'bare',
    choice: 'auto',
    rents: 6_000_00,
    costs: 1_000_00,
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
      },
    });
    expect(capitalGainsTax({ content, state }, owned, 100_000_00).gain).toBe(
      100_000_00 - (80_000_00 + 6_800_00) + 5_000_00,
    );
  });
});
