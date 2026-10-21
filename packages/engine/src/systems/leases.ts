import { findAgency, findTenantProfile } from '../content.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt, nextRange, pickWeighted } from '../random.ts';
import type { Lease, OwnedProperty } from '../state.ts';
import { crisisFactor } from './crises.ts';
import type { SystemContext } from './context.ts';
import { modeOf } from './modes.ts';
import {
  DAYS_PER_YEAR,
  findOwned,
  letBanDay,
  lettingBlock,
  marketRent,
  monthsToDays,
  moveOut,
  ownerInsurance,
  recoverableCharges,
  rentLevel,
  type RentRefusal,
} from './renting.ts';
import { addCost, addRent } from './taxes.ts';
import { interpolateByState, weightedState } from './dwelling.ts';
import { spendFreeTime } from './travel.ts';
import { knownArtisans } from './works.ts';
import { isRemoteSelfManaged, remoteManagementFee } from './cities.ts';

/** The life of a lease (docs/03-systemes/04, « La vie du bail », « Les impayés »). */

const DAYS_PER_MONTH = 30;
const SATISFACTION_MAX = 100;

export function clampSatisfaction(value: number): number {
  return Math.min(SATISFACTION_MAX, Math.max(0, value));
}

function costRange(ctx: SystemContext, range: { min: number; max: number }): Cents {
  return toCents(Math.round(nextRange(ctx.state.rng, range.min, range.max)));
}

export function giveNotice(
  ctx: SystemContext,
  owned: OwnedProperty,
  lease: Lease,
  reason: 'departure' | 'lifeEvent' | 'incident' | 'buyout',
  months?: number,
): void {
  if (lease.noticeEndDay !== null) return;
  const noticeMonths = months ?? ctx.content.renting.leaseTypes[lease.leaseType].noticeMonths;
  lease.noticeEndDay = ctx.today + monthsToDays(noticeMonths);
  ctx.events.push({
    type: 'tenantGaveNotice',
    propertyId: owned.property.id,
    leaveDay: lease.noticeEndDay,
    reason,
  });
}

/** The satisfaction the tenant drifts towards: condition, and rent compared with the market. */
function satisfactionTarget(ctx: SystemContext, owned: OwnedProperty, lease: Lease): number {
  const { content, state } = ctx;
  const rules = content.renting.satisfaction;
  const market = marketRent(content, state, owned.property, lease.leaseType);
  const overPercent = market > 0 ? (lease.monthlyRent / market - 1) * 100 : 0;
  return clampSatisfaction(
    rules.base +
      interpolateByState(rules.byState, weightedState(content, owned.property)) -
      rules.perPercentOverMarket * overPercent,
  );
}

/**
 * Monthly flows of every property on the 1st: co-ownership charges and
 * insurance, then the rent (or an unpaid month), the agency's fees and the
 * unpaid-rent insurance; then satisfaction and departures.
 */
