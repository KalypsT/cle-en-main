import { type CalendarDate, toDayNumber } from '../calendar.ts';
import type { GameContent, LeaseType } from '../content.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, toCents } from '../money.ts';
import type {
  GameState,
  OwnedProperty,
  PropertyLedger,
  TaxAssessment,
  TaxRegimeChoice,
} from '../state.ts';
import type { SystemContext } from './context.ts';
import { realValue } from './valuation.ts';

/**
 * Taxes (docs/03-systemes/06-fiscalite.md): what each property earns and
 * costs is recorded through the year; the tax is assessed at the yearly
 * review (1 January) and paid in twelve monthly instalments the year after.
 * Only the extra income tax caused by the rents is charged: the game's
 * salaries are already net of their own tax.
 */

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
/** Exhaustive search over the regimes up to this many properties, greedy beyond. */
const MAX_EXHAUSTIVE_PROPERTIES = 10;

export type TaxRegime = 'micro' | 'real';

function emptyLedger(owned: OwnedProperty | null): PropertyLedger {
  return {
    category: owned?.lease?.leaseType ?? owned?.rental?.leaseType ?? null,
    regime: owned?.taxRegime ?? 'auto',
    company: owned?.holder === 'company',
    rents: 0,
    costs: 0,
    works: 0,
    energyRenovation: false,
    interest: 0,
    sold: false,
  };
}

/** This year's ledger of a property, created on first use. */
export function ledgerOf(state: GameState, owned: OwnedProperty): PropertyLedger {
  const id = owned.property.id;
  let ledger = state.tax.ledgers[id];
  if (!ledger) {
    ledger = emptyLedger(owned);
    state.tax.ledgers[id] = ledger;
  }
  return ledger;
}

/** The main residence earns nothing and deducts nothing. */
function isHome(state: GameState, owned: OwnedProperty): boolean {
  return state.player.homePropertyId === owned.property.id;
}

export function addRent(state: GameState, owned: OwnedProperty, amount: Cents): void {
  if (isHome(state, owned)) return;
  ledgerOf(state, owned).rents += amount;
  owned.rentsReceived += amount;
  if (owned.lease) owned.lease.rentsReceived += amount;
}

export function addCost(state: GameState, owned: OwnedProperty, amount: Cents): void {
  if (!isHome(state, owned)) ledgerOf(state, owned).costs += amount;
}

/**
 * Works paid on a property. At the yearly review they are deducted (bare
 * let, real regime), depreciated (furnished, real regime) or kept for the
 * capital gain (micro regimes, vacant property, main residence).
 */
export function addWorks(state: GameState, owned: OwnedProperty, amount: Cents): void {
  if (isHome(state, owned)) {
    owned.worksForCapitalGains += amount;
    return;
  }
  ledgerOf(state, owned).works += amount;
}

export function initialTaxState(year: number): GameState['tax'] {
  return {
    year,
    salary: 0,
    ledgers: {},
    landlordDeficits: [],
    installments: { monthly: 0, remaining: 0 },
    lastAssessment: null,
  };
}

/** Salaries and loan interest of a monthly statement; `loanProperty` maps loans to properties. */
export function recordStatement(
  ctx: SystemContext,
  lines: readonly StatementLine[],
  loanProperty: ReadonlyMap<string, string | null>,
): void {
  const { state } = ctx;
  for (const line of lines) {
    if (line.kind === 'salary') state.tax.salary += line.amount;
    if (line.kind !== 'loanPayment') continue;
    const propertyId = loanProperty.get(line.loanId);
    const owned = state.properties.find((o) => o.property.id === propertyId);
    if (owned && !isHome(state, owned)) ledgerOf(state, owned).interest += line.interest;
  }
}

/** Income tax of one tax share on `taxable` (progressive scale). */
export function incomeTax(content: GameContent, taxable: Cents): Cents {
  const brackets = content.taxes.incomeTax.brackets;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    if (!bracket) continue;
    const from = toCents(bracket.from);
    const to = brackets[i + 1] ? toCents(brackets[i + 1]?.from ?? 0) : Infinity;
    if (taxable <= from) break;
    tax += (Math.min(taxable, to) - from) * bracket.rate;
  }
  return Math.round(tax);
}

