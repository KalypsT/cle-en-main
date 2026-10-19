import type { Epoch, PropertyKind } from '@cle/engine';

/*
 * Façades assembled from modules (docs/05, section 5.3): floors, windows,
 * roof, shutters, door, balconies and a shop on the ground floor, chosen by
 * the building's epoch and city. Pure description, drawn by PixiJS in the
 * street and by SVG on the listing sheet. Decoration only: every choice comes
 * from the building's stable `variant`, never from a game draw.
 */

export type RoofShape = 'gable' | 'mansard' | 'flat' | 'hip';
export type WindowShape = 'tall' | 'square' | 'wide' | 'arched';

export interface FacadeInput {
  id: string;
  cityId: string;
  kind: PropertyKind;
  epoch: Epoch;
  floors: number;
  shop: boolean;
  /** 0 … 1, stable for the building. */
  variant: number;
  /** State of the façade as the street sees it, 1 … 5. */
  facadeState: number;
  newWindows: boolean;
  /** Floor of the player's (or the listed) flat, highlighted. */
  highlightFloor: number | null;
}

export interface WindowSpec {
  /** Position relative to the façade's left and its ground line (y up = negative). */
  x: number;
  y: number;
  w: number;
  h: number;
  floor: number;
  /** Stable 0 … 1 number: when its light goes on and off. */
  light: number;
}

export interface FacadeSpec {
  width: number;
  /** Height of the walls, ground floor included (the roof comes on top). */
  wallHeight: number;
  groundHeight: number;
  floorHeight: number;
  floors: number;
  wall: number;
  /** Stone corners, bands and cornice. */
  trim: number;
  roof: { shape: RoofShape; color: number; height: number; dormers: boolean };
  windowShape: WindowShape;
  frame: number;
  shutters: number | null;
  rollerShutters: boolean;
  /** Floors with a balcony (railings in front of the windows). */
  balconies: number[];
  balconyColor: number;
  stoneCourses: boolean;
  cornice: boolean;
  chimney: { x: number } | null;
  door: { x: number; w: number; h: number; color: number; arched: boolean };
  garage: { x: number; w: number } | null;
  shop: { awning: number; stripes: boolean } | null;
  windows: WindowSpec[];
  /** 0 (clean) … 1 (worn): stains and cracks. */
  wear: number;
  /** Solar panels on the roof (recent houses). */
  solar: boolean;
  flowerBoxes: boolean;
}

interface CityStyle {
  oldWalls: number[];
  walls: number[];
  shutters: number[];
  oldRoofs: number[];
  roofs: number[];
  awnings: number[];
}

/** Dole: golden limestone, soft shutters, brown tiles (docs/05, 5.3). */
const DOLE: CityStyle = {
  oldWalls: [0xe7cb92, 0xdcbb7e, 0xead5a6, 0xd5b077, 0xe2c38c, 0xc99a6f],
  walls: [0xeee3cc, 0xe6d8bc, 0xf0e6d2, 0xd9cdb6, 0xe9d2b7, 0xd8c3a5],
  shutters: [0x8fb3ad, 0xa9bcd8, 0xc99a8a, 0xa8bf96, 0xd9c08a, 0x9aa5b0, 0xb7a3c4],
  oldRoofs: [0x9a5a43, 0x8a4f3c, 0xa4644a, 0x7c5546],
  roofs: [0x8c5a48, 0x6e6a6a, 0x9a6650, 0x5f6670],
  awnings: [0xb4533d, 0x2f6f6a, 0x4f6d9a, 0xc08a2e, 0x7a5c8a],
};

/** Everywhere else (« Partout »): post-war blocks, 1970s estates, pavilions. */
const DEFAULT_STYLE: CityStyle = {
  oldWalls: [0xe4d6bd, 0xd8c7a8, 0xe9dcc4, 0xcdb99a],
  walls: [0xeee6d6, 0xe4dccb, 0xf1ead9, 0xdcd3c1],
  shutters: [0x8fa7b5, 0xa9b48f, 0xbf9a86, 0x9a9fb0],
  oldRoofs: [0x8e5a46, 0x7b5a4c],
  roofs: [0x7a6a62, 0x6a6e76],
  awnings: [0xb4533d, 0x2f6f6a, 0x4f6d9a],
};

