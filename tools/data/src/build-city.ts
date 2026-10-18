import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CityData,
  cityDataSchema,
  DPE_LABELS,
  type DpeLabel,
  type DwellingKind,
  type Epoch,
  EPOCHS,
} from '@cle/content/schemas/city.ts';
import { dole } from '../cities/dole.ts';
import {
  binCounts,
  quantile,
  round,
  shares,
  shrink,
  slope,
  trendPercentPerYear,
  yearOf,
} from './aggregate.ts';
import { type CityConfig, SOURCES } from './config.ts';
import { insideBox, type LonLat, pointInRing, projector, simplify } from './geo.ts';
import { loadParcelCentroids } from './sources/cadastre.ts';
import { loadCommune } from './sources/commune.ts';
import { loadDpe } from './sources/dpe.ts';
import { type DvfSale, loadDvfSales } from './sources/dvf.ts';
import { loadIris } from './sources/iris.ts';
import { loadMap } from './sources/map.ts';
import { loadRents } from './sources/rents.ts';

const CITIES: Record<string, CityConfig> = { dole };

/** Modelling choices of the data pipeline (not gameplay numbers): see docs/06-donnees.md. */
const MODEL = {
  /** Sales kept for statistics: living area and price per m² within these bounds. */
  surface: { min: 9, max: 400 },
  perM2: { min: 200, max: 8000 },
  /** Pseudo-counts pulling small samples towards the commune. */
  priceShrinkSales: 10,
  shareShrink: 20,
  trendShrinkSales: 300,
  /** Recent window used to bring prices to the data date. */
  recentMonths: 12,
  /** Rents follow prices less than one for one between neighbourhoods. */
  rentPriceElasticity: 0.5,
  surfaceEdges: {
    apartment: [9, 25, 40, 55, 70, 90, 120, 200],
    house: [30, 60, 80, 100, 120, 150, 200, 400],
  },
  /** Map simplification tolerance and margin, in metres. */
  outlineTolerance: 12,
  lineTolerance: 15,
  mapMargin: 400,
} as const;

const ADEME_EPOCH: Record<string, Epoch> = {
  'avant 1948': 'before1948',
  '1948-1974': 'from1948to1974',
  '1975-1977': 'from1975to1988',
  '1978-1982': 'from1975to1988',
  '1983-1988': 'from1975to1988',
  '1989-2000': 'from1989to2005',
  '2001-2005': 'from1989to2005',
  '2006-2012': 'from2006to2012',
  '2013-2021': 'after2012',
  'après 2021': 'after2012',
};
const ADEME_KIND: Record<string, DwellingKind> = { appartement: 'apartment', maison: 'house' };
const KINDS: readonly DwellingKind[] = ['apartment', 'house'];

const AMENITY: Record<string, keyof CityData['neighbourhoods'][number]['amenities']> = {
  'Science et enseignement': 'schools',
  Santé: 'health',
  'Industriel et commercial': 'shops',
  'Culture et loisirs': 'leisure',
  Sport: 'leisure',
};

function salesStats(
  sales: readonly DvfSale[],
  kind: DwellingKind,
  level: number,
  reference: CityData['commune']['sales'][DwellingKind] | null,
  perYearDivisor: number,
) {
  const perM2 = sales.map((sale) => (sale.price / sale.surface) * level);
  const surfaces = sales.map((sale) => sale.surface);
  const edges = MODEL.surfaceEdges[kind];
  const counts = binCounts(surfaces, edges);
  const binKeys = counts.map((_, i) => String(i));
  const binShares = shares(
    binKeys,
    Object.fromEntries(counts.map((count, i) => [String(i), count])),
    reference
      ? Object.fromEntries(reference.surfaceBins.map((bin, i) => [String(i), bin.share]))
      : null,
    reference ? MODEL.shareShrink : 0,
  );
  const blend = (q: number, ref: number | undefined) =>
    round(
      ref === undefined
        ? quantile(perM2, q)
        : shrink(quantile(perM2, q), sales.length, ref, MODEL.priceShrinkSales),
    );
  const ref = reference?.pricePerM2;
  return {
    count: sales.length,
    perYear: round(sales.length / perYearDivisor, 1),
    pricePerM2: {
      median: blend(0.5, ref?.median),
      q1: blend(0.25, ref?.q1),
      q3: blend(0.75, ref?.q3),
      p90: blend(0.9, ref?.p90),
    },
    medianSurface: round(
      reference
        ? shrink(quantile(surfaces, 0.5), sales.length, reference.medianSurface, MODEL.shareShrink)
        : quantile(surfaces, 0.5),
    ),
    surfaceBins: edges.slice(0, -1).map((min, i) => ({
      min,
      max: edges[i + 1] ?? min + 1,
      share: binShares[String(i)] ?? 0,
    })),
  };
}

