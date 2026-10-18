import { centroid, lines, type LonLat, outerRings, type Ring } from '../geo.ts';
import { fetchWfs } from '../http.ts';

export type Box = readonly [number, number, number, number];

export interface MapSource {
  rivers: { name: string; kind: 'river' | 'canal'; lines: LonLat[][] }[];
  roads: { importance: number; lines: LonLat[][] }[];
  railways: LonLat[][];
  parks: { name: string; rings: Ring[] }[];
  /** Named places and points of interest, with their BD TOPO category when known. */
  places: { name: string | null; category: string | null; point: LonLat }[];
}

interface Hydro {
  nature: string;
  cpx_toponyme_de_cours_d_eau: string | null;
}
interface Road {
  importance: string;
  fictif: boolean;
}
interface Zone {
  categorie: string;
  nature: string;
  toponyme: string | null;
}

const PARK = /^(Parc|Jardin|Forêt urbaine|Square)/i;

/** Rivers, main roads, railways, parks and named places from the IGN BD TOPO. */
export async function loadMap(box: Box, name: string): Promise<MapSource> {
  const hydro = await fetchWfs<Hydro>(
    'BDTOPO_V3:troncon_hydrographique',
    { bbox: box },
    `${name}-hydro`,
  );
  const rivers = new Map<string, MapSource['rivers'][number]>();
  for (const feature of hydro) {
    const river = feature.properties.cpx_toponyme_de_cours_d_eau;
    if (!river || !/Doubs|Canal/.test(river)) continue;
    const entry = rivers.get(river) ?? {
      name: river,
      kind: river.startsWith('Canal') ? ('canal' as const) : ('river' as const),
      lines: [],
    };
    entry.lines.push(...lines(feature.geometry));
    rivers.set(river, entry);
  }

  const roadFeatures = await fetchWfs<Road>(
    'BDTOPO_V3:troncon_de_route',
    { bbox: box },
    `${name}-routes`,
  );
  const roads = new Map<number, LonLat[][]>();
  for (const feature of roadFeatures) {
    const importance = Number(feature.properties.importance);
    if (!(importance <= 3) || feature.properties.fictif) continue;
    roads.set(importance, [...(roads.get(importance) ?? []), ...lines(feature.geometry)]);
  }

  const rail = await fetchWfs<{ nature: string }>(
    'BDTOPO_V3:troncon_de_voie_ferree',
    { bbox: box },
    `${name}-rail`,
  );

  const zones = await fetchWfs<Zone>(
    'BDTOPO_V3:zone_d_activite_ou_d_interet',
    { bbox: box },
    `${name}-zones`,
  );
  const parks = zones
    .filter((zone) => zone.properties.toponyme && PARK.test(zone.properties.toponyme))
    .map((zone) => ({ name: zone.properties.toponyme ?? '', rings: outerRings(zone.geometry) }));

  const transport = await fetchWfs<{ toponyme: string | null }>(
    'BDTOPO_V3:equipement_de_transport',
    { bbox: box },
    `${name}-transport`,
  );
  const places: MapSource['places'] = [];
  for (const feature of zones) {
    const point = centroid(outerRings(feature.geometry));
    const { toponyme, categorie } = feature.properties;
    if (point) places.push({ name: toponyme, category: categorie, point });
  }
  for (const feature of transport) {
    const geometry = feature.geometry;
    const point =
      geometry?.type === 'Point'
        ? ([geometry.coordinates[0], geometry.coordinates[1]] as const)
        : centroid(outerRings(geometry));
    if (feature.properties.toponyme && point) {
      places.push({ name: feature.properties.toponyme, category: 'Transport', point });
    }
  }

  return {
    rivers: [...rivers.values()],
    roads: [...roads.entries()].map(([importance, roadLines]) => ({
      importance,
      lines: roadLines,
    })),
    railways: rail.flatMap((feature) => lines(feature.geometry)),
    parks,
    places,
  };
}
