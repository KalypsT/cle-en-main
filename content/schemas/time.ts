import { z } from 'zod';

export const timeSettingsSchema = z
  .object({
    /** Hour of day a new game starts at. */
    startHour: z.number().int().min(0).max(23),
    /** Real seconds for one game day at speed ×1. */
    realSecondsPerGameDay: z.number().positive(),
    /** Available speed multipliers, pause excluded. */
    speeds: z.array(z.number().int().positive()).min(1),
    /**
     * From this speed (the automatic acceleration included), the street, the theme and the
     * music keep the moment of day and the weather they had: day and night would flash by.
     */
    stillAmbienceSpeed: z.number().int().positive(),
  })
  .strict();

export type TimeSettings = z.infer<typeof timeSettingsSchema>;
