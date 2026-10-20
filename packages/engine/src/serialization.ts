import { z } from 'zod';
import { isValidDate, toDayNumber } from './calendar.ts';
import {
  ADVICE_KINDS,
  CHRONICLE_KINDS,
  DPE_LABELS,
  EPOCHS,
  LEASE_TYPES,
  TIERS,
} from './content-constants.ts';
import type { Condition, GameContent, ItemKind } from './content.ts';
import { hashFloat, hashNormal } from './random.ts';
import {
  blankItems,
  calibrateEnergy,
  clampState,
  freezeDwelling,
  itemId,
  layoutSpaces,
} from './systems/dwelling.ts';
import { toCents } from './money.ts';
import {
  FORMAT_VERSION,
  type GameState,
  type Lease,
  type OwnedProperty,
  type Property,
} from './state.ts';
import { initialBankRelations } from './systems/banking.ts';
import { seedListings } from './systems/listings.ts';
import { initialCityMarkets } from './systems/prices.ts';
import {
  lettingBlock,
  marketRent,
  monthsToDays,
  recoverableCharges,
  rentLevel,
  DAYS_PER_YEAR,
} from './systems/renting.ts';
import { initialRivals } from './systems/rivals.ts';
import { initialTaxState, ledgerOf } from './systems/taxes.ts';
import { drawTenant } from './systems/tenants.ts';

/** What a migration may read besides the old save. */
export interface MigrationContext {
  content: GameContent;
}

/** Upgrades a raw state from version N to version N + 1. */
export type Migration = (
  raw: Record<string, unknown>,
  context: MigrationContext,
) => Record<string, unknown>;

/** Migrations keyed by the version they upgrade from. */
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/**
 * Production migrations. To change the save format: bump FORMAT_VERSION, add
 * the migration from the previous version here, and test it.
 */
