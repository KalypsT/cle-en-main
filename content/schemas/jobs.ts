import { z } from 'zod';

const minutes = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);
const euros = z.number().int().min(0);

export const bankTrustSchema = z.enum(['veryHigh', 'high', 'medium', 'mediumLow']);

const freeTimeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('regular'),
      weekdayMinutes: minutes,
      weekendMinutes: minutes,
      /** Free time per day during school holidays, when it differs. */
      schoolHolidayMinutes: minutes.optional(),
      /** RTT: the first given weekday of each month is free (1 = Monday … 5 = Friday). */
      rtt: z
        .object({ weekday: z.number().int().min(1).max(5), minutes })
        .strict()
        .optional(),
      /** Works on Saturdays. */
      worksSaturday: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('shifts'),
      workDayMinutes: minutes,
      restDayMinutes: minutes,
      /** Repeating pattern of work and rest days, starting on the first day of the game. */
      cycle: z.array(z.enum(['work', 'rest'])).min(1),
    })
    .strict(),
]);

export const jobSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-zA-Z]*$/),
    name: z.string().min(1),
    netMonthlySalary: euros,
    /** Average monthly total including bonuses or commissions, for variable pay. */
    averageMonthlyTotal: euros.optional(),
    freeTime: freeTimeSchema,
    bankTrust: bankTrustSchema,
    perk: z.string().min(1),
    /** Gameplay effect of the perk, when it has one. */
    perkEffects: z
      .object({
        /** Extra discount sellers grant (share of the asking price). */
        negotiationBonusShare: z.number().min(0).max(1).optional(),
        /** Sees a share of the new listings this many days before everyone else. */
        listingHeadStart: z
          .object({ days: z.number().int().positive(), share: z.number().min(0).max(1) })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const jobsFileSchema = z
  .object({
    /** Daily free time after resigning. */
    unemployedFreeTimeMinutes: minutes,
    /** Days to find one's job again after resigning (docs/03-systemes/01, « Démissionner »). */
    jobSearchDays: z.number().int().positive(),
    jobs: z
      .array(jobSchema)
      .min(1)
      .refine((jobs) => new Set(jobs.map((j) => j.id)).size === jobs.length, 'Duplicate job id'),
  })
  .strict();

export type Job = z.infer<typeof jobSchema>;
export type JobsFile = z.infer<typeof jobsFileSchema>;
