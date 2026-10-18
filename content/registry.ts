import type { z } from 'zod';
import { jobsFileSchema } from './schemas/jobs.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';

/** Every content file, by path relative to `content/`, with the schema it must satisfy. */
export const contentRegistry: Readonly<Record<string, z.ZodType>> = {
  'metiers.json': jobsFileSchema,
  'temps.json': timeSettingsSchema,
  'textes/interface.json': uiTextsSchema,
};