export const MIGRATIONS: MigrationRegistry = {
  /**
   * Version 1 (milestone 0) had no economy, only a demo die. The player gets
   * the standard starting conditions with the default job.
   */
  1: (raw, { content }) => {
    const { demo: _demo, ...rest } = raw;
    void _demo;
    const job = content.jobs.find((candidate) => candidate.id === content.start.defaultJobId);
    if (!job) throw new SaveFormatError('invalidState', 'Default job missing from content');
    return {
      ...rest,
      nextId: 1,
      player: {
        jobId: job.id,
        employed: true,
        balance: toCents(content.start.savings),
        overdraftDays: 0,
        overdraftInterestThisMonth: 0,
        monthlyRent: toCents(content.start.monthlyRent),
        freeTimeMinutes: 0,
        reputation: content.start.reputation,
        rentalHistoryMonths: 0,
      },
      banks: initialBankRelations(content, job.bankTrust),
      market: { ratePercent: content.marketRate.startPercent, cyclePhase: 0 },
      loans: [],
    };
  },
  /**
   * Version 2 (milestone 1a) had no property market. Loans get no property,
   * prices start from the city data brought to the save's date, and the
   * market is stocked as at a game start, from the save's own random state.
   */
  2: (raw, { content }) => {
    const market = raw.market as { ratePercent: number; cyclePhase: number };
    const clock = raw.clock as GameState['clock'];
    const loans = (raw.loans as Record<string, unknown>[]).map((loan) => ({
      ...loan,
      propertyId: null,
    }));
    const state = {
      ...raw,
      market: {
        ...market,
        laggedRatePercent: market.ratePercent,
        cities: initialCityMarkets(content, clock.date),
      },
      loans,
      listings: [],
      purchases: [],
      properties: [],
      agenda: [],
    } as unknown as GameState;
    seedListings(
      { content, state, events: [], today: toDayNumber(clock.date) },
      content.start.cityId,
    );
    return state as unknown as Record<string, unknown>;
  },
  /**
   * Version 3 (milestone 1b) had no rivals, no rents and no bankruptcy. Owned
   * properties find a tenant from the next day, offers and agreements came
   * from households, and the rivals start with their initial budgets.
   */
  3: (raw, { content }) => {
    const clock = raw.clock as GameState['clock'];
    const today = toDayNumber(clock.date);
    const properties = (raw.properties as Record<string, unknown>[]).map((owned) => {
      const sale = owned.sale as Record<string, unknown> | null;
      return {
        ...owned,
        sale: sale && {
          ...sale,
          offers: (sale.offers as Record<string, unknown>[]).map((offer) => ({
            ...offer,
            buyerId: null,
          })),
          agreement: sale.agreement && {
            ...(sale.agreement as Record<string, unknown>),
            buyerId: null,
          },
        },
        lease: null,
        vacantUntilDay: today + 1,
      };
    });
    return {
      ...raw,
      player: { ...(raw.player as Record<string, unknown>), bankruptDay: null },
      properties,
      rivals: initialRivals(content),
    };
  },
  /**
   * Version 4 (milestone 1c) had a provisional lease: one rent, charges
   * included, and 30 % kept for the owner's costs. A let property gets a
   * bare lease managed by the owner, with a tenant drawn from the save's
   * random state, at the old rent without the recoverable charges; its
   * deposit reaches the account. A vacant property is offered for rent at
   * the market rent when the law allows it. Taxes start with this year.
   */
  4: (raw, { content }) => {
    const state = raw as unknown as GameState;
    const today = toDayNumber(state.clock.date);
    const ctx = { content, state, events: [], today };
    const rules = content.renting.leaseTypes.bare;
    const player = { ...(raw.player as Record<string, unknown>), homePropertyId: null };
    state.player = player as unknown as GameState['player'];
    state.tax = initialTaxState(state.clock.date.year);
    const old = raw.properties as (Record<string, unknown> & {
      lease: { monthlyRent: number; startDay: number } | null;
    })[];
    state.properties = old.map((entry) => {
      const { vacantUntilDay: _vacant, lease: oldLease, ...rest } = entry;
      void _vacant;
      const owned = {
        ...rest,
        rental: null,
        lease: null,
        furniture: null,
        taxRegime: 'auto',
        furnishedTax: { deferredDepreciation: 0, deficitCarry: 0, buildingDepreciationDeducted: 0 },
      } as unknown as OwnedProperty;
      const property = owned.property;
      if (oldLease) {
        const monthlyRent = Math.max(
          100,
          oldLease.monthlyRent - recoverableCharges(content, property),
        );
        const market = marketRent(
          content,
          state,
          upgradeProperty(content, state.seed, property),
          'bare',
        );
        let termDay = oldLease.startDay + monthsToDays(rules.termMonths);
        while (termDay <= today) termDay += monthsToDays(rules.termMonths);
        let anniversaryDay = oldLease.startDay + DAYS_PER_YEAR;
        while (anniversaryDay <= today) anniversaryDay += DAYS_PER_YEAR;
        const deposit = monthlyRent * rules.depositMonths;
        const lease: Lease = {
          leaseType: 'bare',
          tenant: drawTenant(ctx, 'bare', monthlyRent, market, undefined),
          monthlyRent,
          startDay: oldLease.startDay,
          termDay,
          anniversaryDay,
          revisionFactor: rentLevel(content, state, property),
          deposit,
          agencyId: null,
          insured: false,
          satisfaction: content.renting.satisfaction.initial,
          noticeEndDay: null,
          incident: null,
          arrears: null,
          missedDays: 0,
          buyoutRefusedDay: null,
        };
        owned.lease = lease;
        state.player.balance += deposit;
      } else if (
        !lettingBlock(content, upgradeProperty(content, state.seed, property), today) &&
        !owned.sale?.agreement
      ) {
        owned.rental = {
          leaseType: 'bare',
          monthlyRent: marketRent(
            content,
            state,
            upgradeProperty(content, state.seed, property),
            'bare',
          ),
          agencyId: null,
          insured: false,
          listedDay: today,
          applications: [],
        };
      }
      ledgerOf(state, owned);
      return owned;
    });
    return state as unknown as Record<string, unknown>;
  },
  /**
   * Version 5 (milestone 2) had a simplified condition: five global levels
   * and hidden defects. Each property gets its rooms and items, drawn around
   * its old condition with stable per-property draws (the world's random
   * state is untouched); a defect becomes its item at state 1 (humidity and
   * dry rot a postponed hazard), noisy neighbours stay a nuisance. The
   * energy model is calibrated on the old DPE. Owned items are known, a
   * visited listing's rooms too. No works, quotes or meetings yet.
   */
  5: (raw, { content }) => {
    const seed = raw.seed as number;
    const upgrade = (property: Record<string, unknown>, known: 'all' | 'visible' | 'none') =>
      upgradeProperty(content, seed, property, known);
    const listings = (raw.listings as Record<string, unknown>[]).map((listing) => ({
      ...listing,
      property: upgrade(
        listing.property as Record<string, unknown>,
        listing.visited ? 'visible' : 'none',
      ),
    }));
    const purchases = (raw.purchases as Record<string, unknown>[]).map((purchase) => ({
      ...purchase,
      property: upgrade(purchase.property as Record<string, unknown>, 'visible'),
      applications: (purchase.applications as Record<string, unknown>[]).map((a) => ({
        ...a,
        works: 0,
      })),
    }));
    const properties = (raw.properties as Record<string, unknown>[]).map((owned) => ({
      ...owned,
      property: upgrade(owned.property as Record<string, unknown>, 'all'),
      furnishedTax: { ...(owned.furnishedTax as Record<string, unknown>), works: [] },
      quotes: [],
      works: null,
      worksFund: null,
      worksForCapitalGains: 0,
      coproMeeting: null,
      coproCalls: [],
    }));
    const rivals = Object.fromEntries(
      Object.entries(raw.rivals as Record<string, Record<string, unknown>>).map(([id, rival]) => [
        id,
        {
          ...rival,
          projects: (rival.projects as Record<string, unknown>[]).map((project) => ({
            ...project,
            property: upgrade(project.property as Record<string, unknown>, 'none'),
          })),
        },
      ]),
    );
    const tax = raw.tax as Record<string, unknown>;
    const ledgers = Object.fromEntries(
      Object.entries(tax.ledgers as Record<string, Record<string, unknown>>).map(([id, l]) => [
        id,
        { ...l, works: 0, energyRenovation: false },
      ]),
    );
    return {
      ...raw,
      listings,
      purchases,
      properties,
      rivals,
      tax: { ...tax, ledgers },
      artisans: {},
      worksDone: {},
    };
  },
  /**
   * Version 6 (milestone 3) had no player identity nor interface data: the
   * player gets the default name and avatar, the tutorial is off (the game is
   * already under way), and the wealth curve starts at the next month.
   */
  6: (raw, { content }) => ({
    ...raw,
    player: {
      ...(raw.player as Record<string, unknown>),
      name: content.start.defaultPlayerName,
      avatar: { face: 0, hair: 0, skin: 0, outfit: 0 },
    },
    favorites: [],
    tutorial: { enabled: false, step: 0 },
    history: [],
    lastStatement: null,
  }),
  /**
   * Version 7 (milestones 4 and 5) had no progression nor catalogue of
   * events: the game is in the default mode, holds the starting title and
   * gets its counters from what it owns (the past is not replayed). Titles
   * and achievements already deserved are earned on the next day.
   */
  7: (raw, { content }) => {
    const properties = (raw.properties as { lease: unknown }[] | undefined) ?? [];
    const player = raw.player as { reputation?: number } | undefined;
    const reputation = player?.reputation ?? content.start.reputation;
    const startDate = raw.startDate as { year: number; month: number; day: number };
    const history = ((raw.history as Record<string, unknown>[] | undefined) ?? []).map((point) => ({
      ...point,
      monthlyRent: 0,
      reputation,
    }));
    const agenda = ((raw.agenda as Record<string, unknown>[] | undefined) ?? []).map((item) => ({
      ...item,
      kind: 'visit',
    }));
    return {
      ...raw,
      agenda,
      history,
      modeId: content.modes.defaultModeId,
      rewinds: 0,
      gameOver: null,
      progress: {
        titles: content.titles.filter((t) => t.step === 0).map((t) => ({ id: t.id, day: 0 })),
        achievements: [],
        counters: {
          purchases: properties.length,
          leasesSigned: properties.filter((owned) => owned.lease !== null).length,
        },
        records: { bestCapitalGain: 0, biggestWorks: 0, bestMonth: 0, maxNetWorth: 0 },
        troubledYear: false,
        challenge: null,
        challengeHistory: [],
        nextChallengeDay: 0,
      },
      chronicle: [{ day: toDayNumber(startDate), kind: 'start', ref: null, amount: null }],
      catalog: { pending: [], lastDay: {}, anecdotes: [] },
      lastYearReview: null,
    };
  },
  /**
   * Version 8 (milestone 6) played in Dole only. The player's base is the city
   * of his home (Dole when renting), nothing is renown yet, and the cities
   * added since get their price levels and a first stock of listings from the
   * save's own random state; Dole's market is left as it was.
   */
  8: (raw, { content }) => {
    const player = raw.player as Record<string, unknown>;
    const properties = (raw.properties as { property: { id: string; cityId: string } }[]) ?? [];
    const home = properties.find((owned) => owned.property.id === player.homePropertyId);
    const market = raw.market as { cities: Record<string, unknown> };
    const clock = raw.clock as GameState['clock'];
    const added = Object.entries(initialCityMarkets(content, clock.date)).filter(
      ([cityId]) => !(cityId in market.cities),
    );
    const state = {
      ...raw,
      player: {
        ...player,
        baseCityId: home?.property.cityId ?? content.start.cityId,
        tripsToday: [],
        lastMoveDay: null,
        renown: {},
      },
      market: { ...market, cities: { ...market.cities, ...Object.fromEntries(added) } },
    } as unknown as GameState;
    for (const [cityId] of added) {
      seedListings({ content, state, events: [], today: toDayNumber(state.clock.date) }, cityId);
    }
    return state as unknown as Record<string, unknown>;
  },
  /** Version 9 (milestone 7) to 10 (milestone 8): IFI in the assessment, the SCI and who holds each property. */
  9: (raw) => {
    const tax = raw.tax as Record<string, unknown>;
    const last = tax.lastAssessment as Record<string, unknown> | null;
    const owned = (raw.properties as Record<string, unknown>[]) ?? [];
    const purchases = (raw.purchases as Record<string, unknown>[]) ?? [];
    return {
      ...raw,
      company: null,
      properties: owned.map((entry) => ({ ...entry, holder: 'player' })),
      purchases: purchases.map((entry) => ({ ...entry, holder: 'player' })),
      tax: {
        ...tax,
        lastAssessment: last && { ...last, wealthTax: 0, taxableWealth: 0 },
      },
    };
  },
  /** Version 13 to 14: the history of each property starts empty. */
  13: (raw) => ({
    ...raw,
    properties: ((raw.properties as Record<string, unknown>[]) ?? []).map((entry) => ({
      ...entry,
      log: [],
    })),
  }),
  /** Version 12 to 13: no refused offer was ever kept. */
  12: (raw) => ({ ...raw, offerNotices: [] }),
  /** Version 11 to 12: no tenant was ever offered an indemnity to leave. */
  11: (raw) => ({
    ...raw,
    properties: ((raw.properties as Record<string, unknown>[]) ?? []).map((entry) => ({
      ...entry,
      lease: isRecord(entry.lease) ? { ...entry.lease, buyoutRefusedDay: null } : entry.lease,
    })),
  }),
  /** Version 10 (milestone 8) to 11: the value curve of each property starts empty. */
  10: (raw) => ({
    ...raw,
    properties: ((raw.properties as Record<string, unknown>[]) ?? []).map((entry) => ({
      ...entry,
      valueHistory: [],
    })),
  }),
};

