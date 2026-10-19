import {
  type Artisan,
  findArtisan,
  findJob,
  type GameContent,
  type HazardRule,
  type Tier,
  type Trade,
} from '../content.ts';
import { annuityPayment, type Cents, toCents } from '../money.ts';
import { nextFloat, nextNormal, nextRange, pickWeighted } from '../random.ts';
import type {
  GameState,
  OwnedProperty,
  Property,
  Quote,
  WorkItem,
  WorksProject,
  WorksTask,
} from '../state.ts';
import { crisisFactor } from './crises.ts';
import type { SystemContext } from './context.ts';
import { modeOf } from './modes.ts';
import {
  dpeOf,
  energyNeeds,
  findItem,
  freezeItems,
  itemId,
  itemQuantity,
  itemRule,
  needsVacant,
} from './dwelling.ts';
import { dailyFreeTime } from './household.ts';
import { findOwned } from './renting.ts';
import { addWorks, ledgerOf } from './taxes.ts';
import { renownOf } from './cities.ts';
import { editableListing } from './listings.ts';
import { spendFreeTime, timeAvailableIn } from './travel.ts';

/**
 * Works (docs/03-systemes/05-travaux-et-copropriete.md): quotes from the
 * artisans of the address book, a schedule ordered by phase, hazards that
 * stop the works until the player decides, works done oneself on free time,
 * and at the end new states, a new DPE, a new value and rent.
 */

export type WorksRefusal =
  | 'property.unknown'
  | 'listing.unknown'
  | 'sale.agreed'
  | 'time.notEnoughFreeTime'
  | 'account.insufficientFunds'
  | 'works.unknownArtisan'
  | 'works.wrongTrade'
  | 'works.unknownItem'
  | 'works.notRenovable'
  | 'works.empty'
  | 'works.inProgress'
  | 'works.unknownQuote'
  | 'works.duplicateItem'
  | 'works.diyNotAllowed'
  | 'works.occupied'
  | 'works.noHazard';

export interface ItemChoice {
  itemId: string;
  tier: Tier;
}

export type HazardChoice = 'treat' | 'postpone' | 'eco';

/** Artisans of a city the player can call: the best ones join the book as works get done. */
export function knownArtisans(
  content: GameContent,
  state: GameState,
  cityId: string,
  trade?: Trade,
): Artisan[] {
  const done = state.worksDone[cityId] ?? 0;
  return content.artisans.filter(
    (artisan) =>
      artisan.cities.includes(cityId) &&
      artisan.unlockAfterWorks <= done &&
      (trade === undefined || artisan.trade === trade),
  );
}

function jobsWith(state: GameState, artisanId: string): number {
  return state.artisans[artisanId]?.jobs ?? 0;
}

/** Loyalty discount of an artisan. */
export function artisanDiscount(content: GameContent, state: GameState, artisanId: string) {
  const rules = content.works.artisans;
  return Math.min(rules.maxDiscount, rules.discountPerJob * jobsWith(state, artisanId));
}

/** Share of the waiting list skipped: loyalty, reputation and local renown. */
function queueCut(
  content: GameContent,
  state: GameState,
  artisanId: string,
  cityId: string,
): number {
  const rules = content.works.artisans;
  return Math.min(
    rules.maxQueueCut,
    rules.queueCutPerJob * jobsWith(state, artisanId) +
      rules.queueCutPerReputation * state.player.reputation +
      content.citiesRules.renown.queueCutPerPoint * renownOf(state, cityId),
  );
}

/** Reference price of an item at a tier, TTC, for this city and this state of the item. */
export function referenceCost(
  content: GameContent,
  property: Property,
  item: WorkItem,
  tier: Tier,
  state: number = item.state,
): Cents {
  const works = itemRule(content, item.kind).works;
  if (!works) return 0;
  const { cost } = works.tiers[tier];
  const quantity = itemQuantity(content, property, item);
  const index = content.works.cityCostIndex[property.cityId] ?? 1;
  const stateFactor = content.works.stateCostFactors[Math.round(state) - 1] ?? 1;
  return toCents(Math.round((cost.fixed + cost.perUnit * quantity) * index * stateFactor));
}

