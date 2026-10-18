import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Downloads are kept here so the scripts can be re-run without hitting the sources again. */
export const CACHE_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), '.cache');

const RETRIES = 5;

function cachePath(url: string, name?: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 12);
  return join(CACHE_DIR, name ?? hash);
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fetches a URL once, with retries and exponential backoff, and caches the body on disk. */
export async function download(url: string, name?: string): Promise<Buffer> {
  const path = cachePath(url, name);
  if (await exists(path)) return readFile(path);
  await mkdir(CACHE_DIR, { recursive: true });
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      const body = Buffer.from(await response.arrayBuffer());
      await writeFile(`${path}.part`, body);
      await rename(`${path}.part`, path);
      return body;
    } catch (error) {
      lastError = error;
      console.warn(`  retry ${attempt + 1}/${RETRIES}: ${(error as Error).message}`);
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`Download failed: ${url}`, { cause: lastError });
}

export async function downloadJson<T>(url: string, name?: string): Promise<T> {
  return JSON.parse((await download(url, name)).toString('utf8')) as T;
}

/** Geographic layer from the IGN Géoplateforme WFS, all pages, in WGS84 longitude/latitude. */
export async function fetchWfs<P>(
  typeName: string,
  filter: { cql?: string; bbox?: readonly [number, number, number, number] },
  name: string,
): Promise<GeoJsonFeature<P>[]> {
  const pageSize = 5000;
  const features: GeoJsonFeature<P>[] = [];
  for (let start = 0; ; start += pageSize) {
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: typeName,
      OUTPUTFORMAT: 'application/json',
      SRSNAME: 'CRS:84',
      COUNT: String(pageSize),
      STARTINDEX: String(start),
    });
    if (filter.cql) params.set('CQL_FILTER', filter.cql);
    if (filter.bbox) params.set('BBOX', `${filter.bbox.join(',')},CRS:84`);
    const page = await downloadJson<{ features: GeoJsonFeature<P>[] }>(
      `https://data.geopf.fr/wfs/ows?${params}`,
      `${name}-${start}.json`,
    );
    features.push(...page.features);
    if (page.features.length < pageSize) return features;
  }
}

export type Position = [number, number, ...number[]];

export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString'; coordinates: Position[][] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

export interface GeoJsonFeature<P> {
  type: 'Feature';
  geometry: Geometry | null;
  properties: P;
}