/** Old defects (version 5) and the item each one becomes at state 1. */
const DEFECT_ITEMS: Readonly<Record<string, ItemKind>> = {
  wiring: 'electricity',
  plumbing: 'plumbing',
  heating: 'heating',
  roof: 'roof',
  cracks: 'facade',
  dryRot: 'floors',
};
const DEFECT_HAZARDS: Readonly<Record<string, string>> = {
  humidity: 'hiddenDamp',
  dryRot: 'hiddenDamp',
};

/**
 * A version 5 property with rooms and items, drawn around its condition from
 * stable hashes of the save's seed (a property already in the new format is
 * returned as is).
 */
export function upgradeProperty(
  content: GameContent,
  seed: number,
  old: object,
  known: 'all' | 'visible' | 'none' = 'all',
): Property {
  if ('items' in old && Array.isArray(old.items)) return old as Property;
  const { condition, defects, ...rest } = old as unknown as Omit<Property, 'items'> & {
    condition: Condition;
    defects: { id: string; revealed: boolean }[];
  };
  const property = rest as Property;
  const spaces = layoutSpaces(
    content,
    property.kind,
    property.surface,
    property.rooms,
    property.lots,
  );
  const mean = content.market.conditions[condition].meanState;
  const spread = content.market.stateStdDev;
  const dpeOffset = content.works.energy.generationOffsets[property.dpe];
  const broken = new Map<ItemKind, boolean>();
  for (const defect of defects) {
    let kind = DEFECT_ITEMS[defect.id];
    if (kind === 'facade' && property.kind === 'apartment') kind = 'commonParts';
    if (kind) broken.set(kind, defect.revealed || broken.get(kind) === true);
  }
  let first = true;
  const items = blankItems(content, property.kind, spaces).map((item) => {
    const rule = content.works.items[item.kind];
    const id = itemId(item);
    const offset = rule.generationOffset + (rule.energy ? dpeOffset : 0);
    let state = clampState(
      Math.round(mean + offset + spread * hashNormal(seed, `${property.id}/${id}`)),
    );
    let isKnown = known === 'all' || (known === 'visible' && rule.revealOnVisit >= 1);
    const defect = broken.get(item.kind);
    // One item of the defect's kind is the broken one (the first room's floor for dry rot).
    if (defect !== undefined && (item.spaceId === null || first)) {
      if (item.spaceId !== null) first = false;
      state = 1;
      isKnown = isKnown || defect;
    }
    return { ...item, state, known: isKnown };
  });
  const view = { ...property, spaces, items, energyFactor: 1 };
  const livingWalls = items.find((item) => item.kind === 'walls');
  const postponedHazards = defects
    .filter((defect) => DEFECT_HAZARDS[defect.id] && livingWalls)
    .map((defect) => ({
      hazardId: DEFECT_HAZARDS[defect.id] ?? '',
      itemId: livingWalls ? itemId(livingWalls) : '',
    }))
    .filter((hazard, i, all) => all.findIndex((h) => h.itemId === hazard.itemId) === i);
  const lots = content.works.copro.lots;
  return {
    ...view,
    energyFactor: calibrateEnergy(content, view),
    copro:
      property.kind === 'apartment'
        ? {
            lots:
              lots.min +
              Math.floor(hashFloat(seed, `${property.id}/lots`) * (lots.max - lots.min + 1)),
            meetingMonth: 1 + Math.floor(hashFloat(seed, `${property.id}/meeting`) * 12),
          }
        : null,
    postponedHazards,
    defects: defects.filter((defect) =>
      content.market.defects.some((rule) => rule.id === defect.id),
    ),
  };
}