/** Calendar days of an artisan's work on an item. */
export function referenceDays(
  content: GameContent,
  property: Property,
  item: WorkItem,
  tier: Tier,
): number {
  const works = itemRule(content, item.kind).works;
  if (!works) return 0;
  const { days } = works.tiers[tier];
  return days.fixed + days.perUnit * itemQuantity(content, property, item);
}

/** Can the player do this item himself (painting for anyone, electricity for an electrician)? */
export function diyAllowed(content: GameContent, state: GameState, item: WorkItem): boolean {
  const diy = itemRule(content, item.kind).works?.diy;
  if (!diy) return false;
  if (diy.jobs === null) return true;
  return state.player.employed && diy.jobs.includes(findJob(content, state.player.jobId).id);
}

/** Free time and materials of doing an item oneself. */
export function diyCost(
  content: GameContent,
  property: Property,
  item: WorkItem,
  tier: Tier,
): { minutes: number; materials: Cents } {
  const works = itemRule(content, item.kind).works;
  const diy = works?.diy;
  if (!works || !diy) return { minutes: 0, materials: 0 };
  const quantity = itemQuantity(content, property, item);
  const minutes = Math.round(
    (diy.minutes.fixed + diy.minutes.perUnit * quantity) * content.works.tiers[tier].diyTime,
  );
  const materials = Math.round(
    referenceCost(content, property, item, tier) * (1 - works.labourShare),
  );
  return { minutes, materials };
}

function renovatable(content: GameContent, property: Property, choice: ItemChoice) {
  const item = findItem(property, choice.itemId);
  if (!item) return { refusal: 'works.unknownItem' as const };
  const works = itemRule(content, item.kind).works;
  if (!works) return { refusal: 'works.notRenovable' as const };
  return { item, works };
}

/** An artisan comes to quote some items of his trade (30 min of free time). */
export function requestQuote(
  ctx: SystemContext,
  propertyId: string,
  artisanId: string,
  choices: readonly ItemChoice[],
): WorksRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  const property = owned.property;
  const artisan = findArtisan(content, artisanId);
  if (!artisan || !knownArtisans(content, state, property.cityId).includes(artisan)) {
    return 'works.unknownArtisan';
  }
  if (choices.length === 0) return 'works.empty';
  if (new Set(choices.map((c) => c.itemId)).size !== choices.length) return 'works.duplicateItem';
  for (const choice of choices) {
    const found = renovatable(content, property, choice);
    if ('refusal' in found) return found.refusal;
    if (found.works.trade !== artisan.trade) return 'works.wrongTrade';
  }
  const minutes = content.works.quotes.minutes;
  if (!spendFreeTime(ctx, minutes, property.cityId)) return 'time.notEnoughFreeTime';
  writeQuote(ctx, owned, artisan, choices);
  return null;
}

/** The artisan's quote for these items (already checked), added to the property's quotes. */
function writeQuote(
  ctx: SystemContext,
  owned: OwnedProperty,
  artisan: Artisan,
  choices: readonly ItemChoice[],
): Quote {
  const { content, state } = ctx;
  const { property } = owned;
  const propertyId = property.id;
  const lines: Quote['items'] = [];
  const factor = artisan.priceFactor * (1 - artisanDiscount(content, state, artisan.id));
  for (const choice of choices) {
    const item = findItem(property, choice.itemId);
    if (!item) continue;
    const noise =
      (1 + content.works.quotes.noise * nextNormal(state.rng)) * crisisFactor(state, 'worksCosts');
    const price = toCents(
      Math.round((referenceCost(content, property, item, choice.tier) * factor * noise) / 100),
    );
    lines.push({
      itemId: choice.itemId,
      tier: choice.tier,
      price: Math.max(0, price),
      days: referenceDays(content, property, item, choice.tier),
    });
  }
  const queue = nextRange(state.rng, artisan.queueDays.min, artisan.queueDays.max);
  const quote: Quote = {
    id: `quote-${state.nextId++}`,
    artisanId: artisan.id,
    items: lines,
    total: lines.reduce((sum, line) => sum + line.price, 0),
    days: Math.max(1, Math.ceil(lines.reduce((sum, line) => sum + line.days, 0))),
    availableDay:
      ctx.today + Math.round(queue * (1 - queueCut(content, state, artisan.id, property.cityId))),
    expiresDay: ctx.today + content.works.quotes.validityDays,
  };
  owned.quotes = [...owned.quotes.filter((q) => q.expiresDay > ctx.today), quote];
  ctx.events.push({
    type: 'quoteReceived',
    propertyId,
    quoteId: quote.id,
    artisanId: artisan.id,
    total: quote.total,
    availableDay: quote.availableDay,
  });
  return quote;
}

