import type { CityData } from './schemas/city.ts';
import type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
import type { Job } from './schemas/jobs.ts';
import type { ListingTexts, MarketRules } from './schemas/market.ts';
import type { LivingCosts, Start } from './schemas/start.ts';

export interface GameContent {
  start: Start;
  livingCosts: LivingCosts;
  jobs: Job[];
  unemployedFreeTimeMinutes: number;
  credit: CreditRules;
  banks: Bank[];
  marketRate: MarketRate;
  market: MarketRules;
  listingTexts: ListingTexts;
  /** Generated city data, by city id. */
  cities: Record<string, CityData>;
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
  if (!content.cities[content.start.cityId]) {
    problems.push(`partie.json : ville inconnue « ${content.start.cityId} »`);
  }
  for (const [cityId, city] of Object.entries(content.cities)) {
    const ids = city.neighbourhoods.map((n) => n.id);
    if (new Set(ids).size !== ids.length)
      problems.push(`data/cities/${cityId}.json : quartier en double`);
  }
  const { market, listingTexts } = content;
  for (const motivation of market.motivations) {
    if (!listingTexts.motivations[motivation.id]) {
      problems.push(`textes/annonces.json : aucun texte pour la motivation « ${motivation.id} »`);
    }
  }
  for (const defect of market.defects) {
    if (!listingTexts.defects[defect.id]) {
      problems.push(`textes/annonces.json : aucun texte pour le défaut « ${defect.id} »`);
    }
  }
  if (!('0' in market.apartment.floorFactors)) {
    problems.push('marche.json : le facteur du rez-de-chaussée (étage 0) manque');
  }
  for (const [epoch, weights] of Object.entries(market.conditionWeights)) {
    if (Object.values(weights).every((weight) => weight === 0)) {
      problems.push(`marche.json : aucun état possible pour l'époque « ${epoch} »`);
    }
  }
  return problems;
}