export type SaveErrorCode =
  'invalidJson' | 'missingVersion' | 'unsupportedVersion' | 'missingMigration' | 'invalidState';

export class SaveFormatError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, message: string) {
    super(message);
    this.name = 'SaveFormatError';
    this.code = code;
  }
}

const uint32 = z.number().int().min(0).max(0xffff_ffff);

const calendarDateSchema = z
  .object({ year: z.number().int(), month: z.number().int(), day: z.number().int() })
  .strict()
  .refine(isValidDate, 'Invalid calendar date');

const cents = z.number().int();
const day = z.number().int();

const tierSchema = z.enum(TIERS);
const itemKindSchema = z.enum([
  'floors',
  'walls',
  'joinery',
  'kitchen',
  'bathroom',
  'wcUnit',
  'garden',
  'electricity',
  'plumbing',
  'heating',
  'insulation',
  'windows',
  'ventilation',
  'roof',
  'facade',
  'commonParts',
]);

const propertySchema = z
  .object({
    id: z.string(),
    cityId: z.string(),
    neighbourhoodId: z.string(),
    kind: z.enum(['apartment', 'house', 'building', 'commercial', 'parking', 'land']),
    surface: z.number().positive(),
    // No rooms for a shop, a parking space or land (version 10).
    rooms: z.number().int().min(0),
    floor: z.number().int().min(0).nullable(),
    lots: z.array(
      z.object({ surface: z.number().positive(), rooms: z.number().int().min(1) }).strict(),
    ),
    epoch: z.enum(EPOCHS),
    dpe: z.enum(DPE_LABELS),
    spaces: z.array(
      z
        .object({
          id: z.string(),
          kind: z.enum(['entry', 'living', 'kitchen', 'bedroom', 'bathroom', 'wc', 'garden']),
          surface: z.number().positive(),
        })
        .strict(),
    ),
    items: z.array(
      z
        .object({
          kind: itemKindSchema,
          spaceId: z.string().nullable(),
          state: z.number().int().min(1).max(5),
          tier: tierSchema,
          known: z.boolean(),
        })
        .strict(),
    ),
    energyFactor: z.number().positive(),
    // Added in version 10: houses of older saves have no convertible attic.
    atticSurface: z.number().min(0).default(0),
    copro: z
      .object({
        lots: z.number().int().min(1),
        meetingMonth: z.number().int().min(1).max(12),
      })
      .strict()
      .nullable(),
    postponedHazards: z.array(z.object({ hazardId: z.string(), itemId: z.string() }).strict()),
    defects: z.array(z.object({ id: z.string(), revealed: z.boolean() }).strict()),
    annualPropertyTax: cents.min(0),
    monthlyCharges: cents.min(0),
  })
  .strict();