/**
 * Hands works to the project manager (milestone 8): he asks the most reliable artisan of each
 * trade for a quote, signs them, and will treat the hazards; no free time, a fee on top.
 */
export function delegateWorks(
  ctx: SystemContext,
  propertyId: string,
  choices: readonly ItemChoice[],
): WorksRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  if (owned.works) return 'works.inProgress';
  if (choices.length === 0) return 'works.empty';
  if (new Set(choices.map((c) => c.itemId)).size !== choices.length) return 'works.duplicateItem';
  const byTrade = new Map<Trade, ItemChoice[]>();
  for (const choice of choices) {
    const found = renovatable(content, owned.property, choice);
    if ('refusal' in found) return found.refusal;
    byTrade.set(found.works.trade, [...(byTrade.get(found.works.trade) ?? []), choice]);
  }
  const known = knownArtisans(content, state, owned.property.cityId);
  const artisans = new Map<Trade, Artisan>();
  for (const trade of byTrade.keys()) {
    const best = known
      .filter((artisan) => artisan.trade === trade)
      .sort((a, b) => b.reliability - a.reliability)[0];
    if (!best) return 'works.unknownArtisan';
    artisans.set(trade, best);
  }
  const quoteIds: string[] = [];
  for (const [trade, items] of byTrade) {
    const artisan = artisans.get(trade);
    if (artisan) quoteIds.push(writeQuote(ctx, owned, artisan, items).id);
  }
  const refusal = startWorks(ctx, propertyId, quoteIds, []);
  if (refusal) {
    owned.quotes = owned.quotes.filter((quote) => !quoteIds.includes(quote.id));
    return refusal;
  }
  const project = owned.works as WorksProject | null;
  if (!project) return null;
  project.managed = true;
  const planned = project.tasks.reduce(
    (sum, task) => sum + task.items.reduce((s, line) => s + line.price, 0),
    0,
  );
  const fee = Math.round(planned * content.works.projectManager.feeShare);
  if (fee > 0) payWorks(ctx, owned, fee);
  ctx.events.push({ type: 'worksDelegated', propertyId, fee });
  return null;
}

/** Tasks of a project: one per artisan and phase, one per item done oneself. */
export function buildTasks(
  ctx: Pick<SystemContext, 'content' | 'state'>,
  owned: OwnedProperty,
  quotes: readonly Quote[],
  diy: readonly ItemChoice[],
  nextId: () => string,
): WorksTask[] {
  const { content } = ctx;
  const property = owned.property;
  const tasks: WorksTask[] = [];
  for (const quote of quotes) {
    const artisan = findArtisan(content, quote.artisanId);
    if (!artisan) continue;
    const byPhase = new Map<number, Quote['items']>();
    for (const line of quote.items) {
      const item = findItem(property, line.itemId);
      const phase = item ? (itemRule(content, item.kind).works?.phase ?? 1) : 1;
      byPhase.set(phase, [...(byPhase.get(phase) ?? []), line]);
    }
    for (const [phase, lines] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
      tasks.push({
        id: nextId(),
        artisanId: artisan.id,
        trade: artisan.trade,
        phase,
        items: lines.map(({ itemId: id, tier, price }) => ({ itemId: id, tier, price })),
        status: 'waiting',
        availableDay: quote.availableDay,
        days: Math.max(1, Math.ceil(lines.reduce((sum, line) => sum + line.days, 0))),
        startDay: null,
        endDay: null,
        overrun: 0,
        deposit: 0,
        minutesNeeded: 0,
        minutesDone: 0,
      });
    }
  }
  for (const choice of diy) {
    const item = findItem(property, choice.itemId);
    const works = item ? itemRule(content, item.kind).works : null;
    if (!item || !works) continue;
    const { minutes, materials } = diyCost(content, property, item, choice.tier);
    tasks.push({
      id: nextId(),
      artisanId: null,
      trade: works.trade,
      phase: works.phase,
      items: [{ itemId: choice.itemId, tier: choice.tier, price: materials }],
      status: 'waiting',
      availableDay: 0,
      days: 0,
      startDay: null,
      endDay: null,
      overrun: 0,
      deposit: 0,
      minutesNeeded: minutes,
      minutesDone: 0,
    });
  }
  return tasks.sort((a, b) => a.phase - b.phase);
}

