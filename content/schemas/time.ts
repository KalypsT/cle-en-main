import { z } from 'zod';

export const timeSettingsSchema = z
  .object({
    /** Hour of day a new game starts at. */
    startHour: z.number().int().min(0).max(23),
    /** Real seconds for one game day at speed ×1. */
    realSecondsPerGameDay: z.number().positive(),
    /** Available speed multipliers, pause excluded. */
    speeds: z.array(z.number().int().positive()).min(1),
  })
  .strict();

export type TimeSettings = z.infer<typeof timeSettingsSchema>;