const leaseTypeSchema = z.enum(LEASE_TYPES);
const tradeSchema = z.enum([
  'plumber',
  'electrician',
  'mason',
  'painter',
  'tiler',
  'carpenter',
  'heatingEngineer',
  'kitchenFitter',
]);

const quoteSchema = z
  .object({
    id: z.string(),
    artisanId: z.string(),
    items: z.array(
      z
        .object({
          itemId: z.string(),
          tier: tierSchema,
          price: cents.min(0),
          days: z.number().min(0),
        })
        .strict(),
    ),
    total: cents.min(0),
    days: z.number().int().min(0),
    availableDay: day,
    expiresDay: day,
  })
  .strict();

const worksProjectSchema = z
  .object({
    id: z.string(),
    startDay: day,
    // Added in version 10 (project manager, transformations).
    managed: z.boolean().default(false),
    transformation: z
      .object({
        kind: z.enum(['division', 'splitBuilding', 'attic', 'construction']),
        total: cents.min(0),
        endDay: day,
        overrun: z.number().min(0),
      })
      .strict()
      .nullable()
      .default(null),
    tasks: z.array(
      z
        .object({
          id: z.string(),
          artisanId: z.string().nullable(),
          trade: tradeSchema,
          phase: z.number().int().min(1),
          items: z.array(
            z.object({ itemId: z.string(), tier: tierSchema, price: cents.min(0) }).strict(),
          ),
          status: z.enum(['waiting', 'running', 'done']),
          availableDay: day,
          days: z.number().int().min(0),
          startDay: day.nullable(),
          endDay: day.nullable(),
          overrun: z.number().min(0),
          deposit: cents.min(0),
          minutesNeeded: z.number().int().min(0),
          minutesDone: z.number().int().min(0),
        })
        .strict(),
    ),
    hazard: z
      .object({
        hazardId: z.string(),
        taskId: z.string(),
        itemId: z.string(),
        cost: cents.min(0),
        days: z.number().int().min(0),
        deadlineDay: day,
      })
      .strict()
      .nullable(),
    dpeBefore: z.enum(DPE_LABELS),
    paid: cents,
  })
  .strict();
const taxRegimeSchema = z.enum(['auto', 'micro', 'real']);
const holderSchema = z.enum(['player', 'company']);

const tenantSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    profileId: z.string(),
    traitId: z.string(),
    monthlyIncome: cents.min(0),
    guarantor: z.boolean(),
    desiredYears: z.number().int().min(0),
    reliability: z.number().min(0).max(1),
    mobility: z.number().min(0),
  })
  .strict();

const rentalListingSchema = z
  .object({
    leaseType: leaseTypeSchema,
    monthlyRent: cents.positive(),
    agencyId: z.string().nullable(),
    insured: z.boolean(),
    listedDay: day,
    applications: z.array(
      z.object({ id: z.string(), tenant: tenantSchema, expiresDay: day }).strict(),
    ),
  })
  .strict();

const leaseSchema = z
  .object({
    leaseType: leaseTypeSchema,
    tenant: tenantSchema,
    monthlyRent: cents.positive(),
    startDay: day,
    termDay: day,
    anniversaryDay: day,
    revisionFactor: z.number().positive(),
    deposit: cents.min(0),
    agencyId: z.string().nullable(),
    insured: z.boolean(),
    satisfaction: z.number().min(0).max(100),
    noticeEndDay: day.nullable(),
    incident: z
      .object({
        id: z.string(),
        kindId: z.string(),
        day,
        repair: z
          .object({ day, cost: cents.min(0) })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable(),
    arrears: z
      .object({
        amount: cents.min(0),
        months: z.number().int().min(0),
        sinceDay: day,
        reminderFailed: z.boolean(),
        procedureEndDay: day.nullable(),
      })
      .strict()
      .nullable(),
    // Added in version 10 (short-term lets).
    missedDays: z.number().int().min(0).default(0),
    buyoutRefusedDay: z.number().int().nullable(),
  })
  .strict();

const rateQuoteSchema = z
  .object({
    marketPercent: z.number(),
    durationSpreadPercent: z.number(),
    insurancePercent: z.number(),
    bankMarginPercent: z.number(),
    profilePercent: z.number(),
    trustPercent: z.number(),
    // Added in version 8; the offers of older saves had no such line.
    reputationPercent: z.number().default(0),
    ratePercent: z.number(),
  })
  .strict();

const loanOfferSchema = z
  .object({
    bankId: z.string(),
    amount: cents.min(0),
    durationYears: z.number().int().positive(),
    ratePercent: z.number(),
    rate: rateQuoteSchema,
    monthlyPayment: cents.min(0),
    totalCost: cents,
    debtRatioAfter: z.number(),
    // Added in version 10 (the SCI): older offers were all personal.
    rentCoverage: z.number().min(0).nullable().default(null),
  })
  .strict();

const loanDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accepted'), offer: loanOfferSchema }).strict(),
  z
    .object({ decision: z.literal('partial'), offer: loanOfferSchema, requestedAmount: cents })
    .strict(),
  z
    .object({
      decision: z.literal('counterOffer'),
      offer: loanOfferSchema,
      requestedDurationYears: z.number().int(),
    })
    .strict(),
  z
    .object({
      decision: z.literal('refused'),
      reason: z.enum([
        'unknownBank',
        'creditFrozen',
        'jobProfile',
        'noIncomeHistory',
        'lowTrust',
        'invalidDuration',
        'insufficientContribution',
        'overFinancing',
        'debtRatio',
        'noCompany',
        'companyNotServed',
        'rentCoverage',
        'leverage',
      ]),
      debtRatioAfter: z.number().optional(),
    })
    .strict(),
]);

