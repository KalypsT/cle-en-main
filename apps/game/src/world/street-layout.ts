import type { StreetBuilding, StreetView } from '@cle/engine';
import { type FacadeSpec, facadeSpec } from './facade.ts';

/*
 * Where each building of a neighbourhood's streets stands, in world units
 * (1 unit = 1 CSS pixel at scale 1). Shared by the PixiJS scene and the HTML
 * layer of bubbles and buttons, so both line up.
 */

/** Design height of the street view: the scene is scaled to the real height. */
export const DESIGN_HEIGHT = 560;
/** Ground line (bottom of the façades), from the top of the design height. */
export const GROUND_Y = 452;
/** Sidewalk depth, then the road (or the water of a quay). */
export const SIDEWALK = 26;
export const ROAD = 58;
/** Space before the first building of a street and between two streets (a crossroad). */
const STREET_MARGIN = 36;
const CROSSROAD = 96;
const TREE_GAP = 36;
const HOUSE_GAP = 16;
const LAMP_SPACING = 150;

export interface LaidBuilding {
  building: StreetBuilding;
  spec: FacadeSpec;
  x: number;
  /** Tree after the building, its trunk's x. */
  treeX: number | null;
}

export interface LaidStreet {
  street: StreetView;
  index: number;
  x: number;
  width: number;
  buildings: LaidBuilding[];
  lamps: number[];
}

export interface StreetLayout {
  streets: LaidStreet[];
  width: number;
}

export function layoutStreets(streets: readonly StreetView[], cityId: string): StreetLayout {
  const laid: LaidStreet[] = [];
  let x = 0;
  streets.forEach((street, index) => {
    const start = x;
    x += STREET_MARGIN;
    const buildings: LaidBuilding[] = [];
    let previousHouse = false;
    for (const building of street.buildings) {
      const spec = facadeSpec({
        id: building.id,
        cityId,
        kind: building.kind,
        epoch: building.epoch,
        floors: building.floors,
        shop: building.shop,
        variant: building.variant,
        facadeState: building.facadeState,
        newWindows: building.newWindows,
        highlightFloor: building.highlightFloor,
      });
      const house = building.kind === 'house';
      if (house || previousHouse) x += HOUSE_GAP;
      buildings.push({ building, spec, x, treeX: null });
      x += spec.width;
      if (building.tree) {
        const last = buildings[buildings.length - 1];
        if (last) last.treeX = x + TREE_GAP / 2;
        x += TREE_GAP;
      }
      previousHouse = house;
    }
    x += STREET_MARGIN;
    const width = x - start;
    const lamps: number[] = [];
    for (let lamp = start + LAMP_SPACING / 2; lamp < x - 20; lamp += LAMP_SPACING) {
      lamps.push(lamp);
    }
    laid.push({ street, index, x: start, width, buildings, lamps });
    if (index < streets.length - 1) x += CROSSROAD;
  });
  return { streets: laid, width: x };
}

/** Index of the street at the middle of the view. */
export function streetAt(layout: StreetLayout, worldX: number): number {
  let best = 0;
  for (const street of layout.streets) {
    if (worldX >= street.x - CROSSROAD / 2) best = street.index;
  }
  return best;
}

/**
 * Height of the scene a phone held upright shows: the top of the sky is cut
 * (the street's chips stand there), so the façades come bigger.
 */
const PORTRAIT_VIEW_HEIGHT = 470;

/** Scale of the scene for a view (the panorama is shorter; a portrait view zooms in). */
export function sceneScale(height: number, width = Infinity): number {
  const portrait = width < height;
  const shown = portrait ? PORTRAIT_VIEW_HEIGHT : DESIGN_HEIGHT;
  return Math.max(0.55, Math.min(portrait ? 1.45 : 1.25, height / shown));
}