/** Planned start and end of each task (the « frise »), from `today`. */
export function planSchedule(
  content: GameContent,
  state: GameState,
  tasks: readonly WorksTask[],
  today: number,
): { taskId: string; startDay: number; endDay: number }[] {
  const plan: { taskId: string; startDay: number; endDay: number }[] = [];
  const phases = [...new Set(tasks.map((task) => task.phase))].sort((a, b) => a - b);
  // Free time on a usual day, for the works done oneself.
  const perDay = Math.max(
    1,
    Math.min(content.works.diyDailyMaxMinutes, dailyFreeTime(content, state, state.clock.date)),
  );
  let phaseStart = today;
  for (const phase of phases) {
    let phaseEnd = phaseStart;
    for (const task of tasks.filter((t) => t.phase === phase)) {
      let startDay: number;
      let endDay: number;
      if (task.status === 'done') {
        startDay = task.startDay ?? today;
        endDay = task.endDay ?? today;
      } else if (task.status === 'running') {
        startDay = task.startDay ?? today;
        endDay =
          task.artisanId === null
            ? today + Math.ceil((task.minutesNeeded - task.minutesDone) / perDay)
            : Math.max(today, startDay + task.days);
      } else {
        // Waiting tasks start at the earliest on the next day.
        startDay = Math.max(phaseStart, task.availableDay, today + 1);
        endDay =
          startDay + (task.artisanId === null ? Math.ceil(task.minutesNeeded / perDay) : task.days);
      }
      plan.push({ taskId: task.id, startDay, endDay });
      phaseEnd = Math.max(phaseEnd, endDay);
    }
    phaseStart = phaseEnd;
  }
  return plan;
}

/** Pays a works bill: the works envelope of the loan first, then the account. */
export function payWorks(ctx: SystemContext, owned: OwnedProperty, amount: Cents): void {
  const fund = owned.worksFund;
  const fromFund = fund ? Math.max(0, Math.min(fund.amount, amount)) : 0;
  if (fund) fund.amount -= fromFund;
  ctx.state.player.balance -= amount - fromFund;
  if (owned.works) owned.works.paid += amount;
  addWorks(ctx.state, owned, amount);
}

/** Cash the player can put into works on this property today. */
function availableForWorks(state: GameState, owned: OwnedProperty): Cents {
  return Math.max(0, state.player.balance) + (owned.worksFund?.amount ?? 0);
}

/**
 * Signs the chosen quotes and plans the works done oneself: deposits are
 * paid now, the schedule runs by itself from tomorrow.
 */
