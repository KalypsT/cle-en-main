import {
  type CatalogItem,
  type DpeLabel,
  DPE_LABELS,
  type HazardChoice,
  type ItemChoice,
  type Listing,
  type OwnedProperty,
  type Property,
  type Tier,
  type Trade,
  type WorksEstimate,
} from '@cle/engine';
import type { BotApi } from './driver.ts';

/**
 * How a bot renovates (docs/03-systemes/05): what it redoes, in which range,
 * with which artisans. It plays only through engine actions and reads only
 * what the player sees (expected states before a visit, quotes).
 */
export interface RenovationProfile {
  /**
   * `decency`: what stops a let (dead wiring, heating or water, a ruin);
   * `energy`: also the energy items until the DPE reaches `targetDpe`;
   * `full`: also every item at `maxState` or worse;
   * `profitable`: like `energy`, plus each item at `maxState` or worse whose
   * renovation adds more value than it costs.
   */
  scope: 'none' | 'decency' | 'energy' | 'full' | 'profitable';
  tier: Tier;
  maxState: number;
  targetDpe: DpeLabel;
  /** Picks the cheapest artisan of each trade, or the most reliable. */
  artisans: 'cheapest' | 'reliable';
  hazard: HazardChoice;
}

/** Energy items, tried in this order until the DPE target is reached. */
const ENERGY_ORDER = ['heating', 'insulation', 'windows', 'ventilation', 'roof', 'facade'];
const DECENT_STATE = 1.5;
const MONTH_KEY_DAYS = 30;

const worse = (a: DpeLabel, b: DpeLabel) => DPE_LABELS.indexOf(a) > DPE_LABELS.indexOf(b);

export interface WorksProjectPlan {
  choices: ItemChoice[];
  estimate: WorksEstimate;
}

/**
 * The items the bot would renovate on a listing or a property, and what the
 * engine estimates of it. `occupiedOnly`: a tenant is in place.
 */
export function chooseWorks(
  api: BotApi,
  id: string,
  profile: RenovationProfile,
  occupiedOnly = false,
): WorksProjectPlan | null {
  if (profile.scope === 'none') return null;
  const { engine, state } = api;
  const catalog = (engine.worksCatalog(state, id) ?? []).filter(
    (item) => item.trade !== null && (!occupiedOnly || item.occupied),
  );
  const stateOf = (item: CatalogItem) => item.state ?? item.expectedState;
  const chosen = new Map<string, Tier>();
  const add = (item: CatalogItem, tier: Tier = profile.tier) => chosen.set(item.id, tier);
  for (const item of catalog) {
    if (profile.scope === 'full' && stateOf(item) <= profile.maxState) add(item);
    // Making a home decent: the cheap range is enough.
    const critical = engine.content.works.items[item.kind].critical;
    if (critical && stateOf(item) < DECENT_STATE && !chosen.has(item.id)) add(item, 'eco');
  }
  const estimateOf = () =>
    engine.worksEstimate(
      state,
      id,
      [...chosen].map(([itemId, tier]) => ({ itemId, tier })),
    );
  let estimate = estimateOf();
  if (!estimate) return null;
  // Still indecent: the worst items too.
  if (estimate.blockAfter === 'rent.indecent') {
    for (const item of catalog) if (stateOf(item) <= 2 && !chosen.has(item.id)) add(item);
    estimate = estimateOf();
  }
  if (profile.scope !== 'decency' && estimate && worse(estimate.dpeAfter, profile.targetDpe)) {
    for (const kind of ENERGY_ORDER) {
      const item = catalog.find((candidate) => candidate.kind === kind);
      if (!item || chosen.has(item.id) || stateOf(item) >= 5) continue;
      add(item);
      estimate = estimateOf();
      if (!estimate || !worse(estimate.dpeAfter, profile.targetDpe)) break;
    }
  }
  if (profile.scope === 'profitable' && estimate) {
    const before = estimate.valueBefore;
    for (const item of catalog) {
      if (chosen.has(item.id) || stateOf(item) > profile.maxState) continue;
      const alone = engine.worksEstimate(state, id, [{ itemId: item.id, tier: profile.tier }]);
      if (alone && alone.valueAfter - before > alone.cost) add(item);
    }
    estimate = estimateOf();
  }
  if (!estimate || chosen.size === 0) return null;
  return { choices: [...chosen].map(([itemId, tier]) => ({ itemId, tier })), estimate };
}

function samePlan(a: WorksProjectPlan | null, b: WorksProjectPlan | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.choices.length !== b.choices.length) return false;
  for (let i = 0; i < a.choices.length; i++) {
    const x = a.choices[i];
    const y = b.choices[i];
    if (x?.itemId !== y?.itemId || x?.tier !== y?.tier) return false;
  }
  const keys = Object.keys(a.estimate) as (keyof WorksEstimate)[];
  return keys.every((key) => a.estimate[key] === b.estimate[key]);
}

/** Bot memory of the works in preparation: the quotes asked, by property. */
export class RenovationDesk {
  private readonly plans = new Map<string, { choices: ItemChoice[]; quotes: Map<Trade, string> }>();
  private readonly listingCache = new Map<
    string,
    { key: unknown; month: number; plan: WorksProjectPlan | null }
  >();
  private readonly profile: RenovationProfile;
  /**
   * Items chosen for each listing's dwelling (null: nothing to do), by its frozen items: a
   * listing copied for a price drop keeps them, and only works give a property new ones.
   */
  private readonly choices = new WeakMap<Property['items'], ItemChoice[] | null>();

