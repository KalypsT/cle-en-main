import { z } from 'zod';
import { epochSchema } from './city.ts';
import { id, share } from './common.ts';

/** Moments of the day, in order (docs/05, section 5.4). */
export const MOMENTS = ['morning', 'day', 'evening', 'night'] as const;
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export const WEATHERS = ['sun', 'clouds', 'rain', 'snow', 'fog'] as const;

const text = z.string().min(1);
const hour = z.number().int().min(0).max(23);
/** A day of the year: [month, day]. */
const monthDay = z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(31)]);
const range = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .strict()
  .refine((r) => r.max >= r.min, { message: 'max doit être supérieur ou égal à min.' });

const weatherShares = z.record(z.enum(WEATHERS), share).refine(
  (value) => {
    const total = Object.values(value).reduce((a, b) => a + b, 0);
    return Math.abs(total - 1) < 0.005;
  },
  { message: 'La somme des parts doit valoir 1.' },
);

const streetSchema = z
  .object({
    id,
    name: text,
    /** Ordinary buildings drawn along the street (the player's and the listings come on top). */
    buildings: z.number().int().min(1).max(30),
    /** The street runs along water (the canal, the Doubs): a quay, and fog in the morning. */
    quay: z.boolean().default(false),
  })
  .strict();

const neighbourhoodWorldSchema = z
  .object({
    /** Share of the ordinary buildings with a shop on the ground floor. */
    shopShare: share,
    /** Share of trees between the buildings. */
    treeShare: share,
    streets: z.array(streetSchema).min(1),
  })
  .strict();

/**
 * The living world of milestone 5 (content/monde.json): moments of the day,
 * seasons, weather, streets of each neighbourhood and the shape of buildings.
 * Nothing here changes the simulation: the engine only reads it in queries.
 */
export const worldRulesSchema = z
  .object({
    /** First hour of each moment of the day. */
    momentStartHours: z.record(z.enum(MOMENTS), hour),
    /** First day of each season. */
    seasonStarts: z.record(z.enum(SEASONS), monthDay),
    /** Christmas decorations, from this day to that one (across the new year). */
    christmas: z.object({ from: monthDay, to: monthDay }).strict(),
    /** Hours the church bells ring. */
    bellHours: z.array(hour),
    weather: z
      .object({
        /** Weather lasts between 1 and `maxDays` days. */
        maxDays: z.number().int().min(1).max(10),
        /** Chance that a new weather starts on a given day (before `maxDays`). */
        changeChance: share,
        bySeason: z.record(z.enum(SEASONS), weatherShares),
        /** Fog only stays during these moments (it lifts during the day), and only on quays. */
        fogMoments: z.array(z.enum(MOMENTS)).min(1),
      })
      .strict(),
    /** Floors of a building by construction epoch (ground floor included). */
    floors: z
      .object({
        apartment: z.record(epochSchema, range),
        house: z.record(epochSchema, range),
        building: z.record(epochSchema, range),
      })
      .strict(),
    /** Flats per floor in the cross-section of an apartment block. */
    flatsPerFloor: range,
    /** Which floor of a house each kind of room goes to (0 = ground floor). */
    houseRoomFloors: z.record(z.string(), z.number().int().min(0)),
    /** Bubbles shown at most above one building. */
    maxBubbles: z.number().int().min(1),
    cities: z.record(z.string(), z.record(z.string(), neighbourhoodWorldSchema)),
  })
  .strict();

export type WorldRules = z.infer<typeof worldRulesSchema>;
export type Moment = (typeof MOMENTS)[number];
export type Season = (typeof SEASONS)[number];
export type Weather = (typeof WEATHERS)[number];