/** One property's year, as the assessment sees it. */
export interface TaxInput {
  propertyId: string;
  category: LeaseType;
  choice: TaxRegimeChoice;
  /** Held by the SCI: always at the real regime (milestone 8). */
  company?: boolean;
  rents: Cents;
  costs: Cents;
  /** Works paid this year: deducted in a bare let at the real regime. */
  works: Cents;
  /** Works of an energy renovation: doubled deficit ceiling. */
  energyRenovation: boolean;
  interest: Cents;
  /** Furnished, real regime: this year's depreciation, building part and total. */
  buildingDepreciation: Cents;
  depreciation: Cents;
  deferredDepreciation: Cents;
  deficitCarry: Cents;
}

export interface TaxComputation {
  assessment: TaxAssessment;
  /** Income tax and social contributions; negative when the deficit lowers the salary's tax. */
  total: Cents;
  /** Total plus the accountant: what the regimes are compared on. */
  cost: Cents;
  landlordDeficits: { year: number; amount: Cents }[];
  furnished: Record<
    string,
    { deferredDepreciation: Cents; deficitCarry: Cents; buildingDepreciationUsed: Cents }
  >;
}

/** Tax family of a lease type's rents: revenus fonciers or BIC (content/location.json). */
export function taxCategory(content: GameContent, leaseType: LeaseType): 'bare' | 'furnished' {
  return content.renting.leaseTypes[leaseType].taxCategory;
}

function accountantFees(
  content: GameContent,
  category: 'bare' | 'furnished',
  count: number,
): Cents {
  if (count === 0) return 0;
  const fees = content.taxes.accountantFees[category];
  return toCents(fees.first + fees.perExtraProperty * (count - 1));
}

