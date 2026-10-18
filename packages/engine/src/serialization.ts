import { z } from 'zod';
import { isValidDate } from './calendar.ts';
import type { GameContent } from './content.ts';
import { toCents } from './money.ts';
import { FORMAT_VERSION, type GameState } from './state.ts';
import { initialBankRelations } from './systems/banking.ts';

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
    market: z.object({ ratePercent: z.number(), cyclePhase: z.number().min(0).max(1) }).strict(),
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
