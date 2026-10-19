import { z } from 'zod';
import { euros, id, share } from './common.ts';

const minutes = z.number().int().min(1);

/** One trip between two cities, in both directions (docs/03-systemes/08, « Les déplacements »). */
const tripSchema = z
  .object({
    a: id,
    b: id,
    /** One way; a round trip costs twice as much time. */
    oneWayMinutes: minutes,
    /** Fuel, tolls or tickets for the whole round trip. */
    roundTripCostEuros: euros,
  })
  .strict();

const cityTextSchema = z
  .object({
    /** Market profile, one or two sentences (the region map's sheet). */
    profile: z.string().min(1),
    /** Landmarks of the street scenery. */
    decor: z.string().min(1),
  })
  .strict();

/** Cities, trips, remote management, local renown and moving (milestone 7, content/villes.json). */
export const citiesRulesSchema = z
  .object({
    trips: z.array(tripSchema).min(1),
    /** Round trip charged for a pair that is not in `trips` (a new city before its table is written). */
    fallbackTrip: z.object({ oneWayMinutes: minutes, roundTripCostEuros: euros }).strict(),
    /**
     * Share of a city's real yearly sales that appear as listings (1 = all, as in Dole).
     * Dijon sells eight times more than Dole: showing all of it would bury the player.
     */
    listingFlowShare: z.record(id, z.number().positive().max(1)),
    /**
     * Demand of each city relative to Dole: how fast other buyers take listings and how
     * often tenants apply (students in Dijon and Besançon, empty flats in Chalon).
     */
    demand: z.record(
      id,
      z.object({ buyers: z.number().positive(), tenants: z.number().positive() }).strict(),
    ),
    remote: z
      .object({
        /** Monthly fee for each property of another city that the owner manages himself. */
        monthlyFeePerPropertyEuros: euros,
      })
      .strict(),
    renown: z
      .object({
        /** Share of every reputation change that also moves the renown of the city concerned. */
        share: z.number().min(0).max(2),
        /** An off-market offer picks the city in proportion to its renown plus this base weight (home city). */
        homeCityWeight: z.number().min(0),
        /** Monthly chance of a local off-market offer at 100 renown (proportional below). */
        maxLocalOffMarketChancePerMonth: share,
        /** Share of the waiting list an artisan skips per renown point of his city. */
        queueCutPerPoint: z.number().min(0),
      })
      .strict(),
    moving: z
      .object({
        costEuros: euros,
        /** Minimum days between two moves. */
        cooldownDays: z.number().int().min(0),
        /** Rent in the new city = start rent × the city's small-flat rent per m² ÷ the start city's. */
        roundRentToEuros: z.number().int().min(1),
      })
      .strict(),
    /** Where each city sits on the region map (degrees). */
    positions: z.record(id, z.object({ lon: z.number(), lat: z.number() }).strict()),
    texts: z.record(id, cityTextSchema),
  })
  .strict();

export type CitiesRules = z.infer<typeof citiesRulesSchema>;
export type CityText = z.infer<typeof cityTextSchema>;