/** Taxes of a year for a given regime per property. */
export function computeTax(
  content: GameContent,
  year: number,
  salary: Cents,
  carried: readonly { year: number; amount: Cents }[],
  inputs: readonly TaxInput[],
  regimes: ReadonlyMap<string, TaxRegime>,
): TaxComputation {
  const rules = content.taxes;
  const regimeOf = (input: TaxInput) => regimes.get(input.propertyId) ?? 'micro';
  const bare = inputs.filter((i) => taxCategory(content, i.category) === 'bare');
  const furnished = inputs.filter((i) => taxCategory(content, i.category) === 'furnished');
  const realBare = bare.filter((i) => regimeOf(i) === 'real');
  // The SCI's own accountant does its properties (closeTaxYear charges him).
  const personalRealBare = realBare.filter((i) => !i.company);
  const realFurnished = furnished.filter((i) => regimeOf(i) === 'real');
  const bareFees = accountantFees(content, 'bare', personalRealBare.length);
  const furnishedFees = accountantFees(content, 'furnished', realFurnished.length);
  const properties: TaxAssessment['properties'] = [];

  // Bare lets (revenus fonciers): micro income and real results add up.
  let foncier = 0;
  let incomeBeforeInterest = 0;
  let realInterest = 0;
  for (const input of bare) {
    if (regimeOf(input) === 'micro') {
      const taxable = Math.round(input.rents * (1 - rules.microFoncier.allowanceShare));
      foncier += taxable;
      incomeBeforeInterest += taxable;
      properties.push({ ...propertyKey(input), regime: 'micro', taxable });
    } else {
      const fees = input.company ? 0 : Math.round(bareFees / personalRealBare.length);
      const taxable = input.rents - input.costs - input.works - input.interest - fees;
      foncier += taxable;
      incomeBeforeInterest += input.rents;
      realInterest += input.interest;
      properties.push({ ...propertyKey(input), regime: 'real', taxable });
    }
  }
  const minYear = year - rules.landlordDeficit.carryYears;
  let deficits = carried.filter((d) => d.year >= minYear).map((d) => ({ ...d }));
  let foncierTaxable = 0;
  let deficitOnSalary = 0;
  if (foncier >= 0) {
    // Older deficits are used first.
    let left = foncier;
    for (const deficit of deficits) {
      const used = Math.min(left, deficit.amount);
      deficit.amount -= used;
      left -= used;
    }
    deficits = deficits.filter((d) => d.amount > 0);
    foncierTaxable = left;
  } else {
    // Interest is deducted from the rents first: only the deficit from the other costs
    // lowers the salary, within a yearly ceiling.
    const deficit = -foncier;
    const fromInterest = Math.min(deficit, Math.max(0, realInterest - incomeBeforeInterest));
    // Doubled ceiling the year an energy renovation is paid (until the end of the measure).
    const energy = rules.landlordDeficit.energyRenovation;
    const doubled = year <= energy.untilYear && realBare.some((input) => input.energyRenovation);
    deficitOnSalary = Math.min(
      toCents(doubled ? energy.ceiling : rules.landlordDeficit.globalCeiling),
      deficit - fromInterest,
    );
    const carry = deficit - deficitOnSalary;
    if (carry > 0) deficits.push({ year, amount: carry });
  }

  // Furnished lets (BIC): each property on its own.
  let bic = 0;
  const furnishedState: TaxComputation['furnished'] = {};
  for (const input of furnished) {
    if (regimeOf(input) === 'micro') {
      // Furnished tourist lets have their own, smaller allowance.
      const share =
        content.renting.leaseTypes[input.category].microBic?.allowanceShare ??
        rules.microBic.allowanceShare;
      const allowance = Math.max(
        Math.round(input.rents * share),
        Math.min(input.rents, toCents(rules.microBic.minimumAllowance)),
      );
      const taxable = input.rents - allowance;
      bic += taxable;
      properties.push({ ...propertyKey(input), regime: 'micro', taxable });
      continue;
    }
    const fees = Math.round(furnishedFees / realFurnished.length);
    const result = input.rents - input.costs - input.interest - fees - input.deficitCarry;
    const pool = input.deferredDepreciation + input.depreciation;
    if (result <= 0) {
      furnishedState[input.propertyId] = {
        deferredDepreciation: pool,
        deficitCarry: -result,
        buildingDepreciationUsed: 0,
      };
      properties.push({ ...propertyKey(input), regime: 'real', taxable: result });
      continue;
    }
    // Depreciation cannot create a deficit: what is left waits for later years.
    const used = Math.min(result, pool);
    const buildingShare =
      input.depreciation > 0 ? input.buildingDepreciation / input.depreciation : 1;
    furnishedState[input.propertyId] = {
      deferredDepreciation: pool - used,
      deficitCarry: 0,
      buildingDepreciationUsed: Math.round(used * buildingShare),
    };
    bic += result - used;
    properties.push({ ...propertyKey(input), regime: 'real', taxable: result - used });
  }

  const salaryTaxable = Math.round(salary * (1 - rules.incomeTax.salaryAllowanceShare));
  const withRents = Math.max(0, salaryTaxable - deficitOnSalary + foncierTaxable + bic);
  const tax = incomeTax(content, withRents) - incomeTax(content, salaryTaxable);
  const social = Math.round(
    foncierTaxable * rules.socialContributions.bare + bic * rules.socialContributions.furnished,
  );
  const fees = bareFees + furnishedFees;
  return {
    assessment: {
      year,
      incomeTax: tax,
      socialContributions: social,
      accountantFees: fees,
      deficitOnSalary,
      wealthTax: 0,
      taxableWealth: 0,
      properties,
    },
    total: tax + social,
    cost: tax + social + fees,
    landlordDeficits: deficits,
    furnished: furnishedState,
  };
}

function propertyKey(input: TaxInput) {
  return { propertyId: input.propertyId, category: input.category };
}

