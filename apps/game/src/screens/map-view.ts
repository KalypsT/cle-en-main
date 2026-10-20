/*
 * The city map's camera: pure helpers, in the map's own units (the city's metres, flipped
 * so that north is up) and in pixels for the frame that shows it. The SVG's viewBox is
 * derived from a view: its centre and a zoom (1: the whole city fits).
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;

export interface MapView {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Width of the part of the map shown at zoom 1: the whole city fits, whatever the frame. */
export function baseWidth(box: Size, frame: Size): number {
  return Math.max(box.width, (box.height * frame.width) / frame.height);
}

/** Size of the part of the map shown, in map units. */
export function viewSize(box: Size, frame: Size, zoom: number): Size {
  const width = baseWidth(box, frame) / zoom;
  return { width, height: (width * frame.height) / frame.width };
}

/** Keeps the zoom in range and the centre over the city. */
export function clampView(box: Size, view: MapView): MapView {
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom)),
    cx: Math.min(box.width, Math.max(0, view.cx)),
    cy: Math.min(box.height, Math.max(0, view.cy)),
  };
}

export function fullView(box: Size): MapView {
  return { cx: box.width / 2, cy: box.height / 2, zoom: MIN_ZOOM };
}

/** Moves the view by a drag of the finger (pixels): the map follows the finger. */
export function panBy(box: Size, frame: Size, view: MapView, dx: number, dy: number): MapView {
  const { width } = viewSize(box, frame, view.zoom);
  const perPixel = width / frame.width;
  return clampView(box, { ...view, cx: view.cx - dx * perPixel, cy: view.cy - dy * perPixel });
}

/** Multiplies the zoom, keeping the map point under the frame position (px, py) in place. */
export function zoomAt(
  box: Size,
  frame: Size,
  view: MapView,
  factor: number,
  px: number,
  py: number,
): MapView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const before = viewSize(box, frame, view.zoom);
  const after = viewSize(box, frame, zoom);
  const x = view.cx - before.width / 2 + (px * before.width) / frame.width;
  const y = view.cy - before.height / 2 + (py * before.height) / frame.height;
  return clampView(box, {
    zoom,
    cx: x - (px * after.width) / frame.width + after.width / 2,
    cy: y - (py * after.height) / frame.height + after.height / 2,
  });
}

/** The view that shows the map point (x, y) at the given zoom. */
export function centerOn(box: Size, x: number, y: number, zoom: number): MapView {
  return clampView(box, { cx: x, cy: y, zoom });
}

export interface Pin<T> {
  item: T;
  x: number;
  y: number;
}

export interface Cluster<T> {
  x: number;
  y: number;
  items: T[];
}

/**
 * Groups the pins that fall in the same square of `cell` map units. A square with a single
 * pin stays that pin; the others become one cluster at their centre.
 */
export function clusterPins<T>(pins: readonly Pin<T>[], cell: number): Cluster<T>[] {
  const squares = new Map<string, Pin<T>[]>();
  for (const pin of pins) {
    const key = `${Math.floor(pin.x / cell)}:${Math.floor(pin.y / cell)}`;
    const group = squares.get(key);
    if (group) group.push(pin);
    else squares.set(key, [pin]);
  }
  return [...squares.values()].map((group) => ({
    x: group.reduce((sum, pin) => sum + pin.x, 0) / group.length,
    y: group.reduce((sum, pin) => sum + pin.y, 0) / group.length,
    items: group.map((pin) => pin.item),
  }));
}
