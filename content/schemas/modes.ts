import { z } from 'zod';
import { euros, id, share } from './common.ts';

/** Game modes (docs/02, section 2.5): one table of coefficients. */
export const modeSchema = z
  .object({
    id,
    name: z.string().min(1),
    description: z.string().min(1),
    /** Multiplies the chance of tenant incidents and of the catalogue's mishaps. */
    incidentFactor: z.number().positive(),
    /** Multiplies the chance of works hazards. */
    hazardFactor: z.number().positive(),
    /** Multiplies the rivals' boldness. */
    rivalFactor: z.number().positive(),
    /** Multiplies the bankers' trust gains (not the losses). */
    trustGainFactor: z.number().positive(),
    /** After bankruptcy: a fresh start in the same world, or the end of the game. */
    bankruptcy: z.enum(['freshStart', 'gameOver']),
    freshStart: z
      .object({
        savings: euros,
        /** Share of the reputation kept. */
        reputationShare: share,
        /** Trust points every banker loses. */
        trustPenalty: z.number().int().max(0),
      })
      .strict()
      .nullable(),
    /** Rewinds allowed per game; null: unlimited. */
    rewinds: z.number().int().min(0).nullable(),
  })
  .strict()
  .refine((mode) => (mode.bankruptcy === 'freshStart') === (mode.freshStart !== null), {
    message: 'Un nouveau départ demande ses conditions',
  });

export const modesFileSchema = z
  .object({
    defaultModeId: id,
    modes: z
      .array(modeSchema)
      .min(1)
      .refine((modes) => new Set(modes.map((m) => m.id)).size === modes.length, 'Mode en double'),
  })
  .strict();

const monthDay = z.string().regex(/^\d{2}-\d{2}$/, 'MM-JJ');

/**
 * Calendar of the agenda (docs/03-systemes/01): public holidays and the
 * school holidays of zone A, as rules that give the official dates of
 * 2025-2026 and 2026-2027 (simplified: zone A's winter and spring weeks
 * do not rotate).
 */
export const calendarRulesSchema = z
  .object({
    publicHolidays: z
      .object({
        fixed: z.array(monthDay),
        /** Days after Easter Sunday: Easter Monday, Ascension, Whit Monday. */
        easterOffsets: z.array(z.number().int()),
      })
      .strict(),
    schoolHolidays: z.array(
      z
        .object({
          id,
          name: z.string().min(1),
          /** Starts on the first Saturday on or after this date. */
          from: monthDay,
          /** Lasts this many days, or until this date (summer). */
          days: z.number().int().positive().optional(),
          until: monthDay.optional(),
        })
        .strict()
        .refine((h) => (h.days === undefined) !== (h.until === undefined), 'days ou until'),
    ),
  })
  .strict();

export type Mode = z.infer<typeof modeSchema>;
export type ModesFile = z.infer<typeof modesFileSchema>;
export type CalendarRules = z.infer<typeof calendarRulesSchema>;
