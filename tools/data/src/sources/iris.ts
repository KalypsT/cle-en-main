import { SOURCES } from '../config.ts';
import { outerRings, type Ring } from '../geo.ts';
import { fetchWfs } from '../http.ts';

export interface Iris {
  code: string;
  name: string;
  rings: Ring[];
}

/** IRIS outlines of a commune (IGN contours, INSEE codes). */
export async function loadIris(inseeCode: string): Promise<Iris[]> {
  const features = await fetchWfs<{ code_iris: string; nom_iris: string }>(
    SOURCES.iris.layer,
    { cql: `code_insee='${inseeCode}'` },
    `iris-${inseeCode}`,
  );
  return features
    .map((feature) => ({
      code: feature.properties.code_iris,
      name: feature.properties.nom_iris,
      rings: outerRings(feature.geometry),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
