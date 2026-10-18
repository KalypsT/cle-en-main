import type { z } from 'zod';
import { cityDataSchema } from './schemas/city.ts';
import { decisionRulesSchema } from './schemas/decisions.ts';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { listingTextsSchema, marketRulesSchema } from './schemas/market.ts';
import { rentingRulesSchema, tenantTextsSchema } from './schemas/renting.ts';
import { rivalsFileSchema } from './schemas/rivals.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { taxRulesSchema } from './schemas/taxes.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';
import { artisansFileSchema, worksRulesSchema, worksTextsSchema } from './schemas/works.ts';

/** Every content file, by path relative to `content/`, with the schema it must satisfy. */
export const contentRegistry: Readonly<Record<string, z.ZodType>> = {
  'artisans.json': artisansFileSchema,
  'banques.json': banksFileSchema,
  'credit.json': creditRulesSchema,
  'decisions.json': decisionRulesSchema,
  'fiscalite.json': taxRulesSchema,
  'marche.json': marketRulesSchema,
  'location.json': rentingRulesSchema,
  'metiers.json': jobsFileSchema,
  'partie.json': startSchema,
  'rivaux.json': rivalsFileSchema,
  'taux.json': marketRateSchema,
  'temps.json': timeSettingsSchema,
  'train-de-vie.json': livingCostsSchema,
  'travaux.json': worksRulesSchema,
  'textes/annonces.json': listingTextsSchema,
  'textes/interface.json': uiTextsSchema,
  'textes/locataires.json': tenantTextsSchema,
  'textes/travaux.json': worksTextsSchema,
};

/** Generated city files, by path relative to `data/`. */
export const dataRegistry: Readonly<Record<string, z.ZodType>> = {
  'cities/dole.json': cityDataSchema,
};
