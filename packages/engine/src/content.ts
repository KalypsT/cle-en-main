import type {
  Bank,
  CityData,
  Condition,
  DefectRule,
  DpeLabel,
  DwellingKind,
  Epoch,
  GameContent,
  Job,
  MarketRules,
  Motivation,
  NeighbourhoodData,
} from '@cle/content';

export type {
  Bank,
  CityData,
  Condition,
  DefectRule,
  DpeLabel,
  DwellingKind,
  Epoch,
  GameContent,
  Job,
  MarketRules,
  Motivation,
  NeighbourhoodData,
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