/** Regimes allowed for each property: a micro regime has a ceiling on the receipts. */
function allowedRegimes(content: GameContent, inputs: readonly TaxInput[]) {
  const receipts = (keep: (input: TaxInput) => boolean) =>
    inputs.filter(keep).reduce((sum, i) => sum + i.rents, 0);
  const ceilings = {
    bare: toCents(content.taxes.microFoncier.receiptsCeiling),
    furnished: toCents(content.taxes.microBic.receiptsCeiling),
  };
  const familyReceipts = {
    bare: receipts((i) => taxCategory(content, i.category) === 'bare'),
    furnished: receipts((i) => taxCategory(content, i.category) === 'furnished'),
  };
  const microAllowed = (input: TaxInput) => {
    const family = taxCategory(content, input.category);
    if (familyReceipts[family] > ceilings[family]) return false;
    // A lease type with its own ceiling (furnished tourist lets) must stay under it too.
    const own = content.renting.leaseTypes[input.category].microBic;
    return !own || receipts((i) => i.category === input.category) <= toCents(own.receiptsCeiling);
  };
  return inputs.map((input): TaxRegime[] => {
    if (!microAllowed(input) || input.choice === 'real' || input.company) return ['real'];
    if (input.choice === 'micro') return ['micro'];
    return ['micro', 'real'];
  });
}

/** The cheapest regimes (tax plus accountant) given the player's choices. */
export function bestTax(
  content: GameContent,
  year: number,
  salary: Cents,
  carried: readonly { year: number; amount: Cents }[],
  inputs: readonly TaxInput[],
): TaxComputation {
  const options = allowedRegimes(content, inputs);
  const compute = (regimes: Map<string, TaxRegime>) =>
    computeTax(content, year, salary, carried, inputs, regimes);
  const regimes = new Map<string, TaxRegime>(
    inputs.map((input, i) => [input.propertyId, options[i]?.[0] ?? 'micro']),
  );
  const free = inputs.map((_, i) => i).filter((i) => (options[i]?.length ?? 0) > 1);
  if (free.length <= MAX_EXHAUSTIVE_PROPERTIES) {
    let best = compute(regimes);
    for (let mask = 1; mask < 2 ** free.length; mask++) {
      const candidate = new Map(regimes);
      free.forEach((index, bit) => {
        const input = inputs[index];
        if (input && mask & (1 << bit)) candidate.set(input.propertyId, 'real');
      });
      const result = compute(candidate);
      if (result.cost < best.cost) best = result;
    }
    return best;
  }
  // Many properties: improve one property at a time.
  let best = compute(regimes);
  for (const index of free) {
    const input = inputs[index];
    if (!input) continue;
    const candidate = new Map(regimes);
    candidate.set(input.propertyId, 'real');
    const result = compute(candidate);
    if (result.cost < best.cost) {
      best = result;
      regimes.set(input.propertyId, 'real');
    }
  }
  return best;
}

function yearShareOwned(fromDay: number, yearStartDay: number, yearEndDay: number): number {
  const start = Math.max(fromDay, yearStartDay);
  return Math.max(0, Math.min(1, (yearEndDay - start) / DAYS_PER_YEAR));
}

