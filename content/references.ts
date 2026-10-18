import type { CityData } from './schemas/city.ts';
import type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
import type { Job } from './schemas/jobs.ts';
import type { ListingTexts, MarketRules } from './schemas/market.ts';
import type { RentingRules, TenantTexts } from './schemas/renting.ts';
import type { TaxRules } from './schemas/taxes.ts';
import type { Rival, RivalsFile } from './schemas/rivals.ts';
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
  renting: RentingRules;
  tenantTexts: TenantTexts;
  taxes: TaxRules;
  rivalRules: RivalsFile['aggressiveness'];
  rivals: Rival[];
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
  if (market.motivations.every((motivation) => motivation.weight === 0)) {
    problems.push('marche.json : aucune motivation de vendeur ordinaire (poids positif)');
  }
  const motivationIds = new Set(market.motivations.map((motivation) => motivation.id));
  for (const rival of content.rivals) {
    for (const cityId of rival.cities) {
      const city = content.cities[cityId];
      if (!city) {
        problems.push(`rivaux.json : ville inconnue « ${cityId} » (${rival.id})`);
        continue;
      }
      const known = new Set(city.neighbourhoods.map((n) => n.id));
      for (const neighbourhoodId of Object.keys(rival.preferences.neighbourhoods)) {
        if (!known.has(neighbourhoodId)) {
          problems.push(`rivaux.json : quartier inconnu « ${neighbourhoodId} » (${rival.id})`);
        }
      }
    }
    if (rival.flip && !motivationIds.has(rival.flip.motivationId)) {
      problems.push(`rivaux.json : motivation inconnue « ${rival.flip.motivationId} »`);
    }
  }
  for (const [epoch, weights] of Object.entries(market.conditionWeights)) {
    if (Object.values(weights).every((weight) => weight === 0)) {
      problems.push(`marche.json : aucun état possible pour l'époque « ${epoch} »`);
    }
  }
  problems.push(...checkRentingReferences(content));
  return problems;
}

function checkRentingReferences(content: GameContent): string[] {
  const problems: string[] = [];
  const { renting, tenantTexts } = content;
  const unique = (ids: string[], what: string) => {
    if (new Set(ids).size !== ids.length) problems.push(`location.json : ${what} en double`);
  };
  unique(
    renting.profiles.map((p) => p.id),
    'profil',
  );
  unique(
    renting.traits.map((t) => t.id),
    'trait',
  );
  unique(
    renting.agencies.map((a) => a.id),
    'agence',
  );
  unique(
    renting.incidents.map((i) => i.id),
    'incident',
  );
  unique(
    renting.lifeEvents.events.map((e) => e.id),
    'événement de vie',
  );
  const profileIds = new Set(renting.profiles.map((p) => p.id));
  const texts: [string, { id: string }[], Record<string, string>][] = [
    ['profil', renting.profiles, tenantTexts.profiles],
    ['trait', renting.traits, tenantTexts.traits],
    ['incident', renting.incidents, tenantTexts.incidents],
    ['événement de vie', renting.lifeEvents.events, tenantTexts.lifeEvents],
  ];
  for (const [what, rules, byId] of texts) {
    for (const rule of rules) {
      if (!byId[rule.id]) {
        problems.push(`textes/locataires.json : aucun texte pour le ${what} « ${rule.id} »`);
      }
    }
  }
  for (const event of renting.lifeEvents.events) {
    for (const profileId of event.profiles ?? []) {
      if (!profileIds.has(profileId)) {
        problems.push(`location.json : profil inconnu « ${profileId} » (${event.id})`);
      }
    }
  }
  for (const type of ['bare', 'furnished'] as const) {
    if (renting.profiles.every((p) => p.weights[type] === 0)) {
      problems.push(`location.json : aucun candidat possible pour le bail « ${type} »`);
    }
  }
  if (renting.rentRange.min > 1 || renting.rentRange.max < 1) {
    problems.push('location.json : la fourchette de loyer doit contenir le loyer de marché');
  }
  return problems;
}