export function runMonthlyLeases(ctx: SystemContext, lines: StatementLine[]): void {
  const { content, state } = ctx;
  const rules = content.renting;
  let collected = false;
  for (const owned of state.properties) {
    const propertyId = owned.property.id;
    const isHome = state.player.homePropertyId === propertyId;
    const charges = owned.property.monthlyCharges;
    if (charges > 0) {
      state.player.balance -= charges;
      addCost(state, owned, charges);
      lines.push({ kind: 'propertyCharges', propertyId, amount: charges });
    }
    if (!isHome) {
      const insurance = ownerInsurance(content, owned.property);
      state.player.balance -= insurance;
      addCost(state, owned, insurance);
      lines.push({ kind: 'ownerInsurance', propertyId, amount: insurance });
    }
    if (isRemoteSelfManaged(state, owned)) {
      const fee = remoteManagementFee(content);
      state.player.balance -= fee;
      addCost(state, owned, fee);
      lines.push({ kind: 'remoteManagement', propertyId, amount: fee });
    }
    const lease = owned.lease;
    if (!lease) continue;
    const leaseRules = rules.leaseTypes[lease.leaseType];
    const recoverable = leaseRules.recoverableCharges
      ? recoverableCharges(content, owned.property)
      : 0;
    // A short-term let earns with the season, less the days the owner could not see to.
    const shortTerm = leaseRules.shortTerm;
    const rent = shortTerm
      ? Math.round(
          lease.monthlyRent *
            (shortTerm.seasonality[state.clock.date.month - 1] ?? 1) *
            Math.max(0, 1 - lease.missedDays / DAYS_PER_MONTH),
        )
      : lease.monthlyRent;
    lease.missedDays = 0;
    const due = rent + recoverable;
    const arrears = lease.arrears;
    const stopped =
      arrears !== null && (arrears.reminderFailed || arrears.procedureEndDay !== null);
    const pays =
      !stopped &&
      nextFloat(state.rng) >=
        rules.unpaid.monthlyProbability *
          crisisFactor(state, 'unpaidRents') *
          (1 - lease.tenant.reliability);
    if (!pays) {
      lease.arrears = arrears ?? {
        amount: 0,
        months: 0,
        sinceDay: ctx.today,
        reminderFailed: false,
        procedureEndDay: null,
      };
      lease.arrears.amount += due;
      lease.arrears.months += 1;
      lease.missedRents += 1;
      ctx.events.push({ type: 'rentMissed', propertyId, amount: due, insured: lease.insured });
      startProcedureIfDue(ctx, owned, lease, lines);
    }
    // The unpaid-rent insurance pays in the tenant's place.
    if (pays || lease.insured) {
      state.player.balance += due;
      addRent(state, owned, rent);
      addCost(state, owned, -recoverable);
      lines.push({ kind: 'rentalIncome', propertyId, amount: due });
      collected = true;
      const agency = lease.agencyId === null ? undefined : findAgency(content, lease.agencyId);
      if (agency) {
        const fees = Math.round(due * agency.feeShare);
        state.player.balance -= fees;
        addCost(state, owned, fees);
        lines.push({ kind: 'managementFees', propertyId, amount: fees });
      }
    }
    if (lease.insured) {
      const premium = Math.round(due * rules.unpaidRentInsurance.premiumShare);
      state.player.balance -= premium;
      addCost(state, owned, premium);
      lines.push({ kind: 'ownerInsurance', propertyId, amount: premium });
    }
    const target = satisfactionTarget(ctx, owned, lease);
    lease.satisfaction = clampSatisfaction(
      lease.satisfaction + rules.satisfaction.monthlyConvergence * (target - lease.satisfaction),
    );
    if (lease.noticeEndDay === null && lease.arrears?.procedureEndDay == null) {
      const { departurePivot, departureSpan } = rules.satisfaction;
      const unhappiness = 1 + Math.max(0, departurePivot - lease.satisfaction) / departureSpan;
      const chance =
        rules.leaseTypes[lease.leaseType].monthlyDepartureProbability *
        lease.tenant.mobility *
        unhappiness;
      if (nextFloat(state.rng) < chance) giveNotice(ctx, owned, lease, 'departure');
    }
  }
  if (collected) state.player.rentalHistoryMonths += 1;
}

function startProcedureIfDue(
  ctx: SystemContext,
  owned: OwnedProperty,
  lease: Lease,
  lines: StatementLine[],
): void {
  const { content, state } = ctx;
  const rules = content.renting.unpaid;
  const arrears = lease.arrears;
  if (!arrears || arrears.procedureEndDay !== null || arrears.months < rules.procedureAfterMonths) {
    return;
  }
  // A tenant who is leaving anyway is not taken to court: the deposit covers what it can.
  if (lease.noticeEndDay !== null) return;
  const months = nextInt(state.rng, rules.procedureMonths.min, rules.procedureMonths.max);
  arrears.procedureEndDay = ctx.today + monthsToDays(months);
  // The insurer pays the procedure of an insured lease.
  const cost = lease.insured ? 0 : costRange(ctx, rules.procedureCost);
  if (cost > 0) {
    state.player.balance -= cost;
    addCost(state, owned, cost);
    lines.push({ kind: 'legalCosts', propertyId: owned.property.id, amount: cost });
  }
  ctx.events.push({
    type: 'procedureStarted',
    propertyId: owned.property.id,
    evictionDay: arrears.procedureEndDay,
    cost,
  });
}

function inWinterTruce(ctx: SystemContext): boolean {
  const { fromMonth, toMonth } = ctx.content.renting.unpaid.winterTruce;
  const month = ctx.state.clock.date.month;
  return fromMonth <= toMonth
    ? month >= fromMonth && month <= toMonth
    : month >= fromMonth || month <= toMonth;
}

/** Spends the owner's free time on a task; false if there is not enough today. */
function useFreeTime(ctx: SystemContext, owned: OwnedProperty, lease: Lease, minutes: number) {
  if (lease.agencyId !== null) return true;
  return spendFreeTime(ctx, minutes, owned.property.cityId);
}