/** The year's inputs from the ledgers; depreciation only for furnished lets still owned. */
export function taxInputs(content: GameContent, state: GameState, yearEndDay: number): TaxInput[] {
  const rules = content.taxes.lmnp;
  const yearStartDay = toDayNumber({ year: state.tax.year, month: 1, day: 1 });
  const inputs: TaxInput[] = [];
  for (const [propertyId, ledger] of Object.entries(state.tax.ledgers)) {
    if (!ledger.category) continue;
    const owned = ledger.sold
      ? undefined
      : state.properties.find((o) => o.property.id === propertyId);
    let buildingDepreciation = 0;
    let depreciation = 0;
    if (owned && taxCategory(content, ledger.category) === 'furnished') {
      const purchaseDay = toDayNumber(owned.purchaseDate);
      buildingDepreciation = Math.round(
        ((owned.acquisitionCost * rules.buildingShare) / rules.buildingYears) *
          yearShareOwned(purchaseDay, yearStartDay, yearEndDay),
      );
      // Works are depreciated like the building (and added back to the capital gain alike).
      const taxYear = state.tax.year;
      for (const batch of owned.furnishedTax.works) {
        if (batch.year <= taxYear && taxYear < batch.year + rules.worksYears) {
          buildingDepreciation += Math.round(batch.amount / rules.worksYears);
        }
      }
      depreciation = buildingDepreciation;
      const furniture = owned.furniture;
      if (furniture && (yearEndDay - furniture.boughtDay) / DAYS_PER_YEAR <= rules.furnitureYears) {
        depreciation += Math.round(
          (furniture.cost / rules.furnitureYears) *
            yearShareOwned(furniture.boughtDay, yearStartDay, yearEndDay),
        );
      }
    }
    inputs.push({
      propertyId,
      category: ledger.category,
      choice: owned?.taxRegime ?? ledger.regime,
      company: ledger.company,
      rents: ledger.rents,
      costs: ledger.costs,
      works: ledger.works,
      energyRenovation: ledger.energyRenovation,
      interest: ledger.interest,
      buildingDepreciation,
      depreciation,
      deferredDepreciation: owned?.furnishedTax.deferredDepreciation ?? 0,
      deficitCarry: owned?.furnishedTax.deficitCarry ?? 0,
    });
  }
  return inputs;
}

/** Yearly review: last year's tax is assessed, the accountant is paid, the ledgers restart. */
export function closeTaxYear(ctx: SystemContext): void {
  const { content, state } = ctx;
  const { tax } = state;
  const inputs = taxInputs(content, state, ctx.today);
  const result = bestTax(content, tax.year, tax.salary, tax.landlordDeficits, inputs);
  for (const owned of state.properties) {
    const carry = result.furnished[owned.property.id];
    if (carry) {
      owned.furnishedTax.deferredDepreciation = carry.deferredDepreciation;
      owned.furnishedTax.deficitCarry = carry.deficitCarry;
      owned.furnishedTax.buildingDepreciationDeducted += carry.buildingDepreciationUsed;
    }
    const ledger = tax.ledgers[owned.property.id];
    if (!ledger || ledger.works === 0) continue;
    const assessed = result.assessment.properties.find((p) => p.propertyId === owned.property.id);
    if (assessed?.regime === 'real' && taxCategory(content, assessed.category) === 'bare') continue;
    // Not deducted from the rents: depreciated if let furnished, and counted in the capital gain.
    if (assessed?.regime === 'real') {
      owned.furnishedTax.works.push({ amount: ledger.works, year: tax.year });
    }
    owned.worksForCapitalGains += ledger.works;
  }
  const fees = result.assessment.accountantFees + companyAccountantFees(content, state);
  state.player.balance -= fees;
  tax.landlordDeficits = result.landlordDeficits;
  // The IFI of 1 January is paid with the income tax, in the same instalments.
  const wealth = wealthTax(content, state);
  const total = result.total + wealth.tax;
  tax.installments = {
    monthly: Math.round(total / MONTHS_PER_YEAR),
    remaining: total === 0 ? 0 : MONTHS_PER_YEAR,
  };
  tax.lastAssessment = {
    ...result.assessment,
    accountantFees: fees,
    wealthTax: wealth.tax,
    taxableWealth: wealth.base,
  };
  ctx.events.push({
    type: 'taxAssessed',
    year: tax.year,
    total,
    accountantFees: fees,
    wealthTax: wealth.tax,
  });
  tax.year = state.clock.date.year;
  tax.salary = 0;
  tax.ledgers = {};
  for (const owned of state.properties) {
    if (!isHome(state, owned)) ledgerOf(state, owned);
  }
}

/** Yearly fees of the SCI's accountant, from its creation, by property it holds. */
export function companyAccountantFees(content: GameContent, state: GameState): Cents {
  if (!state.company) return 0;
  const count = state.properties.filter((owned) => owned.holder === 'company').length;
  const rules = content.company.accountantFees;
  return toCents(rules.first + rules.perExtraProperty * Math.max(0, count - 1));
}

