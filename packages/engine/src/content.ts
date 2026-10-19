import type {
  Achievement,
  AdviceKind,
  Anecdote,
  CalendarRules,
  CatalogEvent,
  Challenge,
  ChallengeGiver,
  EventChoice,
  EventConditions,
  CrisisModifier,
  EventEffect,
  EventTarget,
  Mode,
  Stat,
  StatCondition,
  Title,
  Agency,
  Artisan,
  Bank,
  CityData,
  Condition,
  DecisionKind,
  DefectRule,
  DpeLabel,
  DwellingKind,
  Epoch,
  GameContent,
  HazardRule,
  IncidentRule,
  ItemKind,
  ItemRule,
  Job,
  LeaseType,
  LifeEventRule,
  MarketRules,
  Moment,
  Motivation,
  NeighbourhoodData,
  ResolutionRule,
  Rival,
  Season,
  SpaceKind,
  TenantProfile,
  Tier,
  Trade,
  Weather,
} from '@cle/content';

export type {
  Achievement,
  AdviceKind,
  Anecdote,
  CalendarRules,
  CatalogEvent,
  Challenge,
  ChallengeGiver,
  EventChoice,
  EventConditions,
  CrisisModifier,
  EventEffect,
  EventTarget,
  Mode,
  Stat,
  StatCondition,
  Title,
  Agency,
  Artisan,
  Bank,
  CityData,
  Condition,
  DecisionKind,
  DefectRule,
  DpeLabel,
  DwellingKind,
  Epoch,
  GameContent,
  HazardRule,
  IncidentRule,
  ItemKind,
  ItemRule,
  Job,
  LeaseType,
  LifeEventRule,
  MarketRules,
  Moment,
  Motivation,
  NeighbourhoodData,
  ResolutionRule,
  Rival,
  Season,
  SpaceKind,
  TenantProfile,
  Tier,
  Trade,
  Weather,
};

export function findJob(content: GameContent, jobId: string): Job {
  const job = content.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new RangeError(`Unknown job ${jobId}`);
  return job;
}

export function findBank(content: GameContent, bankId: string): Bank | undefined {
  return content.banks.find((candidate) => candidate.id === bankId);
}

export function findCity(content: GameContent, cityId: string): CityData {
  const city = content.cities[cityId];
  if (!city) throw new RangeError(`Unknown city ${cityId}`);
  return city;
}

export function findNeighbourhood(
  content: GameContent,
  cityId: string,
  neighbourhoodId: string,
): NeighbourhoodData {
  const neighbourhood = findCity(content, cityId).neighbourhoods.find(
    (candidate) => candidate.id === neighbourhoodId,
  );
  if (!neighbourhood) throw new RangeError(`Unknown neighbourhood ${cityId}/${neighbourhoodId}`);
  return neighbourhood;
}

export function findAgency(content: GameContent, agencyId: string): Agency | undefined {
  return content.renting.agencies.find((candidate) => candidate.id === agencyId);
}

export function findTenantProfile(content: GameContent, profileId: string): TenantProfile {
  const profile = content.renting.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new RangeError(`Unknown tenant profile ${profileId}`);
  return profile;
}

export function findArtisan(content: GameContent, artisanId: string): Artisan | undefined {
  return content.artisans.find((candidate) => candidate.id === artisanId);
}
