import { z } from 'zod';
import { euros, id, share } from './common.ts';

/** Generated city files (data/cities/<ville>.json), produced by tools/data. */

export const DWELLING_KINDS = ['apartment', 'house'] as const;
export const dwellingKindSchema = z.enum(DWELLING_KINDS);

export const DPE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const dpeLabelSchema = z.enum(DPE_LABELS);

/** Construction epochs, grouped from the ADEME periods. */
export const EPOCHS = [
  'before1948',
  'from1948to1974',
  'from1975to1988',
  'from1989to2005',
  'from2006to2012',
  'after2012',
] as const;
export const epochSchema = z.enum(EPOCHS);

const SHARE_TOLERANCE = 0.005;

/** Shares indexed by a fixed set of keys, summing to 1. */
function sharesOf<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.record(z.enum(keys), share).refine(
    (value) => {
      const total = (Object.values(value) as number[]).reduce((a, b) => a + b, 0);
      return Math.abs(total - 1) < SHARE_TOLERANCE;
    },
    { message: 'La somme des parts doit valoir 1.' },
  );
}

export const dpeSharesSchema = sharesOf(DPE_LABELS);
export const epochSharesSchema = sharesOf(EPOCHS);

/** Point in metres from the map origin: x towards the east, y towards the north. */
const point = z.tuple([z.number().int(), z.number().int()]);
const line = z.array(point).min(2);

const surfaceBinSchema = z
  .object({ min: z.number().positive(), max: z.number().positive(), share })
  .strict()
  .refine((bin) => bin.max > bin.min, { message: 'max doit dépasser min.' });

const salesStatsSchema = z
  .object({
    /** Sales observed in DVF over the period (single-dwelling sales). */
    count: z.number().int().min(0),
    perYear: z.number().min(0),
    /** Price per m², brought to the data date; blended with the commune when sales are few. */
    pricePerM2: z
      .object({ median: euros, q1: euros, q3: euros, p90: euros })
      .strict()
      .refine((p) => p.q1 <= p.median && p.median <= p.q3 && p.q3 <= p.p90, {
        message: 'Quartiles dans le désordre.',
      }),
    medianSurface: z.number().positive(),
    surfaceBins: z.array(surfaceBinSchema).min(1),
  })
  .strict();

const byKind = <T extends z.ZodType>(schema: T) =>
  z.object({ apartment: schema, house: schema }).strict();

const rentSchema = z
  .object({ smallApartment: euros, largeApartment: euros, house: euros })
  .strict();

export const neighbourhoodDataSchema = z
  .object({
    id,
    name: z.string().min(1),
    /** INSEE IRIS codes grouped into this neighbourhood. */
    iris: z.array(z.string().regex(/^\d{9}$/)).min(1),
    outlines: z.array(z.array(point).min(3)).min(1),
    sales: byKind(salesStatsSchema),
    /** Observed yearly price trend, in percent, shrunk towards the commune's. */
    trendPercentPerYear: z.number(),
    /** Monthly asking rent per m², charges included, scaled from the commune by price. */
    rentPerM2: rentSchema,
    epochShares: byKind(epochSharesSchema),
    /** Observed DPE labels (information; listings draw from the epoch tables). */
    dpeShares: byKind(dpeSharesSchema),
    amenities: z
      .object({
        schools: z.number().int().min(0),
        health: z.number().int().min(0),
        shops: z.number().int().min(0),
        leisure: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export const cityDataSchema = z
  .object({
    id,
    name: z.string().min(1),
    inseeCode: z.string().regex(/^\d[\dAB]\d{3}$/),
    population: z.number().int().positive(),
    /** Date of the most recent sale used: the simulation starts from these values. */
    dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period: z.object({ from: z.string(), to: z.string() }).strict(),
    sources: z.array(z.string().min(1)).min(1),
    attribution: z.string().min(1),
    commune: z
      .object({
        sales: byKind(salesStatsSchema),
        trendPercentPerYear: z.number(),
        /** d log(price per m²) / d log(surface), fitted on the commune's sales. */
        surfaceElasticity: byKind(z.number()),
        /** Median living area per main room. */
        m2PerRoom: byKind(z.number().positive()),
        rentPerM2: rentSchema,
        rentYear: z.number().int(),
        /** DPE label shares by construction epoch (ADEME, whole commune). */
        dpeByEpoch: byKind(z.record(epochSchema, dpeSharesSchema)),
      })
      .strict(),
    neighbourhoods: z.array(neighbourhoodDataSchema).min(1),
    map: z
      .object({
        /** Longitude and latitude of the map origin (south-west corner). */
        origin: z.tuple([z.number(), z.number()]),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        rivers: z.array(
          z
            .object({ name: z.string(), kind: z.enum(['river', 'canal']), lines: z.array(line) })
            .strict(),
        ),
        roads: z.array(
          z.object({ importance: z.number().int().min(1).max(5), lines: z.array(line) }).strict(),
        ),
        railways: z.array(line),
        parks: z.array(
          z.object({ name: z.string(), outlines: z.array(z.array(point).min(3)) }).strict(),
        ),
        landmarks: z.array(
          z.object({ id, name: z.string(), point, neighbourhoodId: id.nullable() }).strict(),
        ),
      })
      .strict(),
  })
  .strict();

export type DwellingKind = z.infer<typeof dwellingKindSchema>;
export type DpeLabel = z.infer<typeof dpeLabelSchema>;
export type Epoch = z.infer<typeof epochSchema>;
export type NeighbourhoodData = z.infer<typeof neighbourhoodDataSchema>;
export type CityData = z.infer<typeof cityDataSchema>;
