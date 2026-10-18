import { z } from 'zod';
import { isValidDate, toDayNumber } from './calendar.ts';
import { CONDITIONS, DPE_LABELS, EPOCHS } from './content-constants.ts';
import type { GameContent } from './content.ts';
import { toCents } from './money.ts';
import { FORMAT_VERSION, type GameState } from './state.ts';
import { initialBankRelations } from './systems/banking.ts';
import { seedListings } from './systems/listings.ts';
import { initialCityMarkets } from './systems/prices.ts';
import { initialRivals } from './systems/rivals.ts';

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
};

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

const propertySchema = z
  .object({
    id: z.string(),
    cityId: z.string(),
    neighbourhoodId: z.string(),
    kind: z.enum(['apartment', 'house', 'building']),
    surface: z.number().positive(),
    rooms: z.number().int().min(1),
    floor: z.number().int().min(0).nullable(),
    lots: z.array(
      z.object({ surface: z.number().positive(), rooms: z.number().int().min(1) }).strict(),
    ),
    epoch: z.enum(EPOCHS),
    dpe: z.enum(DPE_LABELS),
    condition: z.enum(CONDITIONS),
    defects: z.array(z.object({ id: z.string(), revealed: z.boolean() }).strict()),
    annualPropertyTax: cents.min(0),
    monthlyCharges: cents.min(0),
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
      ]),
      debtRatioAfter: z.number().optional(),
    })
    .strict(),
]);

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
      })
      .strict(),
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
          lease: z.object({ monthlyRent: cents.positive(), startDay: day }).strict().nullable(),
          vacantUntilDay: day,
        })
        .strict(),
    ),
    agenda: z.array(
      z
        .object({
          id: z.string(),
          kind: z.literal('visit'),
          listingId: z.string(),
          day,
          minutes: z.number().int().min(0),
        })
        .strict(),
    ),
    rivals: z.record(
      z.string(),
      z
        .object({
          budget: cents,
          purchases: z.number().int().min(0),
          projects: z.array(z.object({ property: propertySchema, resaleDay: day }).strict()),
        })
        .strict(),
    ),
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
  return parsed.data;
}