export function startWorks(
  ctx: SystemContext,
  propertyId: string,
  quoteIds: readonly string[],
  diy: readonly ItemChoice[],
): WorksRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  if (owned.works) return 'works.inProgress';
  if (owned.sale?.agreement) return 'sale.agreed';
  if (quoteIds.length === 0 && diy.length === 0) return 'works.empty';
  const quotes: Quote[] = [];
  for (const id of quoteIds) {
    const quote = owned.quotes.find((q) => q.id === id);
    if (!quote || quote.expiresDay <= ctx.today) return 'works.unknownQuote';
    quotes.push(quote);
  }
  const itemIds = [
    ...quotes.flatMap((quote) => quote.items.map((line) => line.itemId)),
    ...diy.map((choice) => choice.itemId),
  ];
  if (new Set(itemIds).size !== itemIds.length) return 'works.duplicateItem';
  for (const choice of diy) {
    const found = renovatable(content, owned.property, choice);
    if ('refusal' in found) return found.refusal;
    if (!diyAllowed(content, state, found.item)) return 'works.diyNotAllowed';
  }
  let counter = 0;
  const projectId = `works-${state.nextId++}`;
  const tasks = buildTasks(ctx, owned, quotes, diy, () => `${projectId}-${++counter}`);
  if (owned.lease && needsVacant(content, owned.property, tasks)) return 'works.occupied';
  const depositShare = content.works.quotes.depositShare;
  for (const task of tasks) {
    if (task.artisanId === null) continue;
    task.deposit = Math.round(task.items.reduce((sum, line) => sum + line.price, 0) * depositShare);
  }
  const deposits = tasks.reduce((sum, task) => sum + task.deposit, 0);
  if (availableForWorks(state, owned) < deposits) return 'account.insufficientFunds';

  if (owned.rental && needsVacant(content, owned.property, tasks)) {
    owned.rental = null;
    ctx.events.push({ type: 'rentalWithdrawn', propertyId });
  }
  owned.quotes = owned.quotes.filter((q) => !quoteIds.includes(q.id));
  const project: WorksProject = {
    id: projectId,
    startDay: ctx.today,
    tasks,
    managed: false,
    transformation: null,
    hazard: null,
    dpeBefore: owned.property.dpe,
    paid: 0,
  };
  owned.works = project;
  if (deposits > 0) payWorks(ctx, owned, deposits);
  const planned = tasks.reduce(
    (sum, task) => sum + task.items.reduce((s, line) => s + line.price, 0),
    0,
  );
  const schedule = planSchedule(content, state, tasks, ctx.today);
  ctx.events.push({
    type: 'worksStarted',
    propertyId,
    projectId,
    plannedCost: planned,
    plannedEndDay: schedule.reduce((max, entry) => Math.max(max, entry.endDay), ctx.today),
  });
  return null;
}

function hazardChance(
  factor: number,
  property: Property,
  rule: HazardRule,
  item: WorkItem,
): number {
  if (!rule.items.includes(item.kind) || item.state > rule.maxState) return 0;
  return Math.min(1, rule.probability * rule.epochMultipliers[property.epoch] * factor);
}

/** Does starting this task reveal a hazard? Postponed ones come back for sure. */
function drawHazard(
  ctx: SystemContext,
  owned: OwnedProperty,
  task: WorksTask,
): WorksProject['hazard'] {
  const { content, state } = ctx;
  const property = owned.property;
  const project = owned.works;
  if (!project) return null;
  const inProject = new Set(project.tasks.flatMap((t) => t.items.map((line) => line.itemId)));
  for (const line of task.items) {
    const item = findItem(property, line.itemId);
    if (!item) continue;
    const postponed = property.postponedHazards.find((h) => h.itemId === line.itemId);
    for (const rule of content.works.hazards) {
      let happens = postponed?.hazardId === rule.id;
      if (!happens) {
        if (postponed) continue;
        const required = rule.requires;
        if (required) {
          const worst = property.items
            .filter((other) => other.kind === required.item)
            .some((other) => other.state <= required.maxState && !inProject.has(itemId(other)));
          if (!worst) continue;
        }
        const chance = hazardChance(modeOf(content, state).hazardFactor, property, rule, item);
        happens = chance > 0 && nextFloat(state.rng) < chance;
      }
      if (!happens) continue;
      const quantity =
        itemRule(content, item.kind).works?.basis === 'unit'
          ? 0
          : itemQuantity(content, property, item);
      const index = content.works.cityCostIndex[property.cityId] ?? 1;
      const euros =
        (nextRange(state.rng, rule.fixedCost.min, rule.fixedCost.max) +
          quantity * nextRange(state.rng, rule.costPerUnit.min, rule.costPerUnit.max)) *
        index;
      return {
        hazardId: rule.id,
        taskId: task.id,
        itemId: line.itemId,
        cost: toCents(Math.round(euros)),
        days: Math.round(nextRange(state.rng, rule.days.min, rule.days.max)),
        deadlineDay: ctx.today + content.works.hazardDecisionDays,
      };
    }
  }
  return null;
}