function monthsBetween(from: string, to: string): number {
  return (yearOf(to) - yearOf(from)) * 12;
}

async function buildCity(config: CityConfig): Promise<CityData> {
  console.log(`${config.name} (${config.inseeCode})`);
  const commune = await loadCommune(config.inseeCode);
  console.log('  IRIS');
  const allIris = await loadIris(config.inseeCode);
  const irisToNeighbourhood = new Map<string, string>();
  for (const n of config.neighbourhoods)
    for (const code of n.iris) irisToNeighbourhood.set(code, n.id);
  for (const iris of allIris) {
    if (!irisToNeighbourhood.has(iris.code) && !config.excludedIris.includes(iris.code)) {
      throw new Error(`IRIS ${iris.code} (${iris.name}) is neither mapped nor excluded`);
    }
  }
  const neighbourhoodAt = (point: LonLat | null | undefined): string | null => {
    if (!point) return null;
    const iris = allIris.find((candidate) =>
      candidate.rings.some((ring) => pointInRing(point, ring)),
    );
    return iris ? (irisToNeighbourhood.get(iris.code) ?? null) : null;
  };

  console.log('  DVF and cadastre');
  const parcels = await loadParcelCentroids(config.inseeCode);
  const allSales = (await loadDvfSales(config.inseeCode)).filter((sale) => {
    const perM2 = sale.price / sale.surface;
    return (
      sale.surface >= MODEL.surface.min &&
      sale.surface <= MODEL.surface.max &&
      perM2 >= MODEL.perM2.min &&
      perM2 <= MODEL.perM2.max
    );
  });
  const dataDate = allSales.at(-1)?.date ?? SOURCES.dvf.to;
  const years = monthsBetween(SOURCES.dvf.from, SOURCES.dvf.to) / 12 + 1 / 12;
  const recentFrom = yearOf(dataDate) - MODEL.recentMonths / 12;

  // Bring the multi-year medians to the level of the last months, per kind.
  const level = {} as Record<DwellingKind, number>;
  const communeSales = {} as CityData['commune']['sales'];
  const elasticity = {} as Record<DwellingKind, number>;
  const m2PerRoom = {} as Record<DwellingKind, number>;
  for (const kind of KINDS) {
    const sales = allSales.filter((sale) => sale.type === kind);
    const recent = sales.filter((sale) => yearOf(sale.date) >= recentFrom);
    const perM2 = (list: readonly DvfSale[]) =>
      quantile(
        list.map((s) => s.price / s.surface),
        0.5,
      );
    level[kind] = perM2(recent) / perM2(sales);
    communeSales[kind] = salesStats(sales, kind, level[kind], null, years);
    elasticity[kind] = round(
      slope(
        sales.map((sale) => [Math.log(sale.surface), Math.log(sale.price / sale.surface)] as const),
      ),
      3,
    );
    m2PerRoom[kind] = round(
      quantile(
        sales.filter((s) => s.rooms > 0).map((s) => s.surface / s.rooms),
        0.5,
      ),
      1,
    );
  }
  const trendInput = (list: readonly DvfSale[]) =>
    list.map((sale) => ({
      group: sale.type,
      year: yearOf(sale.date),
      perM2: sale.price / sale.surface,
    }));
  const communeTrend = trendPercentPerYear(trendInput(allSales));

  console.log('  Rents');
  const rents = await loadRents(config.inseeCode);
  const communeRent = {
    smallApartment: round(rents.smallApartment.perM2, 2),
    largeApartment: round(rents.largeApartment.perM2, 2),
    house: round(rents.house.perM2, 2),
  };

  console.log('  DPE');
  const dpe = await loadDpe(config.inseeCode);
  const dpeByEpoch = {} as CityData['commune']['dpeByEpoch'];
  const communeEpochCounts = {} as Record<DwellingKind, Partial<Record<Epoch, number>>>;
  for (const kind of KINDS) {
    const records = dpe.filter((r) => ADEME_KIND[r.buildingType] === kind);
    const all: Partial<Record<DpeLabel, number>> = {};
    for (const r of records) all[r.label as DpeLabel] = (all[r.label as DpeLabel] ?? 0) + 1;
    const allShares = shares(DPE_LABELS, all, null, 0);
    const table = {} as Record<Epoch, Record<DpeLabel, number>>;
    communeEpochCounts[kind] = {};
    for (const epoch of EPOCHS) {
      const counts: Partial<Record<DpeLabel, number>> = {};
      for (const r of records) {
        if (ADEME_EPOCH[r.period] !== epoch) continue;
        counts[r.label as DpeLabel] = (counts[r.label as DpeLabel] ?? 0) + 1;
        communeEpochCounts[kind][epoch] = (communeEpochCounts[kind][epoch] ?? 0) + 1;
      }
      table[epoch] = shares(DPE_LABELS, counts, allShares, MODEL.shareShrink);
    }
    dpeByEpoch[kind] = table;
  }
  const communeEpochShares = Object.fromEntries(
    KINDS.map((kind) => [kind, shares(EPOCHS, communeEpochCounts[kind], null, 0)]),
  ) as Record<DwellingKind, Record<Epoch, number>>;

  console.log('  Map (BD TOPO)');
  const rings = allIris.flatMap((iris) => iris.rings);
  const lons = rings.flatMap((ring) => ring.map((p) => p[0]));
  const lats = rings.flatMap((ring) => ring.map((p) => p[1]));
  const marginLat = MODEL.mapMargin / 111_320;
  const marginLon = marginLat / Math.cos((commune.centre[1] * Math.PI) / 180);
  const box = [
    Math.min(...lons) - marginLon,
    Math.min(...lats) - marginLat,
    Math.max(...lons) + marginLon,
    Math.max(...lats) + marginLat,
  ] as const;
  const origin: LonLat = [round(box[0], 5), round(box[1], 5)];
  const project = projector(origin);
  const [width, height] = project([box[2], box[3]]);
  const map = await loadMap(box, `map-${config.inseeCode}`);
  const projectLine = (points: readonly LonLat[]) =>
    simplify(points.filter((p) => insideBox(p, box)).map(project), MODEL.lineTolerance);
  const projectRing = (points: readonly LonLat[]) =>
    simplify(points.map(project), MODEL.outlineTolerance);
  const keepLines = (list: readonly LonLat[][]) =>
    list.map(projectLine).filter((l) => l.length >= 2);

  const neighbourhoods: CityData['neighbourhoods'] = config.neighbourhoods.map((n) => {
    const sales = allSales.filter((sale) => neighbourhoodAt(parcels.get(sale.parcel)) === n.id);
    const statsByKind = Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        salesStats(
          sales.filter((s) => s.type === kind),
          kind,
          level[kind],
          communeSales[kind],
          years,
        ),
      ]),
    ) as CityData['neighbourhoods'][number]['sales'];
    const trend = shrink(
      trendPercentPerYear(trendInput(sales)),
      sales.length,
      communeTrend,
      MODEL.trendShrinkSales,
    );
    const priceRatio = (kind: DwellingKind) =>
      statsByKind[kind].pricePerM2.median / communeSales[kind].pricePerM2.median;
    const scaleRent = (value: number, kind: DwellingKind) =>
      round(value * priceRatio(kind) ** MODEL.rentPriceElasticity, 2);
    const records = dpe.filter((r) => neighbourhoodAt(r.point) === n.id);
    const epochShares = {} as CityData['neighbourhoods'][number]['epochShares'];
    const dpeShares = {} as CityData['neighbourhoods'][number]['dpeShares'];
    for (const kind of KINDS) {
      const mine = records.filter((r) => ADEME_KIND[r.buildingType] === kind);
      const epochCounts: Partial<Record<Epoch, number>> = {};
      const labelCounts: Partial<Record<DpeLabel, number>> = {};
      for (const r of mine) {
        const epoch = ADEME_EPOCH[r.period];
        if (epoch) epochCounts[epoch] = (epochCounts[epoch] ?? 0) + 1;
        labelCounts[r.label as DpeLabel] = (labelCounts[r.label as DpeLabel] ?? 0) + 1;
      }
      epochShares[kind] = shares(EPOCHS, epochCounts, communeEpochShares[kind], MODEL.shareShrink);
      dpeShares[kind] = shares(DPE_LABELS, labelCounts, null, 0);
    }
    const amenities = { schools: 0, health: 0, shops: 0, leisure: 0 };
    for (const place of map.places) {
      const key = place.category ? AMENITY[place.category] : undefined;
      if (key && neighbourhoodAt(place.point) === n.id) amenities[key]++;
    }
    return {
      id: n.id,
      name: n.name,
      iris: n.iris,
      outlines: allIris
        .filter((iris) => n.iris.includes(iris.code))
        .flatMap((iris) => iris.rings.map(projectRing))
        .filter((ring) => ring.length >= 3),
      sales: statsByKind,
      trendPercentPerYear: round(trend, 2),
      rentPerM2: {
        smallApartment: scaleRent(communeRent.smallApartment, 'apartment'),
        largeApartment: scaleRent(communeRent.largeApartment, 'apartment'),
        house: scaleRent(communeRent.house, 'house'),
      },
      epochShares,
      dpeShares,
      amenities,
    };
  });

  const landmarks = config.landmarks.map((landmark) => {
    const place = map.places.find((p) => p.name?.includes(landmark.search));
    if (!place) throw new Error(`Landmark not found in BD TOPO: ${landmark.search}`);
    return {
      id: landmark.id,
      name: landmark.name,
      point: project(place.point),
      neighbourhoodId: neighbourhoodAt(place.point),
    };
  });

  return {
    id: config.id,
    name: config.name,
    inseeCode: config.inseeCode,
    population: commune.population,
    dataDate,
    period: { from: SOURCES.dvf.from, to: SOURCES.dvf.to },
    sources: [
      SOURCES.dvf.label,
      SOURCES.rents.label,
      SOURCES.dpe.label,
      SOURCES.iris.label,
      SOURCES.cadastre.label,
      SOURCES.population.label,
      SOURCES.map.label,
    ],
    attribution:
      'Données : DGFiP (DVF), ANIL et ministère du Logement (carte des loyers), ADEME (DPE), INSEE, IGN (IRIS, cadastre, BD TOPO) — Licence Ouverte Etalab 2.0.',
    commune: {
      sales: communeSales,
      trendPercentPerYear: round(communeTrend, 2),
      surfaceElasticity: elasticity,
      m2PerRoom,
      rentPerM2: communeRent,
      rentYear: SOURCES.rents.year,
      dpeByEpoch,
    },
    neighbourhoods,
    map: {
      origin: [origin[0], origin[1]],
      width,
      height,
      rivers: map.rivers.map((river) => ({
        name: river.name,
        kind: river.kind,
        lines: keepLines(river.lines),
      })),
      roads: map.roads
        .sort((a, b) => a.importance - b.importance)
        .map((road) => ({ importance: road.importance, lines: keepLines(road.lines) })),
      railways: keepLines(map.railways),
      parks: map.parks
        .map((park) => ({
          name: park.name,
          outlines: park.rings.map(projectRing).filter((ring) => ring.length >= 3),
        }))
        .filter((park) => park.outlines.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
      landmarks,
    },
  };
}

const cityId = process.argv[2] ?? 'dole';
const config = CITIES[cityId];
if (!config) {
  console.error(`Unknown city ${cityId}. Known: ${Object.keys(CITIES).join(', ')}`);
  process.exit(1);
}
const city = cityDataSchema.parse(await buildCity(config));
const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../data/cities',
  `${city.id}.json`,
);
await writeFile(out, `${JSON.stringify(city)}\n`);
console.log(`✓ ${out}`);
for (const n of city.neighbourhoods) {
  const { apartment, house } = n.sales;
  console.log(
    `  ${n.name.padEnd(22)} appartements ${apartment.pricePerM2.median} €/m² (${apartment.count} ventes), maisons ${house.pricePerM2.median} €/m² (${house.count}), tendance ${n.trendPercentPerYear} %/an`,
  );
}