  constructor(profile: RenovationProfile) {
    this.profile = profile;
  }

  /** Period of the listings' works plans: they are recomputed when it changes. */
  monthOf(api: BotApi): number {
    return Math.floor(api.today / MONTH_KEY_DAYS);
  }

  /**
   * The project of a listing, recomputed when its items or the month change. A recomputed
   * project equal to the previous one is the same object, so that what depends on it can be
   * kept.
   */
  projectFor(api: BotApi, listing: Listing): WorksProjectPlan | null {
    const month = this.monthOf(api);
    const cached = this.listingCache.get(listing.id);
    if (cached && cached.key === listing.property.items && cached.month === month) {
      return cached.plan;
    }
    let plan = this.planListing(api, listing);
    if (cached && cached.key === listing.property.items && samePlan(cached.plan, plan)) {
      plan = cached.plan;
    }
    this.listingCache.set(listing.id, { key: listing.property.items, month, plan });
    return plan;
  }

  /**
   * The items chosen for a listing depend only on its property (what the player knows of it),
   * except for the `profitable` scope, which weighs values: they are kept, and only their
   * estimate (prices, rents) is recomputed.
   */
  private planListing(api: BotApi, listing: Listing): WorksProjectPlan | null {
    const { items } = listing.property;
    if (this.profile.scope === 'profitable' || !Object.isFrozen(items)) {
      return chooseWorks(api, listing.id, this.profile);
    }
    const known = this.choices.get(items);
    if (known === undefined) {
      const plan = chooseWorks(api, listing.id, this.profile);
      this.choices.set(items, plan?.choices ?? null);
      return plan;
    }
    if (known === null) return null;
    const estimate = api.engine.worksEstimate(api.state, listing.id, known);
    return estimate ? { choices: known, estimate } : null;
  }

  forget(listingIds: ReadonlySet<string>): void {
    for (const id of this.listingCache.keys())
      if (!listingIds.has(id)) this.listingCache.delete(id);
  }

  private artisanFor(api: BotApi, cityId: string, trade: Trade): string | null {
    const known = api.engine
      .artisans(api.state, cityId)
      .map((entry) => entry.artisan)
      .filter((artisan) => artisan.trade === trade);
    known.sort((a, b) =>
      this.profile.artisans === 'cheapest'
        ? a.priceFactor - b.priceFactor
        : b.reliability - a.reliability,
    );
    return known[0]?.id ?? null;
  }

  /**
   * Daily: answers hazards, then for each property prepares or starts works
   * when there are some to do and the money is there (`reserve` in cents is
   * kept aside, except for works that make a home lettable again).
   */
  daily(api: BotApi, reserve: number, skip: (owned: OwnedProperty) => boolean): void {
    for (const owned of [...api.state.properties]) {
      const id = owned.property.id;
      if (owned.works) {
        if (owned.works.hazard)
          api.act({ type: 'works/hazard', propertyId: id, choice: this.profile.hazard });
        continue;
      }
      if (owned.sale || skip(owned)) continue;
      let plan = this.plans.get(id);
      if (!plan) {
        const occupied = owned.lease !== null;
        // A let home is looked at once a month only.
        if (occupied && api.state.clock.date.day !== 1) continue;
        const project = chooseWorks(api, id, this.profile, occupied);
        if (!project) continue;
        const fund = owned.worksFund?.amount ?? 0;
        // Works that make a vacant home lettable again do not wait for the reserve.
        const blocked = api.engine.rentQuote(api.state, id, 'bare')?.block ?? null;
        const urgent = !occupied && blocked !== null && project.estimate.blockAfter === null;
        const needed = Math.round(project.estimate.cost * 1.1) + (urgent ? 0 : reserve);
        if (api.state.player.balance + fund < needed) continue;
        plan = { choices: project.choices, quotes: new Map() };
        this.plans.set(id, plan);
      }
      if (!this.prepare(api, owned, plan)) continue;
      // Started, or refused (a quote expired, a deposit missing): planned again another day.
      api.act({
        type: 'works/start',
        propertyId: id,
        quoteIds: [...plan.quotes.values()],
        diy: [],
      });
      this.plans.delete(id);
    }
  }

  /** Asks the missing quotes (free time permitting); true once they are all in. */
  private prepare(
    api: BotApi,
    owned: OwnedProperty,
    plan: { choices: ItemChoice[]; quotes: Map<Trade, string> },
  ): boolean {
    const id = owned.property.id;
    const catalog = api.engine.worksCatalog(api.state, id) ?? [];
    const byTrade = new Map<Trade, ItemChoice[]>();
    for (const choice of plan.choices) {
      const trade = catalog.find((item) => item.id === choice.itemId)?.trade;
      if (trade) byTrade.set(trade, [...(byTrade.get(trade) ?? []), choice]);
    }
    for (const [trade, items] of byTrade) {
      if (plan.quotes.has(trade)) continue;
      const artisanId = this.artisanFor(api, owned.property.cityId, trade);
      if (!artisanId) return false;
      if (!api.act({ type: 'works/quote', propertyId: id, artisanId, items })) return false;
      const quotes = api.state.properties.find((o) => o.property.id === id)?.quotes ?? [];
      const quote = quotes.at(-1);
      if (quote) plan.quotes.set(trade, quote.id);
    }
    return plan.quotes.size === byTrade.size && byTrade.size > 0;
  }
}

export { worse as dpeWorse };