/**
 * Impôt sur la fortune immobilière (milestone 8): every property at its value (the main
 * residence with an allowance), minus the loans still due; nothing below the threshold.
 */
export function wealthTax(content: GameContent, state: GameState): { base: Cents; tax: Cents } {
  const rules = content.taxes.wealthTax;
  let gross = 0;
  for (const owned of state.properties) {
    const value = realValue(content, state, owned.property).value;
    const home = state.player.homePropertyId === owned.property.id;
    gross += home ? Math.round(value * (1 - rules.homeAllowanceShare)) : value;
  }
  const debts = state.loans.reduce((sum, loan) => sum + loan.remaining, 0);
  const base = Math.max(0, gross - debts);
  if (base < toCents(rules.threshold)) return { base, tax: 0 };
  let tax = 0;
  const { brackets } = rules;
  for (let i = 0; i < brackets.length; i++) {
    const bracket = brackets[i];
    if (!bracket) continue;
    const from = toCents(bracket.from);
    const next = brackets[i + 1];
    const to = next ? toCents(next.from) : Infinity;
    if (base <= from) break;
    tax += (Math.min(base, to) - from) * bracket.rate;
  }
  if (base < toCents(rules.decote.until)) {
    tax -= Math.max(0, toCents(rules.decote.base) - base * rules.decote.rate);
  }
  return { base, tax: Math.max(0, Math.round(tax)) };
}

/** Monthly instalment of last year's tax (a refund when the deficit lowered it). */
export function runMonthlyTaxInstalment(ctx: SystemContext, lines: StatementLine[]): void {
  const { installments } = ctx.state.tax;
  if (installments.remaining <= 0) return;
  installments.remaining -= 1;
  const amount = installments.monthly;
  ctx.state.player.balance -= amount;
  if (amount > 0) lines.push({ kind: 'taxInstalment', amount });
  else if (amount < 0) lines.push({ kind: 'taxRefund', amount: -amount });
}

/** Tax still to pay on last year's income (negative: refund to come). */
export function taxDue(state: GameState): Cents {
  return state.tax.installments.monthly * state.tax.installments.remaining;
}

/** Property tax, charged once a year (taxe foncière). */
export function runDailyPropertyTax(ctx: SystemContext): void {
  const { content, state } = ctx;
  const { month, day } = content.taxes.propertyTaxDate;
  if (state.clock.date.month !== month || state.clock.date.day !== day) return;
  let total = 0;
  for (const owned of state.properties) {
    const amount = owned.property.annualPropertyTax;
    state.player.balance -= amount;
    addCost(state, owned, amount);
    total += amount;
  }
  if (total > 0) ctx.events.push({ type: 'propertyTaxCharged', amount: total });
}

/** Full years of ownership on `date`. */
function yearsHeld(owned: OwnedProperty, date: CalendarDate): number {
  const bought = owned.purchaseDate;
  const beforeAnniversary =
    date.month < bought.month || (date.month === bought.month && date.day < bought.day);
  return Math.max(0, date.year - bought.year - (beforeAnniversary ? 1 : 0));
}

function allowance(
  allowances: readonly { fromYear: number; toYear: number; perYear: number }[],
  years: number,
): number {
  let total = 0;
  for (const rule of allowances) {
    const counted = Math.min(years, rule.toYear) - rule.fromYear + 1;
    if (counted > 0) total += counted * rule.perYear;
  }
  return Math.min(1, total);
}

export interface CapitalGain {
  /** Taxable gain before the holding allowances. */
  gain: Cents;
  yearsHeld: number;
  tax: Cents;
  /**
   * The main residence: exempt once lived in long enough (null when not the home). `months`
   * counts the months lived in it on the day the sale is agreed (today if not agreed yet).
   */
  home: { exempt: boolean; months: number; minMonths: number } | null;
}

/** Whole months the player has lived in his home on `day`. */
function monthsLivedIn(state: GameState, day: number): number {
  const since = state.player.homeSinceDay;
  return since === null ? 0 : Math.max(0, Math.floor((day - since) / (DAYS_PER_YEAR / 12)));
}

