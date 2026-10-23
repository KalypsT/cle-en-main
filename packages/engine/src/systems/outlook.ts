import type { CalendarDate } from '../calendar.ts';
import { findAgency, findJob, type GameContent } from '../content.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, splitPayment } from '../money.ts';
import type { GameState } from '../state.ts';
import { isRemoteSelfManaged, remoteManagementFee } from './cities.ts';
import { signedLine } from './history.ts';
import { expectedSalary, livingCosts } from './household.ts';
import { ownerInsurance, recoverableCharges } from './renting.ts';

/**
 * « Prochain bilan » (notes of a test game): the next monthly statement, line by line,
 * as today's situation makes it, next to the last statement, so the player sees what
 * moved and where. It follows the monthly systems (household, leases, co-ownership,
 * loans, tax) without drawing anything: the salary at its average, the rents as due.
 */

/** Why a line may differ from the statement it will really be. */
export type OutlookNote =
  /** The salary's bonus is drawn each month: the outlook counts its average. */
  | 'variable'
  /** A short-term let earns with the season. */
  | 'seasonal'
  /** The tenant stopped paying and nobody insures it: no rent expected. */
  | 'unpaid'
  /** On the last statement only, never expected again by itself. */
  | 'oneOff';

export interface OutlookLine {
  kind: StatementLine['kind'];
  /** The property it is about; for a loan, the property it financed. */
  propertyId: string | null;
  loanId: string | null;
  /** Signed amount expected on the next statement (0 when no longer expected). */
  expected: Cents;
  /** Signed amount of the same line on the last statement (0 if absent); null without one. */
  last: Cents | null;
  note: OutlookNote | null;
}

export interface StatementOutlook {
  /** Day of the next statement (the 1st of next month). */
  date: CalendarDate;
  /** Date of the last statement; null before the first one. */
  lastDate: CalendarDate | null;
  lines: OutlookLine[];
  net: Cents;
  lastNet: Cents | null;
}

type Expected = StatementLine & { note?: OutlookNote };

function nextStatementDate(state: GameState): CalendarDate {
  const { year, month } = state.clock.date;
  return month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
}

/** The lines the monthly systems would write today, in their order. */
function expectedLines(content: GameContent, state: GameState): Expected[] {
  const { player } = state;
  const lines: Expected[] = [];
  const nextMonth = nextStatementDate(state).month;

  // Household (runMonthlyHousehold).
  if (player.employed) {
    const job = findJob(content, player.jobId);
    const variable = (job.averageMonthlyTotal ?? job.netMonthlySalary) > job.netMonthlySalary;
    lines.push({
      kind: 'salary',
      amount: expectedSalary(content, player),
      ...(variable ? { note: 'variable' as const } : {}),
    });
  }
  lines.push({ kind: 'rent', amount: player.monthlyRent });
  lines.push({ kind: 'livingCosts', amount: livingCosts(content, player) });

  // Leases (runMonthlyLeases).
  const rules = content.renting;
  for (const owned of state.properties) {
    const propertyId = owned.property.id;
    const isHome = player.homePropertyId === propertyId;
    const charges = owned.property.monthlyCharges;
    if (charges > 0) lines.push({ kind: 'propertyCharges', propertyId, amount: charges });
    if (!isHome) {
      lines.push({
        kind: 'ownerInsurance',
        propertyId,
        amount: ownerInsurance(content, owned.property),
      });
    }
    if (isRemoteSelfManaged(state, owned)) {
      lines.push({ kind: 'remoteManagement', propertyId, amount: remoteManagementFee(content) });
    }
    const lease = owned.lease;
    if (!lease) continue;
    const leaseRules = rules.leaseTypes[lease.leaseType];
    const recoverable = leaseRules.recoverableCharges
      ? recoverableCharges(content, owned.property)
      : 0;
    const shortTerm = leaseRules.shortTerm;
    const rent = shortTerm
      ? Math.round(lease.monthlyRent * (shortTerm.seasonality[nextMonth - 1] ?? 1))
      : lease.monthlyRent;
    const due = rent + recoverable;
    const arrears = lease.arrears;
    const stopped =
      arrears !== null && (arrears.reminderFailed || arrears.procedureEndDay !== null);
    if (!stopped || lease.insured) {
      lines.push({
        kind: 'rentalIncome',
        propertyId,
        amount: due,
        ...(shortTerm ? { note: 'seasonal' as const } : {}),
      });
      const agency = lease.agencyId === null ? undefined : findAgency(content, lease.agencyId);
      if (agency) {
        lines.push({
          kind: 'managementFees',
          propertyId,
          amount: Math.round(due * agency.feeShare),
        });
      }
    } else {
      lines.push({ kind: 'rentalIncome', propertyId, amount: 0, note: 'unpaid' });
    }
    if (lease.insured) {
      lines.push({
        kind: 'ownerInsurance',
        propertyId,
        amount: Math.round(due * rules.unpaidRentInsurance.premiumShare),
      });
    }
  }

  // Co-ownership calls for funds (runMonthlyCopro).
  for (const owned of state.properties) {
    const total = owned.coproCalls.reduce((sum, call) => sum + call.monthly, 0);
    if (total > 0) lines.push({ kind: 'coproCall', propertyId: owned.property.id, amount: total });
  }

  // Loans (runMonthlyLoanPayments): the last payment may be smaller.
  for (const loan of state.loans) {
    const due = Math.min(
      loan.monthlyPayment,
      loan.remaining + splitPayment(loan.remaining, loan.ratePercent, 0).interest,
    );
    const { interest, capital } = splitPayment(loan.remaining, loan.ratePercent, due);
    lines.push({ kind: 'loanPayment', loanId: loan.id, amount: due, interest, capital });
  }

  // Income tax (runMonthlyTaxInstalment).
  const { installments } = state.tax;
  if (installments.remaining > 0) {
    if (installments.monthly > 0) {
      lines.push({ kind: 'taxInstalment', amount: installments.monthly });
    } else if (installments.monthly < 0) {
      lines.push({ kind: 'taxRefund', amount: -installments.monthly });
    }
  }
  return lines;
}