/** Dijon: pale limestone, glazed polychrome roof tiles (green, yellow, red, brown). */
const DIJON: CityStyle = {
  oldWalls: [0xe9d9b4, 0xdfcb9d, 0xeee0bf, 0xd3bd8f, 0xe5d2a6, 0xcfae80],
  walls: [0xefe6d2, 0xe5dac3, 0xf1e8d6, 0xdad0bb, 0xeadcc4, 0xd6c6aa],
  shutters: [0x7e9a8d, 0xa3aeb9, 0xb98f7e, 0x9fb18a, 0xcdb67a, 0x8f98a6],
  oldRoofs: [0x5f8a64, 0xd2a548, 0xa94a3b, 0x6a4a3c, 0x3f4a43],
  roofs: [0x8c5a48, 0x6e6a6a, 0x5f8a64, 0x5f6670],
  awnings: [0xa4402f, 0x2f6a5a, 0x3f5d8a, 0xb88a2a, 0x6e4f7d],
};

/** Besançon: grey-ochre stone of the old town, grey slates and tiles, blue-grey shutters. */
const BESANCON: CityStyle = {
  oldWalls: [0xd9ceb4, 0xcbc0a6, 0xe0d5bb, 0xbfb79f, 0xd3c4a2, 0xb9ab8c],
  walls: [0xe9e3d3, 0xdcd6c6, 0xeee9db, 0xcec9bb, 0xe2d6bf, 0xd2c8b1],
  shutters: [0x6f8aa0, 0x8aa0b4, 0x9a8f86, 0x7c9a8a, 0xb8a47a, 0x7a8696],
  oldRoofs: [0x8a4f3c, 0x7a5a4c, 0x6d6a6a, 0x5f6670],
  roofs: [0x6e6a6a, 0x5f6670, 0x8c5a48, 0x4f5660],
  awnings: [0x3f5d8a, 0x7a2f3f, 0x2f6a5a, 0xb88a2a],
};

/** Chalon-sur-Saône: warm brick and pastel plaster by the quays, flat red tiles. */
const CHALON: CityStyle = {
  oldWalls: [0xdcb48c, 0xd0a27a, 0xe3c19a, 0xc79872, 0xdbbd97, 0xc28e6a],
  walls: [0xefe0c6, 0xe7d3b3, 0xf2e5ce, 0xdcc9aa, 0xeacdb0, 0xd9bfa0],
  shutters: [0x7f9fa8, 0xb39a85, 0x8fa88a, 0xc7aa72, 0x9a8fb0, 0x6f8c9a],
  oldRoofs: [0xa4543e, 0x934a38, 0xb06048, 0x84503f],
  roofs: [0x9a5a45, 0x7a6a62, 0xa4644a, 0x6a6e76],
  awnings: [0xb4533d, 0x2f6f6a, 0x4f6d9a, 0xc08a2e],
};

const CITY_STYLES: Record<string, CityStyle> = {
  dole: DOLE,
  dijon: DIJON,
  besancon: BESANCON,
  chalon: CHALON,
};

/** Recent epochs' render colours: pastel then white and grey. */
const PASTELS = [0xf0c9a8, 0xf2dca0, 0xe7d0c0, 0xd9dcc4, 0xf3e3c9];
const MODERN = [0xf4f2ee, 0xe9e7e2, 0xdedcd8];
const MODERN_ACCENTS = [0xa4774f, 0x6d7177, 0x8e6a4a];

/** A pick in `list` from the building's variant and a salt. */
function pick<T>(list: readonly T[], variant: number, salt: number): T {
  return list[Math.floor(unit(variant, salt) * list.length) % list.length] as T;
}