/**
 * Tax on the capital gain of a sale, collected by the notary. `received` is
 * the price net of the agency's fees. The main residence is exempt.
 */
export function capitalGainsTax(
  ctx: Pick<SystemContext, 'content' | 'state'>,
  owned: OwnedProperty,
  received: Cents,
): CapitalGain {
  const { content, state } = ctx;
  const rules = content.taxes.capitalGains;
  const years = yearsHeld(owned, state.clock.date);
  let home: CapitalGain['home'] = null;
  if (state.player.homePropertyId === owned.property.id) {
    const today = toDayNumber(state.clock.date);
    const agreement = owned.sale?.agreement;
    const agreedDay = agreement ? agreement.deedDay - content.market.resale.deedDelayDays : today;
    const months = monthsLivedIn(state, agreedDay);
    home = { exempt: months >= rules.homeMinMonths, months, minMonths: rules.homeMinMonths };
    if (home.exempt) return { gain: 0, yearsHeld: years, tax: 0, home };
  }
  const price = owned.purchasePrice;
  const fees = Math.max(
    owned.acquisitionCost - price,
    Math.round(price * rules.acquisitionFeesFlatShare),
  );
  // Real works (not deducted from the rents) replace the flat allowance when they are higher.
  const ledger = state.tax.ledgers[owned.property.id];
  // Works of a property never let, or let furnished, were not deducted from the rents.
  const pending =
    ledger && (!ledger.category || taxCategory(content, ledger.category) !== 'bare')
      ? ledger.works
      : 0;
  const flat = years >= rules.worksFlatMinYears ? Math.round(price * rules.worksFlatShare) : 0;
  const works = Math.max(flat, owned.worksForCapitalGains + pending);
  const base = price + fees + works - owned.furnishedTax.buildingDepreciationDeducted;
  const gain = Math.max(0, received - base);
  const tax =
    Math.round(gain * (1 - allowance(rules.incomeTaxAllowances, years)) * rules.incomeTaxRate) +
    Math.round(
      gain *
        (1 - allowance(rules.socialAllowances, years)) *
        content.taxes.socialContributions.capitalGains,
    );
  return { gain, yearsHeld: years, tax, home };
}

export interface RegimeEstimate {
  propertyId: string;
  category: LeaseType;
  /** Household tax plus accountant this year, with this property in each regime. */
  micro: Cents;
  real: Cents;
  recommended: TaxRegime;
}

/**
 * Tax of the year so far, and for each let property the cost of each regime
 * (the others at their best): « impôt estimé selon chaque régime ».
 */
export function estimateRegimes(
  content: GameContent,
  state: GameState,
  today: number,
): { cost: Cents; assessment: TaxAssessment; properties: RegimeEstimate[] } {
  const { tax } = state;
  const inputs = taxInputs(content, state, today);
  const run = (list: TaxInput[]) =>
    bestTax(content, tax.year, tax.salary, tax.landlordDeficits, list);
  const best = run(inputs);
  const properties = inputs.map((input): RegimeEstimate => {
    const forced = (choice: TaxRegime) =>
      run(inputs.map((other) => (other === input ? { ...other, choice } : other))).cost;
    const micro = forced('micro');
    const real = forced('real');
    return {
      propertyId: input.propertyId,
      category: input.category,
      micro,
      real,
      recommended: real < micro ? 'real' : 'micro',
    };
  });
  return { cost: best.cost, assessment: best.assessment, properties };
}

/** The player's regime for a property ('auto' applies the cheapest at the yearly review). */
export function setTaxRegime(
  ctx: SystemContext,
  propertyId: string,
  regime: TaxRegimeChoice,
): 'property.unknown' | null {
  const owned = ctx.state.properties.find((o) => o.property.id === propertyId);
  if (!owned) return 'property.unknown';
  if (owned.taxRegime !== regime) owned.log.push({ kind: 'regime', day: ctx.today, regime });
  owned.taxRegime = regime;
  ledgerOf(ctx.state, owned).regime = regime;
  return null;
}
