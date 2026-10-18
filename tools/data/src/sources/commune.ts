import { downloadJson } from '../http.ts';

export interface Commune {
  name: string;
  population: number;
  centre: [number, number];
}

/** Legal population and centre of a commune (INSEE through geo.api.gouv.fr). */
export async function loadCommune(inseeCode: string): Promise<Commune> {
  const body = await downloadJson<{
    nom: string;
    population: number;
    centre: { coordinates: [number, number] };
  }>(
    `https://geo.api.gouv.fr/communes/${inseeCode}?fields=nom,population,centre`,
    `commune-${inseeCode}.json`,
  );
  return { name: body.nom, population: body.population, centre: body.centre.coordinates };
}
