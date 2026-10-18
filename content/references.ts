import type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
import type { Job } from './schemas/jobs.ts';
import type { LivingCosts, Start } from './schemas/start.ts';

export interface GameContent {
  start: Start;
  livingCosts: LivingCosts;
  jobs: Job[];
  unemployedFreeTimeMinutes: number;
  credit: CreditRules;
  banks: Bank[];
  marketRate: MarketRate;
}

/** Checks links between content files that a single schema cannot see. */
export function checkReferences(content: GameContent): string[] {
  const problems: string[] = [];
  const jobIds = new Set(content.jobs.map((job) => job.id));
  const bankIds = new Set(content.banks.map((bank) => bank.id));
  if (!jobIds.has(content.start.defaultJobId)) {
    problems.push(`partie.json : métier inconnu « ${content.start.defaultJobId} »`);
  }
  if (!bankIds.has(content.start.accountBankId)) {
    problems.push(`partie.json : banque inconnue « ${content.start.accountBankId} »`);
  }
  const { credit } = content;
  for (const years of [
    credit.minDurationYears,
    credit.maxDurationYears,
    credit.maxDurationWithWorksYears,
  ]) {
    const known = Object.keys(credit.durationSpreadPercent).map(Number);
    if (years < Math.min(...known) || years > Math.max(...known)) {
      problems.push(`credit.json : aucun écart de taux ne couvre ${years} ans`);
    }
  }
  if (credit.maxDurationWithWorksYears < credit.maxDurationYears) {
    problems.push('credit.json : la durée avec travaux doit dépasser la durée normale');
  }
  return problems;
}
