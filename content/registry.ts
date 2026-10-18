import type { z } from 'zod';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';

/** Every content file, by path relative to `content/`, with the schema it must satisfy. */
export const contentRegistry: Readonly<Record<string, z.ZodType>> = {
  'banques.json': banksFileSchema,
  'credit.json': creditRulesSchema,
  'metiers.json': jobsFileSchema,
  'partie.json': startSchema,
  'taux.json': marketRateSchema,
  'temps.json': timeSettingsSchema,
  'train-de-vie.json': livingCostsSchema,
  'textes/interface.json': uiTextsSchema,
};