/** A stable 0 … 1 number from the variant and a salt. */
function unit(variant: number, salt: number): number {
  const x = Math.sin(variant * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const OLD: readonly Epoch[] = ['before1948'];
const POST_WAR: readonly Epoch[] = ['from1948to1974'];
const SEVENTIES: readonly Epoch[] = ['from1975to1988'];
const NINETIES: readonly Epoch[] = ['from1989to2005'];

export function facadeSpec(input: FacadeInput): FacadeSpec {
  const style = CITY_STYLES[input.cityId] ?? DEFAULT_STYLE;
  const { variant, epoch } = input;
  const house = input.kind === 'house';
  const old = OLD.includes(epoch);
  const postWar = POST_WAR.includes(epoch);
  const seventies = SEVENTIES.includes(epoch);
  const nineties = NINETIES.includes(epoch);
  const modern = !old && !postWar && !seventies && !nineties;

  const floorHeight = old ? 42 : seventies ? 34 : 37;
  const groundHeight = input.shop ? 48 : floorHeight + (old ? 4 : 0);
  const floors = Math.max(1, input.floors);
  const columns = house
    ? 2 + Math.floor(unit(variant, 1) * 2)
    : input.kind === 'building'
      ? 3
      : old
        ? 3 + Math.floor(unit(variant, 1) * 2)
        : 4 + Math.floor(unit(variant, 1) * 2);
  const bay = old ? 30 : seventies ? 32 : 29;
  const width = columns * bay + 16;
  const wallHeight = groundHeight + (floors - 1) * floorHeight;

  const wall = old
    ? pick(style.oldWalls, variant, 2)
    : nineties
      ? pick(PASTELS, variant, 2)
      : modern
        ? pick(MODERN, variant, 2)
        : pick(style.walls, variant, 2);
  const trim = old
    ? shade(wall, -0.12)
    : modern
      ? pick(MODERN_ACCENTS, variant, 3)
      : shade(wall, -0.08);

  const roofShape: RoofShape = house
    ? old || nineties
      ? 'gable'
      : modern
        ? unit(variant, 4) < 0.5
          ? 'flat'
          : 'gable'
        : 'hip'
    : old
      ? unit(variant, 4) < 0.5
        ? 'mansard'
        : 'gable'
      : nineties
        ? 'hip'
        : 'flat';
  const roofHeight = roofShape === 'flat' ? 8 : roofShape === 'mansard' ? 30 : house ? 34 : 28;

  const windowShape: WindowShape = old
    ? unit(variant, 5) < 0.25
      ? 'arched'
      : 'tall'
    : seventies || modern
      ? 'wide'
      : 'square';
  const winW = windowShape === 'wide' ? 22 : old ? 15 : 17;
  const winH =
    windowShape === 'tall' || windowShape === 'arched' ? 26 : windowShape === 'wide' ? 18 : 20;

  const doorColumn = Math.floor(columns / 2);
  const door = {
    x: 8 + doorColumn * bay + (bay - 18) / 2,
    w: 18,
    h: Math.min(groundHeight - 6, old ? 34 : 30),
    color: old ? pick([0x5b3b2a, 0x2f4f5a, 0x6a2f2f, 0x3d5a40], variant, 6) : 0x4a4f57,
    arched: old,
  };
  const garage =
    house && !old && columns >= 3 ? { x: 8 + (columns - 1) * bay + 2, w: bay - 4 } : null;

  const windows: WindowSpec[] = [];
  for (let floor = 0; floor < floors; floor++) {
    for (let column = 0; column < columns; column++) {
      if (floor === 0 && (input.shop || column === doorColumn)) continue;
      if (floor === 0 && garage && column === columns - 1) continue;
      const height = floor === 0 ? groundHeight : floorHeight;
      const base = floor === 0 ? 0 : groundHeight + (floor - 1) * floorHeight;
      windows.push({
        x: 8 + column * bay + (bay - winW) / 2,
        y: -(base + (height - winH) / 2 + (floor === 0 ? 2 : 0)) - winH,
        w: winW,
        h: winH,
        floor,
        light: unit(variant, 100 + floor * 10 + column),
      });
    }
  }

  const balconies: number[] = [];
  if (!house) {
    for (let floor = 1; floor < floors; floor++) {
      if (seventies || modern) balconies.push(floor);
      else if (old && floor === 1 && unit(variant, 7) < 0.6) balconies.push(floor);
      else if (postWar && unit(variant, 20 + floor) < 0.35) balconies.push(floor);
    }
  }

  return {
    width,
    wallHeight,
    groundHeight,
    floorHeight,
    floors,
    wall,
    trim,
    roof: {
      shape: roofShape,
      color: old ? pick(style.oldRoofs, variant, 8) : pick(style.roofs, variant, 8),
      height: roofHeight,
      dormers: old && roofShape !== 'flat' && !house,
    },
    windowShape,
    frame: input.newWindows ? 0xffffff : old ? 0xf3ead8 : 0xe8e8e4,
    shutters: old || (house && !modern) ? pick(style.shutters, variant, 9) : null,
    rollerShutters: postWar || nineties,
    balconies,
    balconyColor: modern ? 0x9fb4bf : old ? 0x2f2f33 : 0x6b6b70,
    stoneCourses: old,
    cornice: old || postWar,
    chimney:
      roofShape === 'flat' && !house ? null : { x: width * (0.2 + unit(variant, 10) * 0.55) },
    door,
    garage,
    shop: input.shop
      ? {
          awning: pick(style.awnings, variant, 11),
          stripes: unit(variant, 12) < 0.5,
        }
      : null,
    windows,
    wear: Math.max(0, Math.min(1, (3.5 - input.facadeState) / 2.5)),
    solar: house && modern && unit(variant, 14) < 0.6,
    flowerBoxes: old && unit(variant, 15) < 0.55,
  };
}

/** Lightens (amount > 0) or darkens (amount < 0) a colour. */
export function shade(color: number, amount: number): number {
  const channel = (shift: number) => {
    const value = (color >> shift) & 0xff;
    const target = amount > 0 ? 255 : 0;
    return Math.round(value + (target - value) * Math.abs(amount));
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Mixes two colours (t = 0: a, t = 1: b). */
export function mix(a: number, b: number, t: number): number {
  const channel = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * t);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
