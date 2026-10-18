import banksJson from './banques.json' with { type: 'json' };
import doleJson from '../data/cities/dole.json' with { type: 'json' };
import creditJson from './credit.json' with { type: 'json' };
import marketJson from './marche.json' with { type: 'json' };
import jobsJson from './metiers.json' with { type: 'json' };
import startJson from './partie.json' with { type: 'json' };
import rentingJson from './location.json' with { type: 'json' };
import rivalsJson from './rivaux.json' with { type: 'json' };
import marketRateJson from './taux.json' with { type: 'json' };
import timeJson from './temps.json' with { type: 'json' };
import listingTextsJson from './textes/annonces.json' with { type: 'json' };
import uiTextsJson from './textes/interface.json' with { type: 'json' };
import livingCostsJson from './train-de-vie.json' with { type: 'json' };
import { checkReferences, type GameContent } from './references.ts';
import { cityDataSchema } from './schemas/city.ts';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { listingTextsSchema, marketRulesSchema } from './schemas/market.ts';
import { rentingRulesSchema } from './schemas/renting.ts';
import { rivalsFileSchema } from './schemas/rivals.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';

export type { GameContent } from './references.ts';
export type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
export type { CityData, DpeLabel, DwellingKind, Epoch, NeighbourhoodData } from './schemas/city.ts';
export { DPE_LABELS, EPOCHS } from './schemas/city.ts';
export type { Job, JobsFile } from './schemas/jobs.ts';
export type {
  Condition,
  DefectRule,
  ListingTexts,
  MarketRules,
  Motivation,
} from './schemas/market.ts';
export { CONDITIONS } from './schemas/market.ts';
export type { RentingRules } from './schemas/renting.ts';
export type { Rival, RivalsFile } from './schemas/rivals.ts';
export type { LivingCosts, Start } from './schemas/start.ts';
export type { TimeSettings } from './schemas/time.ts';
export type { UiTexts } from './schemas/ui-texts.ts';
export { checkReferences };

const jobsFile = jobsFileSchema.parse(jobsJson);
const rivalsFile = rivalsFileSchema.parse(rivalsJson);

/** Gameplay content handed to the engine. */
export const gameContent: GameContent = {
  start: startSchema.parse(startJson),
  livingCosts: livingCostsSchema.parse(livingCostsJson),
  jobs: jobsFile.jobs,
  unemployedFreeTimeMinutes: jobsFile.unemployedFreeTimeMinutes,
  credit: creditRulesSchema.parse(creditJson),
  banks: banksFileSchema.parse(banksJson).banks,
  marketRate: marketRateSchema.parse(marketRateJson),
  market: marketRulesSchema.parse(marketJson),
  listingTexts: listingTextsSchema.parse(listingTextsJson),
  renting: rentingRulesSchema.parse(rentingJson),
  rivalRules: rivalsFile.aggressiveness,
  rivals: rivalsFile.rivals,
  cities: { dole: cityDataSchema.parse(doleJson) },
};

const referenceProblems = checkReferences(gameContent);
if (referenceProblems.length > 0) {
  throw new Error(`Invalid content references:\n${referenceProblems.join('\n')}`);
}

export const jobs = gameContent.jobs;
export const timeSettings = timeSettingsSchema.parse(timeJson);
export const uiTexts = uiTextsSchema.parse(uiTextsJson);