/** Starts a task; a hazard found on the way stops it (at most one hazard per task). */
function startTask(
  ctx: SystemContext,
  owned: OwnedProperty,
  task: WorksTask,
  drawHazards = true,
): void {
  const { content, state } = ctx;
  const project = owned.works;
  if (!project) return;
  const hazard = drawHazards ? drawHazard(ctx, owned, task) : null;
  if (hazard) {
    project.hazard = hazard;
    ctx.events.push({
      type: 'worksHazard',
      propertyId: owned.property.id,
      hazardId: hazard.hazardId,
      itemId: hazard.itemId,
      cost: hazard.cost,
      days: hazard.days,
      deadlineDay: hazard.deadlineDay,
    });
    return;
  }
  task.status = 'running';
  task.startDay = ctx.today;
  const artisan = task.artisanId === null ? undefined : findArtisan(content, task.artisanId);
  if (artisan) {
    const rules = content.works.artisans;
    const slack = 1 - artisan.reliability;
    task.overrun = slack * nextRange(state.rng, 0, rules.maxOverrun);
    const delay = slack * nextRange(state.rng, 0, rules.maxDelay);
    task.endDay = ctx.today + Math.max(1, Math.ceil(task.days * (1 + delay)));
  }
  ctx.events.push({
    type: 'worksTaskStarted',
    propertyId: owned.property.id,
    taskId: task.id,
    trade: task.trade,
    artisanId: task.artisanId,
  });
}

/** Final state of an item: artisans may leave it at 4, works done oneself vary more. */
function finalState(ctx: SystemContext, task: WorksTask, kind: WorkItem['kind']): number {
  const { content, state } = ctx;
  if (task.artisanId === null) {
    const quality = itemRule(content, kind).works?.diy?.quality;
    if (!quality) return 5;
    return Number(pickWeighted(state.rng, { 5: quality[5], 4: quality[4], 3: quality[3] }));
  }
  const artisan = findArtisan(content, task.artisanId);
  const chance = (1 - (artisan?.reliability ?? 1)) * content.works.artisans.imperfection;
  return nextFloat(state.rng) < chance ? 4 : 5;
}

function finishTask(ctx: SystemContext, owned: OwnedProperty, task: WorksTask): void {
  const { state } = ctx;
  const price = task.items.reduce((sum, line) => sum + line.price, 0);
  const bill = Math.round(price * (1 + task.overrun));
  payWorks(ctx, owned, bill - task.deposit);
  const done = new Map(task.items.map((line) => [line.itemId, line.tier]));
  owned.property.items = owned.property.items.map((item) => {
    const tier = done.get(itemId(item));
    if (!tier) return item;
    return { ...item, state: finalState(ctx, task, item.kind), tier, known: true };
  });
  owned.property.items = freezeItems(owned.property.items);
  task.status = 'done';
  task.endDay = ctx.today;
  if (task.artisanId) {
    const relation = state.artisans[task.artisanId] ?? { jobs: 0 };
    state.artisans[task.artisanId] = { jobs: relation.jobs + 1 };
  }
  ctx.events.push({
    type: 'worksTaskDone',
    propertyId: owned.property.id,
    taskId: task.id,
    cost: bill,
  });
}

function completeProject(ctx: SystemContext, owned: OwnedProperty, project: WorksProject): void {
  const { content, state } = ctx;
  const property = owned.property;
  const dpeAfter = dpeOf(content, energyNeeds(content, property));
  property.dpe = dpeAfter;
  const energy = content.taxes.landlordDeficit.energyRenovation;
  if (energy.fromLabels.includes(project.dpeBefore) && energy.toLabels.includes(dpeAfter)) {
    if (state.player.homePropertyId !== property.id) {
      ledgerOf(state, owned).energyRenovation = true;
    }
  }
  state.worksDone[property.cityId] = (state.worksDone[property.cityId] ?? 0) + 1;
  owned.works = null;
  ctx.events.push({
    type: 'worksCompleted',
    propertyId: property.id,
    cost: project.paid,
    dpeBefore: project.dpeBefore,
    dpeAfter,
  });
}

