import type { CityData } from './schemas/city.ts';
import type { DecisionRules } from './schemas/decisions.ts';
import type { Bank, CreditRules, MarketRate } from './schemas/credit.ts';
import type { Job } from './schemas/jobs.ts';
import type { ListingTexts, MarketRules } from './schemas/market.ts';
import type { RentingRules, TenantTexts } from './schemas/renting.ts';
import type { TaxRules } from './schemas/taxes.ts';
import type { Rival, RivalsFile } from './schemas/rivals.ts';
import type { LivingCosts, Start } from './schemas/start.ts';
import type { Artisan, ArtisansFile, WorksRules, WorksTexts } from './schemas/works.ts';
import type { WorldRules } from './schemas/world.ts';
import type { Anecdote, CatalogEvent, RhythmRules } from './schemas/events.ts';
import type { CalendarRules, ModesFile } from './schemas/modes.ts';
import type {
  Achievement,
  ChallengesFile,
  ProgressionRules,
  StatCondition,
  Title,
  YvonTexts,
} from './schemas/progression.ts';

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
  works: WorksRules;
  trades: ArtisansFile['trades'];
  artisans: Artisan[];
  worksTexts: WorksTexts;
  decisions: DecisionRules;
  /** Moments, seasons, weather and streets (milestone 5): read by queries only. */
  world: WorldRules;
  /** Game modes and their coefficients (docs/02, section 2.5). */
  modes: ModesFile;
  /** Public and school holidays (the full agenda, milestone 6). */
  calendar: CalendarRules;
  rhythm: RhythmRules;
  /** Reputation, records, chronicle. */
  progression: ProgressionRules;
  titles: Title[];
  achievements: Achievement[];
  challenges: ChallengesFile;
  /** The catalogue of events, every family together. */
  events: CatalogEvent[];
  anecdotes: Anecdote[];
  /** Yvon Tableur's advice at the yearly review. */
  yvon: YvonTexts;
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
  problems.push(...checkWorksReferences(content));
  problems.push(...checkWorldReferences(content));
  problems.push(...checkProgressionReferences(content));
  return problems;
}

function checkProgressionReferences(content: GameContent): string[] {
  const problems: string[] = [];
  const modeIds = new Set(content.modes.modes.map((mode) => mode.id));
  if (!modeIds.has(content.modes.defaultModeId)) {
    problems.push(`modes.json : mode par défaut inconnu « ${content.modes.defaultModeId} »`);
  }
  const bankIds = new Set(content.banks.map((bank) => bank.id));
  const rivalIds = new Set(content.rivals.map((rival) => rival.id));
  const jobIds = new Set(content.jobs.map((job) => job.id));
  const checkStats = (file: string, conditions: readonly StatCondition[] | undefined) => {
    for (const condition of conditions ?? []) {
      if (condition.stat === 'bankTrust' && !bankIds.has(condition.key ?? '')) {
        problems.push(`${file} : banque inconnue « ${condition.key} »`);
      }
      if (condition.stat === 'rivalBeaten' && !rivalIds.has(condition.key ?? '')) {
        problems.push(`${file} : rival inconnu « ${condition.key} »`);
      }
    }
  };
  const titleIds = new Set(content.titles.map((title) => title.id));
  if (!content.titles.some((title) => title.step === 0)) {
    problems.push('titres.json : aucun titre de départ (étape 0)');
  }
  for (const title of content.titles) {
    checkStats('titres.json', title.conditions);
    for (const required of title.requiresAny) {
      if (!titleIds.has(required))
        problems.push(`titres.json : titre requis inconnu « ${required} »`);
    }
  }
  for (const achievement of content.achievements) checkStats('succes.json', achievement.conditions);
  for (const challenge of content.challenges.challenges) {
    checkStats('defis.json', challenge.conditions);
    checkStats('defis.json', [{ ...challenge.goal, min: 0 }]);
  }
  const eventIds = new Set<string>();
  for (const event of content.events) {
    const file = `evenements (${event.id})`;
    if (eventIds.has(event.id)) problems.push(`${file} : id en double entre deux fichiers`);
    eventIds.add(event.id);
    checkStats(file, event.conditions.stats);
    for (const jobId of event.conditions.jobs ?? []) {
      if (!jobIds.has(jobId)) problems.push(`${file} : métier inconnu « ${jobId} »`);
    }
    const effects = [...(event.effects ?? []), ...(event.choices ?? []).flatMap((c) => c.effects)];
    for (const effect of effects) {
      if (effect.type === 'trust' && effect.bankId && !bankIds.has(effect.bankId)) {
        problems.push(`${file} : banque inconnue « ${effect.bankId} »`);
      }
      const needsProperty = ['satisfaction', 'item', 'tenantNotice', 'rent', 'worksDelay'];
      if (needsProperty.includes(effect.type) && event.target === 'none') {
        problems.push(`${file} : l'effet « ${effect.type} » demande un bien ciblé`);
      }
      if (effect.type === 'priceIndex' || effect.type === 'priceTrend') {
        if (effect.scope === 'neighbourhood' && event.target === 'none') {
          problems.push(`${file} : un effet sur le quartier demande un bien ciblé`);
        }
      }
      if (effect.type === 'rentMoney' && event.target !== 'lease') {
        problems.push(`${file} : une part du loyer demande un bail`);
      }
    }
  }
  const motivation = content.progression.effects.offMarketMotivationId;
  if (!content.market.motivations.some((m) => m.id === motivation)) {
    problems.push(`progression.json : motivation inconnue « ${motivation} »`);
  }
  for (const incidentId of content.decisions.seriousIncidents) {
    if (!content.renting.incidents.some((incident) => incident.id === incidentId)) {
      problems.push(`decisions.json : incident inconnu « ${incidentId} »`);
    }
  }
  return problems;
}

