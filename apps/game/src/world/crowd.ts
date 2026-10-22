import type { Moment, Season, StreetView, Weather } from '@cle/engine';

/*
 * How many passers-by, cars and birds the street shows at once (docs/05, 5.6):
 * by moment and season, by weather, and by the street itself (shops bring
 * people, houses fewer, the quays no cars). Decoration only.
 */

export interface Crowd {
  people: number;
  cars: number;
  birds: number;
}

/** For a view of REFERENCE_WIDTH world units (a phone held upright). */
const PEOPLE: Record<Moment, number> = { morning: 6, day: 9, evening: 7, night: 2 };
const CARS: Record<Moment, number> = { morning: 3, day: 3, evening: 2, night: 1 };
const BIRDS: Record<Moment, number> = { morning: 5, day: 3, evening: 2, night: 0 };
const REFERENCE_WIDTH = 420;

/** Lively summer evenings, empty winter nights. */
const SEASON: Record<Season, Partial<Record<Moment, number>>> = {
  spring: { evening: 1.1 },
  summer: { day: 1.1, evening: 1.35, night: 1.6 },
  autumn: { evening: 0.9 },
  winter: { morning: 0.85, evening: 0.75, night: 0.5 },
};

const WEATHER: Record<Weather, number> = { sun: 1, clouds: 0.95, fog: 0.75, rain: 0.55, snow: 0.6 };

export interface CrowdContext {
  moment: Moment;
  season: Season;
  weather: Weather;
  street: StreetView | null;
  /** Width of the view, in world units. */
  viewWidth: number;
  /** Share of the people kept by the graphics quality (0 … 1). */
  quality: number;
  birds: boolean;
}

export function crowdOf(context: CrowdContext): Crowd {
  const { moment, season, weather, street } = context;
  const buildings = street?.buildings ?? [];
  const count = Math.max(1, buildings.length);
  const shops = buildings.filter((building) => building.shop).length / count;
  const houses = buildings.filter((building) => building.kind === 'house').length / count;
  // A shopping street is busier than a row of houses; a quay draws walkers in the sun.
  let liveliness = (0.75 + shops) * (1 - houses * 0.45);
  if (street?.quay) liveliness *= weather === 'sun' ? 1.15 : 0.8;
  const width = Math.max(0.8, Math.min(3, context.viewWidth / REFERENCE_WIDTH));
  const period = SEASON[season][moment] ?? 1;
  const people = PEOPLE[moment] * period * WEATHER[weather] * liveliness * context.quality * width;
  const cars = street?.quay ? 0 : CARS[moment] * (1 - houses * 0.35) * width;
  const flying = context.birds && weather !== 'rain' && weather !== 'snow';
  return {
    people: Math.max(1, Math.round(people)),
    cars: Math.round(cars),
    birds: flying ? Math.round(BIRDS[moment] * Math.min(width, 1.5)) : 0,
  };
}
