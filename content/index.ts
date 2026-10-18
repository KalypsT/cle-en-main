import banksJson from './banques.json' with { type: 'json' };
import creditJson from './credit.json' with { type: 'json' };
import jobsJson from './metiers.json' with { type: 'json' };
import startJson from './partie.json' with { type: 'json' };
import marketRateJson from './taux.json' with { type: 'json' };
import timeJson from './temps.json' with { type: 'json' };
import uiTextsJson from './textes/interface.json' with { type: 'json' };
import livingCostsJson from './train-de-vie.json' with { type: 'json' };
import { checkReferences, type GameContent } from './references.ts';
import { banksFileSchema, creditRulesSchema, marketRateSchema } from './schemas/credit.ts';
import { jobsFileSchema } from './schemas/jobs.ts';
import { livingCostsSchema, startSchema } from './schemas/start.ts';
import { timeSettingsSchema } from './schemas/time.ts';
import { uiTextsSchema } from './schemas/ui-texts.ts';

export type { GameContent } from './references.ts';
export type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
export type { Job, JobsFile } from './schemas/jobs.ts';
export type { LivingCosts, Start } from './schemas/start.ts';
export type { TimeSettings } from './schemas/time.ts';
export type { UiTexts } from './schemas/ui-texts.ts';
export { checkReferences };

const jobsFile = jobsFileSchema.parse(jobsJson);

/** Gameplay content handed to the engine. */
export const gameContent: GameContent = {
  start: startSchema.parse(startJson),
  livingCosts: livingCostsSchema.parse(livingCostsJson),
  jobs: jobsFile.jobs,
  unemployedFreeTimeMinutes: jobsFile.unemployedFreeTimeMinutes,
  credit: creditRulesSchema.parse(creditJson),
  banks: banksFileSchema.parse(banksJson).banks,
  marketRate: marketRateSchema.parse(marketRateJson),
};

const referenceProblems = checkReferences(gameContent);
if (referenceProblems.length > 0) {
  throw new Error(`Invalid content references:\n${referenceProblems.join('\n')}`);
}

export const jobs = gameContent.jobs;
export const timeSettings = timeSettingsSchema.parse(timeJson);
export const uiTexts = uiTextsSchema.parse(uiTextsJson);