/** Departures, eviction, reminders, lease terms, yearly revision and life events, incidents. */
export function runDailyLeases(ctx: SystemContext): void {
  const { content, state } = ctx;
  const rules = content.renting;
  for (const owned of [...state.properties]) {
    const lease = owned.lease;
    if (!lease) continue;
    const propertyId = owned.property.id;

    // End of the notice: the exit inventory needs the owner (or the agency).
    if (lease.noticeEndDay !== null && ctx.today >= lease.noticeEndDay) {
      if (useFreeTime(ctx, owned, lease, rules.selfManagement.moveOutMinutes)) {
        moveOut(ctx, owned, 'notice');
      }
      continue;
    }

    const arrears = lease.arrears;
    if (arrears?.procedureEndDay != null) {
      if (ctx.today >= arrears.procedureEndDay && !inWinterTruce(ctx)) {
        state.player.reputation = Math.max(
          0,
          state.player.reputation - rules.unpaid.reputationPenalty,
        );
        moveOut(ctx, owned, 'evicted');
        continue;
      }
    } else if (
      arrears &&
      !arrears.reminderFailed &&
      ctx.today >= arrears.sinceDay + rules.unpaid.reminderAfterDays &&
      useFreeTime(ctx, owned, lease, rules.selfManagement.reminderMinutes)
    ) {
      const settled =
        nextFloat(state.rng) < rules.unpaid.reminderSuccess * lease.tenant.reliability;
      if (settled) {
        // An insurer already paid: the tenant's late payment goes to it.
        if (!lease.insured) {
          state.player.balance += arrears.amount;
          const charges = recoverableCharges(content, owned.property) * arrears.months;
          addRent(state, owned, arrears.amount - charges);
          addCost(state, owned, -charges);
        }
        lease.arrears = null;
      } else {
        arrears.reminderFailed = true;
      }
      ctx.events.push({ type: 'reminderSent', propertyId, settled });
    }

    if (ctx.today >= lease.termDay) renewOrEnd(ctx, owned, lease);
    if (!owned.lease) continue;
    if (ctx.today >= lease.anniversaryDay) anniversary(ctx, owned, lease);
    // Short-term let managed by the owner: check-ins and cleaning every day.
    const shortTerm = rules.leaseTypes[lease.leaseType].shortTerm;
    if (shortTerm && !useFreeTime(ctx, owned, lease, shortTerm.selfMinutesPerDay)) {
      lease.missedDays += 1;
    }
    dailyIncident(ctx, owned, lease);
  }
}

function renewOrEnd(ctx: SystemContext, owned: OwnedProperty, lease: Lease): void {
  const { content } = ctx;
  const rules = content.renting.leaseTypes[lease.leaseType];
  const student =
    findTenantProfile(content, lease.tenant.profileId).contract === 'student' &&
    rules.studentTermMonths !== null;
  if (lettingBlock(content, owned.property, ctx.today) === 'rent.dpeBanned') {
    moveOut(ctx, owned, 'dpe');
    return;
  }
  if (student) {
    moveOut(ctx, owned, 'endOfTerm');
    return;
  }
  lease.termDay += monthsToDays(rules.termMonths);
  ctx.events.push({ type: 'leaseRenewed', propertyId: owned.property.id, termDay: lease.termDay });
}

function anniversary(ctx: SystemContext, owned: OwnedProperty, lease: Lease): void {
  const { content, state } = ctx;
  const rules = content.renting;
  const propertyId = owned.property.id;
  lease.anniversaryDay += DAYS_PER_YEAR;
  // Yearly revision: follows the neighbourhood's rents, never down, capped (like the IRL).
  const level = rentLevel(content, state, owned.property);
  const ratio = Math.min(
    1 + rules.rentRevision.maxYearlyPercent / 100,
    Math.max(1, level / lease.revisionFactor),
  );
  lease.revisionFactor = level;
  const revised = Math.round(lease.monthlyRent * ratio);
  if (revised !== lease.monthlyRent) {
    lease.monthlyRent = revised;
    ctx.events.push({ type: 'rentRevised', propertyId, monthlyRent: revised });
  }
  // At most one life event a year.
  if (nextFloat(state.rng) >= rules.lifeEvents.yearlyProbability) return;
  const eligible = rules.lifeEvents.events.filter(
    (e) => !e.profiles || e.profiles.includes(lease.tenant.profileId),
  );
  if (eligible.length === 0) return;
  const eventId = pickWeighted(
    state.rng,
    Object.fromEntries(eligible.map((e) => [e.id, e.weight])),
  );
  const event = eligible.find((e) => e.id === eventId);
  if (!event) return;
  lease.tenant.mobility *= event.mobilityFactor;
  lease.satisfaction = clampSatisfaction(lease.satisfaction + event.satisfaction);
  ctx.events.push({ type: 'tenantLifeEvent', propertyId, eventId });
  if (event.requestCost) {
    const cost = costRange(ctx, event.requestCost);
    state.player.balance -= cost;
    addCost(state, owned, cost);
  }
  if (nextFloat(state.rng) < event.noticeChance) {
    giveNotice(ctx, owned, lease, 'lifeEvent', event.noticeMonths ?? undefined);
  }
}