/** The player's answer to a hazard: treat it, put the item off, or treat it in the Éco range. */
export function answerHazard(
  ctx: SystemContext,
  propertyId: string,
  choice: HazardChoice,
): WorksRefusal | null {
  const owned = findOwned(ctx.state, propertyId);
  if (!owned) return 'property.unknown';
  const project = owned.works;
  const hazard = project?.hazard;
  if (!project || !hazard) return 'works.noHazard';
  resolveHazard(ctx, owned, project, hazard, choice);
  return null;
}

function resolveHazard(
  ctx: SystemContext,
  owned: OwnedProperty,
  project: WorksProject,
  hazard: NonNullable<WorksProject['hazard']>,
  choice: HazardChoice,
): void {
  const { content } = ctx;
  const property = owned.property;
  const task = project.tasks.find((t) => t.id === hazard.taskId);
  project.hazard = null;
  property.postponedHazards = property.postponedHazards.filter((h) => h.itemId !== hazard.itemId);
  if (choice === 'postpone') {
    property.postponedHazards = [
      ...property.postponedHazards,
      { hazardId: hazard.hazardId, itemId: hazard.itemId },
    ];
    if (task) {
      const line = task.items.find((l) => l.itemId === hazard.itemId);
      const item = findItem(property, hazard.itemId);
      if (item && line) {
        const saved = Math.round(referenceDays(content, property, item, line.tier));
        task.days = Math.max(1, task.days - saved);
      }
      task.items = task.items.filter((l) => l.itemId !== hazard.itemId);
      if (task.items.length === 0) {
        // Nothing left for this artisan: the deposit comes back.
        payWorks(ctx, owned, -task.deposit);
        task.deposit = 0;
        task.status = 'done';
        task.endDay = ctx.today;
      }
    }
  } else {
    payWorks(ctx, owned, hazard.cost);
    if (task) task.days += hazard.days;
    if (choice === 'eco' && task) {
      const item = findItem(property, hazard.itemId);
      task.items = task.items.map((line) => {
        if (line.itemId !== hazard.itemId || !item || line.tier === 'eco') return line;
        const ratio =
          referenceCost(content, property, item, 'eco') /
          Math.max(1, referenceCost(content, property, item, line.tier));
        return { ...line, tier: 'eco', price: Math.round(line.price * ratio) };
      });
    }
  }
  ctx.events.push({
    type: 'worksHazardResolved',
    propertyId: property.id,
    hazardId: hazard.hazardId,
    choice,
  });
  // The decision taken, the artisan gets to work.
  if (task?.status === 'waiting') startTask(ctx, owned, task, false);
}

/**
 * Every day: hazards waiting for an answer (treated by default after a few
 * days), tasks that end, works done oneself on free time, tasks whose phase
 * and artisan are ready, and the end of the project.
 */
