import { SOURCES } from '../config.ts';
import { lambert93ToWgs84, type LonLat } from '../geo.ts';
import { downloadJson } from '../http.ts';

export interface DpeRecord {
  label: string;
  period: string;
  buildingType: string;
  surface: number;
  point: LonLat | null;
}

interface DpeLine {
  etiquette_dpe?: string;
  periode_construction?: string;
  type_batiment?: string;
  surface_habitable_logement?: number;
  coordonnee_cartographique_x_ban?: number;
  coordonnee_cartographique_y_ban?: number;
}

const FIELDS = [
  'etiquette_dpe',
  'periode_construction',
  'type_batiment',
  'surface_habitable_logement',
  'coordonnee_cartographique_x_ban',
  'coordonnee_cartographique_y_ban',
];

/** Energy performance certificates of existing dwellings in a commune (ADEME). */
export async function loadDpe(inseeCode: string): Promise<DpeRecord[]> {
  const params = new URLSearchParams({
    size: '10000',
    select: FIELDS.join(','),
    qs: `code_insee_ban:${inseeCode}`,
  });
  let url: string | undefined = `${SOURCES.dpe.dataset}?${params}`;
  const records: DpeRecord[] = [];
  for (let page = 0; url; page++) {
    const body: { results: DpeLine[]; next?: string } = await downloadJson(
      url,
      `dpe-${inseeCode}-${page}.json`,
    );
    for (const line of body.results) {
      if (!line.etiquette_dpe || !line.periode_construction || !line.type_batiment) continue;
      const x = line.coordonnee_cartographique_x_ban;
      const y = line.coordonnee_cartographique_y_ban;
      records.push({
        label: line.etiquette_dpe,
        period: line.periode_construction,
        buildingType: line.type_batiment,
        surface: line.surface_habitable_logement ?? 0,
        point: x && y ? lambert93ToWgs84(x, y) : null,
      });
    }
    url = body.results.length > 0 ? body.next : undefined;
  }
  return records;
}