const amountLine = <K extends string>(kind: K) =>
  z.object({ kind: z.literal(kind), amount: cents.min(0) }).strict();
const propertyLine = <K extends string>(kind: K) =>
  z.object({ kind: z.literal(kind), propertyId: z.string(), amount: cents.min(0) }).strict();

const statementLineSchema = z.discriminatedUnion('kind', [
  amountLine('salary'),
  amountLine('rent'),
  propertyLine('rentalIncome'),
  propertyLine('propertyCharges'),
  propertyLine('ownerInsurance'),
  propertyLine('managementFees'),
  propertyLine('remoteManagement'),
  propertyLine('legalCosts'),
  propertyLine('coproCall'),
  amountLine('taxInstalment'),
  amountLine('taxRefund'),
  amountLine('livingCosts'),
  z
    .object({
      kind: z.literal('loanPayment'),
      loanId: z.string(),
      amount: cents.min(0),
      interest: cents.min(0),
      capital: cents.min(0),
    })
    .strict(),
  amountLine('overdraftInterest'),
]);

const agendaBase = z.object({ id: z.string(), day, minutes: z.number().int().min(0) });
const dayEntry = z.object({ id: z.string(), day }).strict();
const noteBase = z.object({
  day,
  textIndex: z.number().int().min(0),
  propertyId: z.string().nullable(),
  vars: z
    .object({
      tenant: z.string().nullable(),
      artisanId: z.string().nullable(),
      neighbourhoodId: z.string(),
      cityId: z.string(),
      rivalId: z.string(),
    })
    .strict(),
});

