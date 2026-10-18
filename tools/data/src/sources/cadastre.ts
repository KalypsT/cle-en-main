import { SOURCES } from '../config.ts';
import { centroid, type LonLat, outerRings } from '../geo.ts';
import { fetchWfs } from '../http.ts';

/** Centroid of every cadastral parcel of a commune, by parcel identifier (IDU). */
export async function loadParcelCentroids(inseeCode: string): Promise<Map<string, LonLat>> {
  const features = await fetchWfs<{ idu: string }>(
    SOURCES.cadastre.layer,
    { cql: `code_insee='${inseeCode}'` },
    `parcelles-${inseeCode}`,
  );
  const centroids = new Map<string, LonLat>();
  for (const feature of features) {
    const point = centroid(outerRings(feature.geometry));
    if (point) centroids.set(feature.properties.idu, point);
  }
  return centroids;
}
