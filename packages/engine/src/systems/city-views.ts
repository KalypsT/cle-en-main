import { findCity, type GameContent } from '../content.ts';
import type { Cents } from '../money.ts';
import type { GameState } from '../state.ts';
import { homeRent, remoteManagementFee, renownOf } from './cities.ts';
import { knownArtisans } from './works.ts';
import { neighbourhoodMarkets } from './ui-queries.ts';
import { pendingTrip, tripBetween } from './travel.ts';

/** The region map's sheet of a city (docs/03-systemes/08, « La carte »). */
export interface CitySheet {
  cityId: string;
  name: string;
  population: number;
  /** The player's base: trips are counted from it. */
  isBase: boolean;
  profile: string;
  decor: string;
  /** Round trip from the base; zero for the base itself. */
  trip: { minutes: number; cost: Cents };
  /** Sales-weighted median price per m² of an apartment, and the same for a house. */
  apartmentPricePerM2: Cents;
  housePricePerM2: Cents;
  /** Rent per m² of a small apartment, charges included. */
  rentPerM2: Cents;
  /** Yearly rent over price for a small apartment, in percent. */
  grossYieldPercent: number;
  /** Sales-weighted yearly trend of the prices, in percent. */
  trendPercent: number;
  /** Real yearly sales in the data, and listings online now: how lively the market is. */
  salesPerYear: number;
  listingsOnline: number;
  renown: number;
  propertiesOwned: number;
  /** Monthly fee for each property of this city managed without an agency (0 in the base). */
  remoteFeePerProperty: Cents;
  /** Artisans in the player's address book there. */
  artisansKnown: number;
  /** Works cost index of the city (1 = reference). */
  worksCostIndex: number;
  /** Monthly rent of the player's home if he moved there. */
  homeRent: Cents;
}

function weighted(values: { value: number; weight: number }[]): number {
  const total = values.reduce((sum, v) => sum + v.weight, 0);
  if (total === 0) return 0;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / total;
}

export function citySheet(content: GameContent, state: GameState, cityId: string): CitySheet {
  const city = findCity(content, cityId);
  const markets = neighbourhoodMarkets(content, state, cityId);
  const rows = city.neighbourhoods.map((neighbourhood, i) => {
    const market = markets[i];
    const index = state.market.cities[cityId]?.[neighbourhood.id]?.priceIndex ?? 1;
    return {
      weight: neighbourhood.sales.apartment.perYear + neighbourhood.sales.house.perYear,
      apartment: market?.pricePerM2 ?? 0,
      house: Math.round(neighbourhood.sales.house.pricePerM2.median * index * 100),
      rent: market?.rentPerM2 ?? 0,
      trend: market?.trendPercent ?? 0,
    };
  });
  const apartment = weighted(rows.map((r) => ({ value: r.apartment, weight: r.weight })));
  const rent = weighted(rows.map((r) => ({ value: r.rent, weight: r.weight })));
  const isBase = state.player.baseCityId === cityId;
  const text = content.citiesRules.texts[cityId];
  return {
    cityId,
    name: city.name,
    population: city.population,
    isBase,
    profile: text?.profile ?? '',
    decor: text?.decor ?? '',
    trip: tripBetween(content, state.player.baseCityId, cityId),
    apartmentPricePerM2: Math.round(apartment),
    housePricePerM2: Math.round(weighted(rows.map((r) => ({ value: r.house, weight: r.weight })))),
    rentPerM2: Math.round(rent),
    grossYieldPercent: apartment > 0 ? (rent * 12 * 100) / apartment : 0,
    trendPercent:
      Math.round(weighted(rows.map((r) => ({ value: r.trend, weight: r.weight }))) * 100) / 100,
    salesPerYear: Math.round(rows.reduce((sum, r) => sum + r.weight, 0)),
    listingsOnline: state.listings.filter((l) => l.property.cityId === cityId).length,
    renown: renownOf(state, cityId),
    propertiesOwned: state.properties.filter((o) => o.property.cityId === cityId).length,
    remoteFeePerProperty: isBase ? 0 : remoteManagementFee(content),
    artisansKnown: knownArtisans(content, state, cityId).length,
    worksCostIndex: content.works.cityCostIndex[cityId] ?? 1,
    homeRent: homeRent(content, cityId),
  };
}

/** Sheets of every city of the game, the base first. */
export function citySheets(content: GameContent, state: GameState): CitySheet[] {
  return Object.keys(content.cities)
    .map((cityId) => citySheet(content, state, cityId))
    .sort((a, b) => Number(b.isBase) - Number(a.isBase) || a.name.localeCompare(b.name, 'fr'));
}

/** What a visit costs now: the visit itself and the trip, if the day's trip is not made yet. */
export interface VisitQuote {
  cityId: string;
  minutes: number;
  tripMinutes: number;
  tripCost: Cents;
}

export function visitQuote(
  content: GameContent,
  state: GameState,
  listingId: string,
): VisitQuote | null {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return null;
  const { cityId } = listing.property;
  const trip = pendingTrip({ content, state }, cityId);
  const { minutes, travelMinutes } = content.market.visit;
  return {
    cityId,
    minutes: minutes + travelMinutes,
    tripMinutes: trip.minutes,
    tripCost: trip.cost,
  };
}