const gameStateSchema = z
  .object({
    formatVersion: z.literal(FORMAT_VERSION),
    seed: uint32,
    rng: z.tuple([uint32, uint32, uint32, uint32]),
    startDate: calendarDateSchema,
    clock: z
      .object({
        date: calendarDateSchema,
        hour: z.number().int().min(0).max(23),
        elapsedHours: z.number().int().min(0),
      })
      .strict(),
    nextId: z.number().int().min(1),
    player: z
      .object({
        name: z.string().min(1),
        avatar: z
          .object({
            face: z.number().int().min(0),
            hair: z.number().int().min(0),
            skin: z.number().int().min(0),
            outfit: z.number().int().min(0),
          })
          .strict(),
        jobId: z.string(),
        employed: z.boolean(),
        balance: cents,
        overdraftDays: z.number().int().min(0),
        overdraftInterestThisMonth: cents.min(0),
        monthlyRent: cents.min(0),
        freeTimeMinutes: z.number().int().min(0),
        reputation: z.number().min(0).max(100),
        rentalHistoryMonths: z.number().int().min(0),
        bankruptDay: day.nullable(),
        homePropertyId: z.string().nullable(),
        baseCityId: z.string().min(1),
        tripsToday: z.array(z.string()),
        lastMoveDay: day.nullable(),
        renown: z.record(z.string(), z.number().min(0).max(100)),
      })
      .strict(),
    company: z.object({ createdDay: day }).strict().nullable(),
    banks: z.record(
      z.string(),
      z
        .object({
          trust: z.number().min(0).max(100),
          relationshipMonths: z.number().int().min(0),
          lastMeetingDay: z.number().int().nullable(),
        })
        .strict(),
    ),
    market: z
      .object({
        ratePercent: z.number(),
        cyclePhase: z.number().min(0).max(1),
        laggedRatePercent: z.number(),
        cities: z.record(
          z.string(),
          z.record(
            z.string(),
            z.object({ priceIndex: z.number().positive(), trendPercent: z.number() }).strict(),
          ),
        ),
        // Added in version 10 (lasting national crises).
        crises: z
          .array(
            z
              .object({
                modifier: z.enum([
                  'unpaidRents',
                  'worksCosts',
                  'tenantDemand',
                  'buyerDemand',
                  'credit',
                ]),
                factor: z.number().positive(),
                untilDay: day,
              })
              .strict(),
          )
          .default([]),
      })
      .strict(),
    loans: z.array(
      z
        .object({
          id: z.string(),
          bankId: z.string(),
          principal: cents.min(0),
          ratePercent: z.number(),
          durationMonths: z.number().int().positive(),
          monthlyPayment: cents.min(0),
          remaining: cents.min(0),
          paymentsMade: z.number().int().min(0),
          startDate: calendarDateSchema,
          renegotiationSuggested: z.boolean(),
          propertyId: z.string().nullable(),
        })
        .strict(),
    ),
    listings: z.array(
      z
        .object({
          id: z.string(),
          property: propertySchema,
          titleId: z.string(),
          motivationId: z.string(),
          askingPrice: cents.positive(),
          initialAskingPrice: cents.positive(),
          publishedDay: day,
          publicDay: day,
          lastPriceDropDay: day,
          visited: z.boolean(),
          offersMade: z.number().int().min(0),
          offer: z
            .object({
              amount: cents.positive(),
              responseDay: day,
              counter: z.object({ amount: cents.positive(), expiresDay: day }).strict().nullable(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
    ),
    purchases: z.array(
      z
        .object({
          id: z.string(),
          holder: holderSchema,
          listingId: z.string(),
          property: propertySchema,
          price: cents.positive(),
          deposit: cents.min(0),
          signedDay: day,
          loanDeadlineDay: day,
          deedDay: day,
          applications: z.array(
            z
              .object({
                id: z.string(),
                bankId: z.string(),
                amount: cents.positive(),
                works: cents.min(0),
                durationYears: z.number().int(),
                responseDay: day,
                decision: loanDecisionSchema.nullable(),
              })
              .strict(),
          ),
          acceptedApplicationId: z.string().nullable(),
          cash: z.boolean(),
        })
        .strict(),
    ),
    properties: z.array(
      z
        .object({
          property: propertySchema,
          holder: holderSchema,
          purchasePrice: cents.positive(),
          acquisitionCost: cents.positive(),
          purchaseDate: calendarDateSchema,
          sale: z
            .object({
              askingPrice: cents.positive(),
              mode: z.enum(['agency', 'self']),
              listedDay: day,
              offers: z.array(
                z
                  .object({
                    id: z.string(),
                    buyerId: z.string().nullable(),
                    amount: cents.positive(),
                    buyerMax: cents.positive(),
                    expiresDay: day,
                    counterAmount: cents.positive().nullable(),
                  })
                  .strict(),
              ),
              agreement: z
                .object({ price: cents.positive(), deedDay: day, buyerId: z.string().nullable() })
                .strict()
                .nullable(),
            })
            .strict()
            .nullable(),
          rental: rentalListingSchema.nullable(),
          lease: leaseSchema.nullable(),
          furniture: z
            .object({ cost: cents.min(0), boughtDay: day })
            .strict()
            .nullable(),
          taxRegime: taxRegimeSchema,
          furnishedTax: z
            .object({
              deferredDepreciation: cents.min(0),
              deficitCarry: cents.min(0),
              buildingDepreciationDeducted: cents.min(0),
              works: z.array(z.object({ amount: cents, year: z.number().int() }).strict()),
            })
            .strict(),
          quotes: z.array(quoteSchema),
          works: worksProjectSchema.nullable(),
          worksFund: z
            .object({ amount: cents.min(0), loanId: z.string(), untilDay: day })
            .strict()
            .nullable(),
          worksForCapitalGains: cents,
          coproMeeting: z
            .object({
              voteDay: day,
              attended: z.boolean(),
              resolutions: z.array(
                z
                  .object({
                    id: z.string(),
                    cost: cents.min(0),
                    support: z.number().min(0).max(1),
                    vote: z.enum(['for', 'against']).nullable(),
                  })
                  .strict(),
              ),
            })
            .strict()
            .nullable(),
          coproCalls: z.array(
            z.object({ monthly: cents, monthsLeft: z.number().int().min(0) }).strict(),
          ),
          valueHistory: z.array(
            z.object({ date: calendarDateSchema, value: cents, debt: cents }).strict(),
          ),
          log: z.array(
            z.discriminatedUnion('kind', [
              z
                .object({
                  kind: z.literal('works'),
                  day,
                  itemKind: itemKindSchema,
                  spaceId: z.string().nullable(),
                  tier: tierSchema,
                  artisanId: z.string().nullable(),
                  cost: cents,
                })
                .strict(),
              z
                .object({
                  kind: z.literal('tenantIn'),
                  day,
                  tenantName: z.string(),
                  monthlyRent: cents,
                })
                .strict(),
              z
                .object({
                  kind: z.literal('tenantOut'),
                  day,
                  tenantName: z.string(),
                  reason: z.enum(['notice', 'evicted', 'endOfTerm', 'dpe']),
                })
                .strict(),
              z
                .object({ kind: z.literal('incident'), day, kindId: z.string(), cost: cents })
                .strict(),
            ]),
          ),
        })
        .strict(),
    ),
    agenda: z.array(
      z.discriminatedUnion('kind', [
        agendaBase.extend({ kind: z.literal('visit'), listingId: z.string() }).strict(),
        agendaBase.extend({ kind: z.literal('bankMeeting'), bankId: z.string() }).strict(),
        agendaBase.extend({ kind: z.literal('selfRepair'), propertyId: z.string() }).strict(),
      ]),
    ),
    rivals: z.record(
      z.string(),
      z
        .object({
          // Added in version 10 (the SCI Horizon arrives).
          arrivedDay: day.nullable().default(null),
          budget: cents,
          purchases: z.number().int().min(0),
          projects: z.array(z.object({ property: propertySchema, resaleDay: day }).strict()),
        })
        .strict(),
    ),
    tax: z
      .object({
        year: z.number().int(),
        salary: cents.min(0),
        ledgers: z.record(
          z.string(),
          z
            .object({
              category: leaseTypeSchema.nullable(),
              regime: taxRegimeSchema,
              // Added in version 10 (the SCI).
              company: z.boolean().default(false),
              rents: cents,
              costs: cents,
              works: cents,
              energyRenovation: z.boolean(),
              interest: cents.min(0),
              sold: z.boolean(),
            })
            .strict(),
        ),
        landlordDeficits: z.array(
          z.object({ year: z.number().int(), amount: cents.min(0) }).strict(),
        ),
        installments: z
          .object({ monthly: cents, remaining: z.number().int().min(0).max(12) })
          .strict(),
        lastAssessment: z
          .object({
            year: z.number().int(),
            incomeTax: cents,
            socialContributions: cents,
            accountantFees: cents.min(0),
            deficitOnSalary: cents.min(0),
            wealthTax: cents.min(0),
            taxableWealth: cents.min(0),
            properties: z.array(
              z
                .object({
                  propertyId: z.string(),
                  category: leaseTypeSchema,
                  regime: z.enum(['micro', 'real']),
                  taxable: cents,
                })
                .strict(),
            ),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    artisans: z.record(z.string(), z.object({ jobs: z.number().int().min(0) }).strict()),
    worksDone: z.record(z.string(), z.number().int().min(0)),
    favorites: z.array(z.string()),
    offerNotices: z.array(
      z
        .object({
          id: z.string(),
          listingId: z.string(),
          day,
          amount: cents.positive(),
          outcome: z.enum(['refused', 'counterExpired']),
          dismissed: z.boolean(),
        })
        .strict(),
    ),
    tutorial: z.object({ enabled: z.boolean(), step: z.number().int().min(0) }).strict(),
    history: z.array(
      z
        .object({
          date: calendarDateSchema,
          netWorth: cents,
          balance: cents,
          debt: cents.min(0),
          cashFlow: cents,
          monthlyRent: cents.min(0),
          reputation: z.number().min(0).max(100),
        })
        .strict(),
    ),
    lastStatement: z
      .object({ date: calendarDateSchema, lines: z.array(statementLineSchema), balance: cents })
      .strict()
      .nullable(),
    modeId: z.string(),
    rewinds: z.number().int().min(0),
    gameOver: z.object({ day }).strict().nullable(),
    progress: z
      .object({
        titles: z.array(dayEntry),
        achievements: z.array(dayEntry),
        counters: z.record(z.string(), z.number()),
        records: z
          .object({
            bestCapitalGain: cents,
            biggestWorks: cents,
            bestMonth: cents,
            maxNetWorth: cents,
          })
          .strict(),
        troubledYear: z.boolean(),
        challenge: z
          .object({
            id: z.string(),
            offeredDay: day,
            deadlineDay: day,
            accepted: z.boolean(),
            baseline: z.number(),
          })
          .strict()
          .nullable(),
        challengeHistory: z.array(z.object({ id: z.string(), day, won: z.boolean() }).strict()),
        nextChallengeDay: day,
      })
      .strict(),
    chronicle: z.array(
      z
        .object({
          day,
          kind: z.enum(CHRONICLE_KINDS),
          ref: z.string().nullable(),
          amount: cents.nullable(),
        })
        .strict(),
    ),
    catalog: z
      .object({
        pending: z.array(
          noteBase
            .extend({
              id: z.string(),
              eventId: z.string(),
              deadlineDay: day,
              amounts: z.record(z.string(), cents),
            })
            .strict(),
        ),
        lastDay: z.record(z.string(), day),
        anecdotes: z.array(noteBase.extend({ anecdoteId: z.string() }).strict()),
      })
      .strict(),
    lastYearReview: z
      .object({
        year: z.number().int(),
        netWorthStart: cents,
        netWorthEnd: cents,
        cashFlow: cents,
        rents: cents,
        reputationStart: z.number(),
        reputationEnd: z.number(),
        rentTax: cents.nullable(),
        accountantFees: cents,
        titles: z.array(z.string()),
        achievements: z.array(z.string()),
        advice: z.array(
          z
            .object({
              kind: z.enum(ADVICE_KINDS),
              propertyId: z.string().optional(),
              amount: cents.optional(),
              year: z.number().int().optional(),
              ratio: z.number().optional(),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();

// Compile-time guard: a validated save must be a GameState.
export type ValidatedState = z.infer<typeof gameStateSchema>;
type Assert<T extends true> = T;
export type SchemaMatchesState = Assert<ValidatedState extends GameState ? true : false>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Applies migrations until `raw` reaches `targetVersion`. */
export function migrateRaw(
  raw: unknown,
  context: MigrationContext,
  targetVersion: number = FORMAT_VERSION,
  registry: MigrationRegistry = MIGRATIONS,
): Record<string, unknown> {
  if (!isRecord(raw) || typeof raw.formatVersion !== 'number') {
    throw new SaveFormatError('missingVersion', 'Save has no numeric formatVersion');
  }
  let current = raw;
  let version = raw.formatVersion;
  if (!Number.isInteger(version) || version > targetVersion) {
    throw new SaveFormatError(
      'unsupportedVersion',
      `Save version ${version} is not supported (latest is ${targetVersion})`,
    );
  }
  while (version < targetVersion) {
    const migration = registry[version];
    if (!migration) {
      throw new SaveFormatError('missingMigration', `No migration from version ${version}`);
    }
    current = { ...migration(current, context), formatVersion: version + 1 };
    version += 1;
  }
  return current;
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses, migrates and validates a saved game. Throws SaveFormatError. */
export function deserializeGame(
  json: string,
  context: MigrationContext,
  registry: MigrationRegistry = MIGRATIONS,
): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveFormatError('invalidJson', 'Save is not valid JSON');
  }
  const migrated = migrateRaw(raw, context, FORMAT_VERSION, registry);
  const parsed = gameStateSchema.safeParse(migrated);
  if (!parsed.success) {
    throw new SaveFormatError('invalidState', z.prettifyError(parsed.error));
  }
  const state: GameState = parsed.data;
  // Rooms and items are shared between copies of the state once frozen (see clone.ts).
  for (const listing of state.listings) freezeDwelling(listing.property);
  for (const purchase of state.purchases) freezeDwelling(purchase.property);
  for (const owned of state.properties) freezeDwelling(owned.property);
  for (const rival of Object.values(state.rivals)) {
    for (const project of rival.projects) freezeDwelling(project.property);
  }
  return state;
}