function dailyIncident(ctx: SystemContext, owned: OwnedProperty, lease: Lease): void {
  const { content, state } = ctx;
  const rules = content.renting;
  // A shop's tenant sees to his own repairs; a parking space has none.
  if (!rules.leaseTypes[lease.leaseType].incidents) return;
  const propertyId = owned.property.id;
  const incident = lease.incident;
  if (incident) {
    if (incident.repair && ctx.today >= incident.repair.day) {
      finishRepair(ctx, owned, lease, incident.repair.cost);
      return;
    }
    const kind = rules.incidents.find((k) => k.id === incident.kindId);
    lease.satisfaction = clampSatisfaction(lease.satisfaction - (kind?.dailySatisfactionLoss ?? 0));
    if (!incident.repair && ctx.today - incident.day >= rules.incidentPatienceDays) {
      giveNotice(ctx, owned, lease, 'incident');
    }
    return;
  }
  // Each incident is more frequent when its item is worn (the worst one of its kind).
  const chances = rules.incidents.map((k) => {
    const worst = owned.property.items
      .filter((item) => item.kind === k.item)
      .reduce((min, item) => Math.min(min, item.state), 5);
    return [
      k.id,
      k.monthlyProbability * interpolateByState(rules.incidentStateFactors, worst),
    ] as const;
  });
  const total =
    chances.reduce((sum, [, chance]) => sum + Number(chance), 0) *
    modeOf(content, state).incidentFactor;
  if (nextFloat(state.rng) >= total / DAYS_PER_MONTH) return;
  const kindId = pickWeighted(state.rng, Object.fromEntries(chances));
  const kind = rules.incidents.find((k) => k.id === kindId);
  if (!kind) return;
  lease.incident = { id: `incident-${state.nextId++}`, kindId, day: ctx.today, repair: null };
  lease.satisfaction = clampSatisfaction(lease.satisfaction - kind.satisfactionHit);
  ctx.events.push({ type: 'incidentReported', propertyId, kindId });
  // An agency calls its artisan right away.
  const agency = lease.agencyId === null ? undefined : findAgency(content, lease.agencyId);
  if (agency) {
    lease.incident.repair = {
      day: ctx.today + nextInt(state.rng, agency.incidentDays.min, agency.incidentDays.max),
      cost: costRange(ctx, kind.artisanCost),
    };
  }
}

function finishRepair(ctx: SystemContext, owned: OwnedProperty, lease: Lease, cost: Cents): void {
  const incident = lease.incident;
  if (!incident) return;
  ctx.state.player.balance -= cost;
  addCost(ctx.state, owned, cost);
  lease.incident = null;
  owned.log.push({ kind: 'incident', day: ctx.today, kindId: incident.kindId, cost });
  ctx.events.push({
    type: 'incidentRepaired',
    propertyId: owned.property.id,
    kindId: incident.kindId,
    cost,
  });
}

/** The owner fixes an incident himself (now, if he has the time) or books an artisan. */
export function repairIncident(
  ctx: SystemContext,
  propertyId: string,
  method: 'self' | 'artisan',
): RentRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  const lease = owned.lease;
  if (!lease) return 'rent.noLease';
  const incident = lease.incident;
  if (!incident) return 'rent.noIncident';
  if (incident.repair) return 'rent.repairBooked';
  const kind = content.renting.incidents.find((k) => k.id === incident.kindId);
  if (!kind) return 'rent.noIncident';
  if (method === 'self') {
    if (!kind.selfRepair) return 'rent.noSelfRepair';
    if (!spendFreeTime(ctx, kind.selfMinutes, owned.property.cityId)) {
      return 'time.notEnoughFreeTime';
    }
    finishRepair(ctx, owned, lease, costRange(ctx, kind.selfCost));
    return null;
  }
  // The cheapest artisan of the trade in the address book.
  const trade = content.works.items[kind.item].works?.trade;
  const artisan = trade
    ? knownArtisans(content, state, owned.property.cityId, trade).sort(
        (a, b) => a.priceFactor - b.priceFactor,
      )[0]
    : undefined;
  const day = ctx.today + nextInt(state.rng, kind.artisanDays.min, kind.artisanDays.max);
  const cost = Math.round(costRange(ctx, kind.artisanCost) * (artisan?.priceFactor ?? 1));
  if (day <= ctx.today) finishRepair(ctx, owned, lease, cost);
  else incident.repair = { day, cost };
  return null;
}

/** Yearly warning for the properties a DPE ban will soon stop from being let again. */
export function runYearlyDpeWarnings(ctx: SystemContext): void {
  const { content, state } = ctx;
  const horizon = ctx.today + monthsToDays(content.renting.dpe.warningMonths);
  for (const owned of state.properties) {
    const ban = letBanDay(content, owned.property.dpe);
    if (ban !== null && ban > ctx.today && ban <= horizon) {
      ctx.events.push({ type: 'dpeWarning', propertyId: owned.property.id, banDay: ban });
    }
  }
}