export function runDailyWorks(ctx: SystemContext): void {
  const { content, state } = ctx;
  for (const owned of state.properties) {
    owned.quotes = owned.quotes.filter((quote) => quote.expiresDay > ctx.today);
    expireWorksFund(ctx, owned);
    const project = owned.works;
    // A transformation has no tasks: it ends on its own day (transformations.ts).
    if (!project || project.transformation) continue;
    // The project manager treats a hazard at once.
    if (project.hazard && project.managed) {
      resolveHazard(ctx, owned, project, project.hazard, 'treat');
    }
    if (project.hazard) {
      if (ctx.today < project.hazard.deadlineDay) {
        // The works wait for the decision.
        for (const task of project.tasks) {
          if (task.status === 'running' && task.endDay !== null) task.endDay += 1;
        }
        continue;
      }
      resolveHazard(ctx, owned, project, project.hazard, 'treat');
    }
    let busy = false;
    for (const task of project.tasks) {
      if (task.status !== 'running') continue;
      busy = true;
      if (task.artisanId === null) {
        const minutes = Math.min(
          timeAvailableIn(ctx, owned.property.cityId),
          content.works.diyDailyMaxMinutes,
          task.minutesNeeded - task.minutesDone,
        );
        if (minutes > 0) spendFreeTime(ctx, minutes, owned.property.cityId);
        task.minutesDone += minutes;
        if (task.minutesDone >= task.minutesNeeded) finishTask(ctx, owned, task);
      } else if (task.endDay !== null && ctx.today >= task.endDay) {
        finishTask(ctx, owned, task);
      }
    }
    for (const task of project.tasks) {
      if (task.status !== 'waiting' || project.hazard) continue;
      const ready = project.tasks.every(
        (other) => other.phase >= task.phase || other.status === 'done',
      );
      if (!ready || ctx.today < task.availableDay) continue;
      startTask(ctx, owned, task);
      if ((task.status as WorksTask['status']) === 'running') busy = true;
    }
    const lease = owned.lease;
    if (busy && lease) {
      lease.satisfaction = Math.max(
        0,
        lease.satisfaction - content.works.occupiedSatisfactionPerDay,
      );
    }
    if (!project.hazard && project.tasks.every((task) => task.status === 'done')) {
      completeProject(ctx, owned, project);
    }
  }
}

/**
 * The works envelope of a loan is kept for the property's bills; what is
 * left at the end goes back to the bank as an early repayment.
 */
function expireWorksFund(ctx: SystemContext, owned: OwnedProperty): void {
  const fund = owned.worksFund;
  if (!fund || ctx.today < fund.untilDay || owned.works) return;
  owned.worksFund = null;
  if (fund.amount <= 0) return;
  const loan = ctx.state.loans.find((candidate) => candidate.id === fund.loanId);
  if (!loan) {
    ctx.state.player.balance += fund.amount;
  } else {
    const repaid = Math.min(loan.remaining, fund.amount);
    loan.remaining -= repaid;
    ctx.state.player.balance += fund.amount - repaid;
    const months = loan.durationMonths - loan.paymentsMade;
    loan.monthlyPayment =
      loan.remaining > 0 && months > 0
        ? annuityPayment(loan.remaining, loan.ratePercent, months)
        : 0;
  }
  ctx.events.push({
    type: 'worksFundReturned',
    propertyId: owned.property.id,
    amount: fund.amount,
  });
}

/** Yearly wear: renovated items lose a state now and then, faster in the Éco range. */
export function runYearlyWear(ctx: SystemContext): void {
  const { content, state } = ctx;
  const floor = content.works.wearFloorState;
  for (const owned of state.properties) {
    let worn = false;
    const items = owned.property.items.map((item) => {
      if (item.state <= floor) return item;
      const chance = content.works.tiers[item.tier].wear * itemRule(content, item.kind).wearFactor;
      if (nextFloat(state.rng) >= chance) return item;
      worn = true;
      return { ...item, state: item.state - 1 };
    });
    if (worn) owned.property.items = freezeItems(items);
  }
}

/** A craftsman's diagnosis of a listing: the items of his trade are revealed. */
export function diagnose(ctx: SystemContext, listingId: string, trade: Trade): WorksRefusal | null {
  const { content, state } = ctx;
  const found = state.listings.find((l) => l.id === listingId);
  if (!found) return 'listing.unknown';
  if (knownArtisans(content, state, found.property.cityId, trade).length === 0) {
    return 'works.unknownArtisan';
  }
  const cost = toCents(content.works.diagnosis.cost);
  if (state.player.balance < cost) return 'account.insufficientFunds';
  state.player.balance -= cost;
  const listing = editableListing(ctx, found);
  const revealed: string[] = [];
  listing.property.items = listing.property.items.map((item) => {
    if (item.known || itemRule(content, item.kind).works?.trade !== trade) return item;
    revealed.push(itemId(item));
    return { ...item, known: true };
  });
  listing.property.items = freezeItems(listing.property.items);
  ctx.events.push({ type: 'diagnosisDone', listingId, trade, revealedItems: revealed, cost });
  return null;
}
