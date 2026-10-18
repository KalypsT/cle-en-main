import { z } from 'zod';
import { isValidDate } from './calendar.ts';
import { FORMAT_VERSION, type GameState } from './state.ts';

/** Upgrades a raw state from version N to version N + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migrations keyed by the version they upgrade from. */
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/**
 * Production migrations. To change the save format: bump FORMAT_VERSION, add
 * the migration from the previous version here, and test it.
 */
export const MIGRATIONS: MigrationRegistry = {};

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
    demo: z
      .object({
        rollCount: z.number().int().min(0),
        lastRoll: z.number().int().nullable(),
      })
      .strict(),
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
    current = { ...migration(current), formatVersion: version + 1 };
    version += 1;
  }
  return current;
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

/** Parses, migrates and validates a saved game. Throws SaveFormatError. */
export function deserializeGame(json: string, registry: MigrationRegistry = MIGRATIONS): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveFormatError('invalidJson', 'Save is not valid JSON');
  }
  const migrated = migrateRaw(raw, FORMAT_VERSION, registry);
  const parsed = gameStateSchema.safeParse(migrated);
  if (!parsed.success) {
    throw new SaveFormatError('invalidState', z.prettifyError(parsed.error));
  }
  return parsed.data;
}
