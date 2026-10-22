import type { z } from 'zod';
import { cityDataSchema } from './schemas/city.ts';
import { companyRulesSchema } from './schemas/company.ts';
import { decisionRulesSchema } from './schemas/decisions.ts';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { listingTextsSchema, marketRulesSchema } from './schemas/market.ts';
import { rentingRulesSchema, tenantTextsSchema } from './schemas/renting.ts';
import { rivalsFileSchema } from './schemas/rivals.ts';
import { screenTextsSchema, tutorialSchema } from './schemas/screens.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { taxRulesSchema } from './schemas/taxes.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';
import { artisansFileSchema, worksRulesSchema, worksTextsSchema } from './schemas/works.ts';
import { musicSchema } from './schemas/music.ts';
import { worldRulesSchema } from './schemas/world.ts';
import { citiesRulesSchema } from './schemas/villes.ts';
import { anecdotesFileSchema, eventsFileSchema, rhythmRulesSchema } from './schemas/events.ts';
import { calendarRulesSchema, modesFileSchema } from './schemas/modes.ts';
import {
  achievementsFileSchema,
  challengesFileSchema,
  progressionRulesSchema,
  titlesFileSchema,
  yvonTextsSchema,
} from './schemas/progression.ts';

/** Every content file, by path relative to `content/`, with the schema it must satisfy. */
export const contentRegistry: Readonly<Record<string, z.ZodType>> = {
  'anecdotes.json': anecdotesFileSchema,
  'artisans.json': artisansFileSchema,
  'calendrier.json': calendarRulesSchema,
  'defis.json': challengesFileSchema,
  'evenements/artisans.json': eventsFileSchema,
  'evenements/banque.json': eventsFileSchema,
  'evenements/copropriete.json': eventsFileSchema,
  'evenements/france.json': eventsFileSchema,
  'evenements/locataires.json': eventsFileSchema,
  'evenements/marche.json': eventsFileSchema,
  'evenements/ville.json': eventsFileSchema,
  'evenements/vie.json': eventsFileSchema,
  'modes.json': modesFileSchema,
  'progression.json': progressionRulesSchema,
  'rythme.json': rhythmRulesSchema,
  'succes.json': achievementsFileSchema,
  'titres.json': titlesFileSchema,
  'villes.json': citiesRulesSchema,
  'banques.json': banksFileSchema,
  'credit.json': creditRulesSchema,
  'decisions.json': decisionRulesSchema,
  'fiscalite.json': taxRulesSchema,
  'marche.json': marketRulesSchema,
  'location.json': rentingRulesSchema,
  'metiers.json': jobsFileSchema,
  'monde.json': worldRulesSchema,
  'musique.json': musicSchema,
  'partie.json': startSchema,
  'rivaux.json': rivalsFileSchema,
  'sci.json': companyRulesSchema,
  'taux.json': marketRateSchema,
  'temps.json': timeSettingsSchema,
  'train-de-vie.json': livingCostsSchema,
  'travaux.json': worksRulesSchema,
  'textes/annonces.json': listingTextsSchema,
  'textes/didacticiel.json': tutorialSchema,
  'textes/ecrans.json': screenTextsSchema,
  'textes/interface.json': uiTextsSchema,
  'textes/locataires.json': tenantTextsSchema,
  'textes/travaux.json': worksTextsSchema,
  'textes/yvon.json': yvonTextsSchema,
};

/** Generated city files, by path relative to `data/`. */
export const dataRegistry: Readonly<Record<string, z.ZodType>> = {
  'cities/besancon.json': cityDataSchema,
  'cities/chalon.json': cityDataSchema,
  'cities/dijon.json': cityDataSchema,
  'cities/dole.json': cityDataSchema,
};
