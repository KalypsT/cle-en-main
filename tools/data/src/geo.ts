import type { Geometry, Position } from './http.ts';

export type LonLat = readonly [number, number];
export type Ring = LonLat[];

/** Outer rings of a (multi)polygon; holes are ignored (none matter at city scale). */
export function outerRings(geometry: Geometry | null): Ring[] {
  if (!geometry) return [];
  const toRing = (ring: Position[]): Ring => ring.map(([x, y]) => [x, y] as const);
  if (geometry.type === 'Polygon')
    return geometry.coordinates[0] ? [toRing(geometry.coordinates[0])] : [];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((polygon) => (polygon[0] ? [toRing(polygon[0])] : []));
  }
  return [];
}

export function lines(geometry: Geometry | null): LonLat[][] {
  if (!geometry) return [];
  const toLine = (line: Position[]): LonLat[] => line.map(([x, y]) => [x, y] as const);
  if (geometry.type === 'LineString') return [toLine(geometry.coordinates)];
  if (geometry.type === 'MultiLineString') return geometry.coordinates.map(toLine);
  return [];
}

export function pointInRing([x, y]: LonLat, ring: readonly LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] ?? [0, 0];
    const [xj, yj] = ring[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Area-weighted centroid of the largest ring. */
export function centroid(rings: readonly Ring[]): LonLat | null {
  let best: { area: number; point: LonLat } | null = null;
  for (const ring of rings) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] ?? [0, 0];
      const [xj, yj] = ring[j] ?? [0, 0];
      const cross = xj * yi - xi * yj;
      area += cross;
      cx += (xi + xj) * cross;
      cy += (yi + yj) * cross;
    }
    if (area === 0) continue;
    const point: LonLat = [cx / (3 * area), cy / (3 * area)];
    if (!best || Math.abs(area) > best.area) best = { area: Math.abs(area), point };
  }
  return best?.point ?? null;
}

/** Lambert-93 (EPSG:2154) to WGS84 longitude/latitude, inverse Lambert conformal conic. */
export function lambert93ToWgs84(x: number, y: number): LonLat {
  const n = 0.725607765053267;
  const c = 11754255.426096;
  const xs = 700000;
  const ys = 12655612.049876;
  const e = 0.0818191910428158;
  const lon0 = (3 * Math.PI) / 180;
  const dx = x - xs;
  const dy = y - ys;
  const r = Math.sqrt(dx * dx + dy * dy);
  const gamma = Math.atan(dx / -dy);
  const lon = lon0 + gamma / n;
  const latIso = -Math.log(Math.abs(r / c)) / n;
  let lat = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const s = e * Math.sin(lat);
    lat = 2 * Math.atan(Math.pow((1 + s) / (1 - s), e / 2) * Math.exp(latIso)) - Math.PI / 2;
  }
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** Flat projection in metres around an origin (enough at city scale). */
export function projector(origin: LonLat) {
  const metresPerDegree = 111_320;
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  return ([lon, lat]: LonLat): [number, number] => [
    Math.round((lon - origin[0]) * metresPerDegree * cosLat),
    Math.round((lat - origin[1]) * metresPerDegree),
  ];
}

function perpendicularDistance(p: LonLat, a: LonLat, b: LonLat): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / length;
}

/** Douglas–Peucker simplification, tolerance in the points' own unit. */
export function simplify<T extends LonLat>(points: readonly T[], tolerance: number): T[] {
  if (points.length <= 2) return [...points];
  const first = points[0] as T;
  const last = points[points.length - 1] as T;
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i] as T, first, last);
    if (distance > max) {
      max = distance;
      index = i;
    }
  }
  if (max <= tolerance) return [first, last];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

/** Lines clipped to a bounding box by dropping the points outside (good enough for drawing). */
export function insideBox(point: LonLat, box: readonly [number, number, number, number]): boolean {
  return point[0] >= box[0] && point[0] <= box[2] && point[1] >= box[1] && point[1] <= box[3];
}
