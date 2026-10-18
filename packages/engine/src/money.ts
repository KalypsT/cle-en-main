/** Money is stored as integer cents everywhere in the state. */
export type Cents = number;

export function toCents(euros: number): Cents {
  return Math.round(euros * 100);
}

/** Monthly rate as a fraction, from an annual rate in percentage points. */
export function monthlyRate(annualPercent: number): number {
  return annualPercent / 100 / 12;
}

/** Constant monthly payment of an amortizing fixed-rate loan, rounded up to the cent. */
export function annuityPayment(principal: Cents, annualPercent: number, months: number): Cents {
  if (months <= 0) throw new RangeError('Loan duration must be positive');
  const rate = monthlyRate(annualPercent);
  if (rate === 0) return Math.ceil(principal / months);
  return Math.ceil((principal * rate) / (1 - (1 + rate) ** -months));
}

/** Largest principal whose monthly payment does not exceed `payment`. */
export function principalForPayment(payment: Cents, annualPercent: number, months: number): Cents {
  const rate = monthlyRate(annualPercent);
  const principal = rate === 0 ? payment * months : (payment * (1 - (1 + rate) ** -months)) / rate;
  let result = Math.floor(principal);
  while (result > 0 && annuityPayment(result, annualPercent, months) > payment) result -= 1;
  return result;
}

/** Splits one monthly payment into interest and capital. */
export function splitPayment(
  remaining: Cents,
  annualPercent: number,
  payment: Cents,
): { interest: Cents; capital: Cents } {
  const interest = Math.round(remaining * monthlyRate(annualPercent));
  const capital = Math.min(remaining, payment - interest);
  return { interest, capital };
}