/** The property a loan financed, running or closed. */
function loanProperty(state: GameState, loanId: string): string | null {
  return (
    state.loans.find((loan) => loan.id === loanId)?.propertyId ??
    state.closedLoans.find((loan) => loan.id === loanId)?.propertyId ??
    null
  );
}

function keyOf(line: StatementLine): string {
  const propertyId = 'propertyId' in line ? line.propertyId : '';
  const loanId = 'loanId' in line ? line.loanId : '';
  return `${line.kind}|${propertyId}|${loanId}`;
}

/** Net of next month's statement, from today's situation (salary at its average). */
export function monthlyStatementEstimate(content: GameContent, state: GameState): Cents {
  return expectedLines(content, state).reduce((sum, line) => sum + signedLine(line), 0);
}

/**
 * The next statement, line by line, against the last one: a line of the same kind for
 * the same property or loan is the same line (amounts of a kind summed, as both
 * insurances of a property).
 */
export function statementOutlook(content: GameContent, state: GameState): StatementOutlook {
  const last = state.lastStatement;
  const byKey = new Map<string, OutlookLine>();
  const lineOf = (line: StatementLine): OutlookLine => {
    const key = keyOf(line);
    let entry = byKey.get(key);
    if (!entry) {
      const loanId = 'loanId' in line ? line.loanId : null;
      entry = {
        kind: line.kind,
        propertyId: 'propertyId' in line ? line.propertyId : loanId && loanProperty(state, loanId),
        loanId,
        expected: 0,
        last: last ? 0 : null,
        note: null,
      };
      byKey.set(key, entry);
    }
    return entry;
  };
  for (const line of expectedLines(content, state)) {
    const entry = lineOf(line);
    entry.expected += signedLine(line);
    if (line.note) entry.note = line.note;
  }
  for (const line of last?.lines ?? []) {
    const entry = lineOf(line);
    entry.last = (entry.last ?? 0) + signedLine(line);
  }
  const lines = [...byKey.values()].filter(
    (line) => line.expected !== 0 || (line.last ?? 0) !== 0 || line.note === 'unpaid',
  );
  for (const line of lines) {
    if (line.expected === 0 && line.last !== 0 && line.note === null) {
      const oneOff = ['legalCosts', 'overdraftInterest', 'taxRefund'].includes(line.kind);
      if (oneOff) line.note = 'oneOff';
    }
  }
  return {
    date: nextStatementDate(state),
    lastDate: last ? { ...last.date } : null,
    lines,
    net: lines.reduce((sum, line) => sum + line.expected, 0),
    lastNet: last ? lines.reduce((sum, line) => sum + (line.last ?? 0), 0) : null,
  };
}
