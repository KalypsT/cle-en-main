import { describe, expect, it } from 'vitest';
import { annuityPayment, principalForPayment, splitPayment, toCents } from './money.ts';

describe('money', () => {
  it('converts euros to integer cents', () => {
    expect(toCents(520)).toBe(52000);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('computes the payment of an amortizing loan', () => {
    // 100 000 € over 20 years at 4 %: 605,9803 €, rounded up to the cent.
    expect(annuityPayment(toCents(100_000), 4, 240)).toBe(60599);
    expect(annuityPayment(toCents(12_000), 0, 12)).toBe(toCents(1000));
  });

  it('inverts the payment formula', () => {
    const payment = annuityPayment(toCents(150_000), 3.9, 300);
    const principal = principalForPayment(payment, 3.9, 300);
    expect(annuityPayment(principal, 3.9, 300)).toBeLessThanOrEqual(payment);
    expect(Math.abs(principal - toCents(150_000))).toBeLessThan(500);
  });

  it('repays a loan to exactly zero', () => {
    const principal = toCents(80_000);
    const payment = annuityPayment(principal, 3.5, 180);
    let remaining = principal;
    let months = 0;
    while (remaining > 0) {
      const { capital } = splitPayment(remaining, 3.5, payment);
      remaining -= capital;
      months += 1;
    }
    expect(months).toBeLessThanOrEqual(180);
    expect(months).toBeGreaterThan(178);
  });
});