function checkWorldReferences(content: GameContent): string[] {
  const problems: string[] = [];
  const { world } = content;
  for (const [cityId, city] of Object.entries(content.cities)) {
    const streets = world.cities[cityId];
    if (!streets) {
      problems.push(`monde.json : aucune rue pour la ville « ${cityId} »`);
      continue;
    }
    for (const neighbourhood of city.neighbourhoods) {
      if (!streets[neighbourhood.id]) {
        problems.push(`monde.json : aucune rue pour le quartier « ${neighbourhood.id} »`);
      }
    }
    const known = new Set(city.neighbourhoods.map((n) => n.id));
    for (const neighbourhoodId of Object.keys(streets)) {
      if (!known.has(neighbourhoodId)) {
        problems.push(`monde.json : quartier inconnu « ${neighbourhoodId} » (${cityId})`);
      }
    }
    const ids = Object.values(streets).flatMap((n) => n.streets.map((street) => street.id));
    if (new Set(ids).size !== ids.length) problems.push(`monde.json : rue en double (${cityId})`);
  }
  for (const cityId of Object.keys(world.cities)) {
    if (!content.cities[cityId]) problems.push(`monde.json : ville inconnue « ${cityId} »`);
  }
  const hours = Object.values(world.momentStartHours);
  if (new Set(hours).size !== hours.length) {
    problems.push('monde.json : deux moments de la journée commencent à la même heure');
  }
  return problems;
}

function checkWorksReferences(content: GameContent): string[] {
  const problems: string[] = [];
  const { works, worksTexts } = content;
  const jobIds = new Set(content.jobs.map((job) => job.id));
  for (const [kind, rule] of Object.entries(works.items)) {
    const diy = rule.works?.diy;
    for (const jobId of diy?.jobs ?? []) {
      if (!jobIds.has(jobId)) problems.push(`travaux.json : métier inconnu « ${jobId} » (${kind})`);
    }
    if (diy && Math.abs(diy.quality[5] + diy.quality[4] + diy.quality[3] - 1) > 1e-9) {
      problems.push(`travaux.json : la qualité de « ${kind} » fait soi-même ne somme pas à 1`);
    }
    if (
      rule.scope === 'space' &&
      !Object.values(works.spaces).some((list) => list.includes(kind as never))
    ) {
      problems.push(`travaux.json : le poste « ${kind} » n'est dans aucune pièce`);
    }
  }
  const ids = new Set<string>();
  for (const artisan of content.artisans) {
    if (ids.has(artisan.id)) problems.push(`artisans.json : artisan en double « ${artisan.id} »`);
    ids.add(artisan.id);
    for (const cityId of artisan.cities) {
      if (!content.cities[cityId]) problems.push(`artisans.json : ville inconnue « ${cityId} »`);
    }
  }
  for (const cityId of Object.keys(content.cities)) {
    if (!works.cityCostIndex[cityId])
      problems.push(`travaux.json : pas d'indice de prix pour « ${cityId} »`);
    for (const [kind, rule] of Object.entries(works.items)) {
      const trade = rule.works?.trade;
      if (!trade) continue;
      const available = content.artisans.some(
        (a) => a.trade === trade && a.cities.includes(cityId) && a.unlockAfterWorks === 0,
      );
      if (!available) {
        problems.push(
          `artisans.json : aucun artisan « ${trade} » connu dès le départ à ${cityId} (${kind})`,
        );
      }
    }
  }
  for (const hazard of works.hazards) {
    if (!worksTexts.hazards[hazard.id])
      problems.push(`textes/travaux.json : aucun texte pour l'imprévu « ${hazard.id} »`);
  }
  for (const resolution of works.copro.resolutions) {
    if (!worksTexts.resolutions[resolution.id]) {
      problems.push(`textes/travaux.json : aucun texte pour la résolution « ${resolution.id} »`);
    }
  }
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
