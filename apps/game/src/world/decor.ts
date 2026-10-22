import type { Season } from '@cle/engine';
import { Graphics } from 'pixi.js';
import { shade } from './facade.ts';
import { foliage } from './light.ts';
import { decorRandom } from './pixi-draw.ts';
import { GROUND_Y, type LaidBuilding, type LaidStreet, ROAD, SIDEWALK } from './street-layout.ts';

/*
 * The street furniture drawn once per street: pavement, road or quay, trees,
 * lamp posts, terraces, the « À vendre » panels, the artisans' vans and the
 * Christmas garlands. Redrawn only when the season, the weather or the
 * buildings change.
 */

const PAVEMENT = 0xd9d0c0;
const KERB = 0xbfb4a2;
const ROAD_COLOR = 0x6f7179;
const WATER = 0x5f8ea0;
const QUAY = 0xc9b48c;
const SNOW = 0xf4f7fb;

export interface DecorOptions {
  season: Season;
  snow: boolean;
  christmas: boolean;
  /** Width of the whole layout (the road runs under every street and crossroad). */
  totalWidth: number;
}

/** The ground of a street: pavement and road, or a quay along the water. */
export function drawGround(
  g: Graphics,
  street: LaidStreet,
  options: DecorOptions,
  extra = 0,
): void {
  const left = street.x - extra;
  const width = street.width + extra * 2;
  g.rect(left, GROUND_Y, width, SIDEWALK).fill(options.snow ? SNOW : PAVEMENT);
  for (let x = left; x < left + width; x += 22) {
    g.rect(x, GROUND_Y + 2, 1, SIDEWALK - 4).fill({ color: KERB, alpha: 0.35 });
  }
  // The buildings' shade at their foot, then the kerb and its lit edge.
  g.rect(left, GROUND_Y, width, 4).fill({ color: 0x000000, alpha: 0.06 });
  g.rect(left, GROUND_Y + SIDEWALK - 4, width, 4).fill(KERB);
  g.rect(left, GROUND_Y + SIDEWALK - 4, width, 1).fill({ color: 0xffffff, alpha: 0.35 });
  if (street.street.quay) {
    g.rect(left, GROUND_Y + SIDEWALK, width, 8).fill(QUAY);
    g.rect(left, GROUND_Y + SIDEWALK + 8, width, ROAD + 40).fill(WATER);
    // Railing along the quay.
    g.rect(left, GROUND_Y + SIDEWALK - 12, width, 2).fill(0x3e4448);
    for (let x = left + 4; x < left + width; x += 9) {
      g.rect(x, GROUND_Y + SIDEWALK - 12, 1.5, 10).fill(0x3e4448);
    }
  } else {
    g.rect(left, GROUND_Y + SIDEWALK, width, ROAD).fill(options.snow ? 0x8b8e96 : ROAD_COLOR);
    // The gutter under the kerb, and manhole covers now and then.
    g.rect(left, GROUND_Y + SIDEWALK, width, 3).fill({ color: 0x000000, alpha: 0.12 });
    for (let x = left + 70; x < left + width; x += 230) {
      g.ellipse(x, GROUND_Y + SIDEWALK + ROAD * 0.78, 9, 2.6).fill({
        color: 0x000000,
        alpha: 0.18,
      });
    }
    for (let x = left + 10; x < left + width; x += 46) {
      g.rect(x, GROUND_Y + SIDEWALK + ROAD / 2 - 1.5, 24, 3).fill({ color: 0xe8e4da, alpha: 0.8 });
    }
    // Far pavement, with planters.
    g.rect(left, GROUND_Y + SIDEWALK + ROAD, width, 40).fill(
      options.snow ? SNOW : shade(PAVEMENT, -0.06),
    );
  }
}

/** A crossroad between two streets: the road goes on, the pavement turns. */
export function drawCrossroad(
  g: Graphics,
  x: number,
  width: number,
  quay: boolean,
  snow: boolean,
): void {
  g.rect(x, GROUND_Y - 8, width, SIDEWALK + 8).fill(snow ? SNOW : shade(PAVEMENT, -0.04));
  if (!quay) {
    g.rect(x, GROUND_Y + SIDEWALK, width, ROAD).fill(snow ? 0x8b8e96 : ROAD_COLOR);
    for (let i = 0; i < 6; i++) {
      g.rect(x + 18 + i * 11, GROUND_Y + SIDEWALK + 4, 6, ROAD - 8).fill({
        color: 0xf1ede4,
        alpha: 0.85,
      });
    }
    g.rect(x, GROUND_Y + SIDEWALK + ROAD, width, 40).fill(snow ? SNOW : shade(PAVEMENT, -0.06));
  } else {
    g.rect(x, GROUND_Y + SIDEWALK, width, ROAD + 40).fill(WATER);
  }
}

export function drawTree(
  g: Graphics,
  x: number,
  season: Season,
  seed: number,
  snow: boolean,
): void {
  const random = decorRandom(seed);
  const height = 70 + random() * 30;
  const { colors, bare, blossom } = foliage(season);
  g.rect(x - 3, GROUND_Y - height * 0.55, 6, height * 0.55 + 2).fill(0x7a5c45);
  g.ellipse(x, GROUND_Y + 2, 10, 3).fill({ color: 0x000000, alpha: 0.12 });
  if (bare) {
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (random() - 0.5) * 1.6;
      const length = 22 + random() * 18;
      const y = GROUND_Y - height * (0.45 + random() * 0.15);
      g.moveTo(x, y)
        .lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
        .stroke({ color: 0x6a5040, width: 2 });
    }
    if (snow) g.ellipse(x, GROUND_Y - height * 0.72, 18, 4).fill(SNOW);
    return;
  }
  const crownY = GROUND_Y - height * 0.72;
  for (let i = 0; i < 6; i++) {
    const color = colors[Math.floor(random() * colors.length)] ?? 0x6aab58;
    g.circle(x + (random() - 0.5) * 30, crownY + (random() - 0.5) * 26, 14 + random() * 8).fill(
      color,
    );
  }
  if (blossom) {
    for (let i = 0; i < 14; i++) {
      g.circle(x + (random() - 0.5) * 40, crownY + (random() - 0.5) * 34, 1.8).fill(0xf6c6d6);
    }
  }
  if (snow) g.ellipse(x, crownY - 16, 20, 5).fill(SNOW);
}

/** A lamp post; its glow is drawn by the light layer. */
export function drawLamp(g: Graphics, x: number, christmas: boolean): void {
  const top = GROUND_Y - 68;
  g.rect(x - 1.5, top, 3, 68 + SIDEWALK - 8).fill(0x2f3338);
  g.rect(x - 6, top - 2, 12, 3).fill(0x2f3338);
  g.poly([x - 5, top - 2, x + 5, top - 2, x + 3.5, top - 12, x - 3.5, top - 12]).fill(0xf0e2b0);
  g.rect(x - 4.5, top - 14, 9, 2.5).fill(0x2f3338);
  if (christmas) {
    // A star on the post.
    const cy = top - 22;
    const points: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 6 : 2.6;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(x + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.poly(points).fill(0xf6d36b);
  }
}

/** Café tables in front of a shop (summer days). */
export function drawTerrace(g: Graphics, laid: LaidBuilding, awning: number): void {
  const x = laid.x + laid.spec.width / 2;
  for (const dx of [-26, 18]) {
    const tx = x + dx;
    g.rect(tx - 7, GROUND_Y + 8, 14, 2).fill(0x5a4a3c);
    g.rect(tx - 1, GROUND_Y + 10, 2, 8).fill(0x5a4a3c);
    g.rect(tx - 13, GROUND_Y + 11, 4, 7).fill(0x8a6a4a);
    g.rect(tx + 9, GROUND_Y + 11, 4, 7).fill(0x8a6a4a);
    g.rect(tx - 0.5, GROUND_Y - 20, 1, 28).fill(0x5a4a3c);
    g.poly([tx - 15, GROUND_Y - 14, tx, GROUND_Y - 24, tx + 15, GROUND_Y - 14]).fill(awning);
  }
}

/** The agency's « À vendre » panel on the façade, with its text drawn by the caller. */
export function forSalePanel(g: Graphics, x: number, y: number): void {
  g.rect(x - 1, y - 6, 1.5, 6).fill(0x3e4448);
  g.rect(x + 37, y - 6, 1.5, 6).fill(0x3e4448);
  g.roundRect(x - 3, y, 44, 16, 2)
    .fill(0xfffdf8)
    .stroke({ color: 0xb23d27, width: 2 });
}

/** An artisan's van parked in front of works. */
export function drawVan(g: Graphics, x: number, color: number): void {
  const y = GROUND_Y + SIDEWALK + 6;
  g.roundRect(x, y, 58, 22, 3).fill(0xf2f2ee);
  g.rect(x, y + 12, 58, 4).fill(color);
  g.poly([x + 58, y + 6, x + 70, y + 10, x + 72, y + 22, x + 58, y + 22]).fill(0xf2f2ee);
  g.poly([x + 60, y + 8, x + 68, y + 11, x + 69, y + 15, x + 60, y + 15]).fill(0x9fb7c6);
  g.circle(x + 14, y + 23, 5).fill(0x2b2d31);
  g.circle(x + 56, y + 23, 5).fill(0x2b2d31);
  g.circle(x + 14, y + 23, 2).fill(0x9a9da3);
  g.circle(x + 56, y + 23, 2).fill(0x9a9da3);
}

/** Planters on the far pavement. */
export function drawPlanter(g: Graphics, x: number, season: Season): void {
  const y = GROUND_Y + SIDEWALK + ROAD + 12;
  g.roundRect(x - 9, y, 18, 14, 2).fill(0xb06a50);
  if (season === 'winter') {
    g.circle(x, y - 3, 6).fill(0x4f6f4a);
  } else {
    const { colors } = foliage(season === 'autumn' ? 'autumn' : 'summer');
    g.circle(x - 5, y - 2, 6).fill(colors[0] ?? 0x5f9e4f);
    g.circle(x + 5, y - 2, 6).fill(colors[1] ?? 0x5f9e4f);
    g.circle(x, y - 7, 6).fill(colors[2] ?? 0x5f9e4f);
    if (season === 'spring') {
      g.circle(x - 3, y - 6, 2).fill(0xe35d6a);
      g.circle(x + 4, y - 3, 2).fill(0xf2c14e);
    }
  }
}

/** A landmark of a city's old centre, drawn behind the street (docs/03-systemes/08). */
export type Landmark = 'collegiale' | 'philippeLeBon' | 'citadelle' | 'doyenne';

/** Landmark seen from the neighbourhood, or null. */
export function landmarkOf(cityId: string, neighbourhoodId: string): Landmark | null {
  const centre: Record<string, [string, Landmark]> = {
    dole: ['centreHistorique', 'collegiale'],
    dijon: ['centreHistorique', 'philippeLeBon'],
    besancon: ['centreAncien', 'citadelle'],
    chalon: ['centreSaintLaurent', 'doyenne'],
  };
  const entry = centre[cityId];
  return entry && entry[0] === neighbourhoodId ? entry[1] : null;
}

const LANDMARK_COLOR = 0x7c7ea0;
const LANDMARK_SHADE = 0x5f6182;

function drawLandmark(g: Graphics, landmark: Landmark, width: number): void {
  const fill = { color: LANDMARK_COLOR, alpha: 0.75 };
  const dark = { color: LANDMARK_SHADE, alpha: 0.75 };
  const sx = width * 0.55;
  switch (landmark) {
    case 'collegiale':
      g.rect(sx, GROUND_Y - 250, 34, 250).fill(fill);
      g.rect(sx - 4, GROUND_Y - 254, 42, 6).fill(fill);
      g.rect(sx + 5, GROUND_Y - 290, 24, 38).fill(fill);
      g.poly([sx + 3, GROUND_Y - 290, sx + 17, GROUND_Y - 322, sx + 31, GROUND_Y - 290]).fill(fill);
      g.rect(sx + 13, GROUND_Y - 232, 8, 14).fill(dark);
      break;
    case 'philippeLeBon':
      // A tall square tower with a gallery and a flat roof.
      g.rect(sx, GROUND_Y - 280, 44, 280).fill(fill);
      g.rect(sx - 5, GROUND_Y - 292, 54, 14).fill(fill);
      g.rect(sx + 3, GROUND_Y - 306, 38, 14).fill(fill);
      g.rect(sx + 18, GROUND_Y - 236, 8, 18).fill(dark);
      g.rect(sx + 18, GROUND_Y - 170, 8, 18).fill(dark);
      break;
    case 'citadelle':
      // Ramparts and bastions on a hill.
      g.poly([
        sx - 120,
        GROUND_Y,
        sx - 40,
        GROUND_Y - 150,
        sx + 170,
        GROUND_Y - 150,
        sx + 250,
        GROUND_Y,
      ]).fill({
        color: LANDMARK_COLOR,
        alpha: 0.5,
      });
      g.rect(sx - 40, GROUND_Y - 190, 210, 40).fill(fill);
      for (let i = 0; i < 8; i++) g.rect(sx - 40 + i * 28, GROUND_Y - 200, 14, 10).fill(fill);
      g.rect(sx - 52, GROUND_Y - 214, 30, 64).fill(fill);
      g.rect(sx + 152, GROUND_Y - 214, 30, 64).fill(fill);
      g.rect(sx + 52, GROUND_Y - 175, 10, 18).fill(dark);
      g.rect(sx + 108, GROUND_Y - 175, 10, 18).fill(dark);
      break;
    case 'doyenne':
      // A square tower under a pointed roof.
      g.rect(sx, GROUND_Y - 210, 40, 210).fill(fill);
      g.poly([sx - 4, GROUND_Y - 210, sx + 20, GROUND_Y - 262, sx + 44, GROUND_Y - 210]).fill(fill);
      g.rect(sx + 16, GROUND_Y - 190, 8, 16).fill(dark);
      g.rect(sx + 16, GROUND_Y - 130, 8, 16).fill(dark);
      break;
  }
}

/**
 * Silhouette of the town behind the street, with the landmark of the city's
 * old centre (the Collégiale's bell tower in Dole…).
 */
export function drawSkyline(
  g: Graphics,
  width: number,
  seed: number,
  landmark: Landmark | null,
): { x: number; w: number; h: number }[] {
  const random = decorRandom(seed);
  const fill = { color: 0x8d8fae, alpha: 0.55 };
  const blocks: { x: number; w: number; h: number }[] = [];
  let x = -40;
  while (x < width + 40) {
    const w = 40 + random() * 60;
    const h = 60 + random() * 90;
    blocks.push({ x, w, h });
    const top = GROUND_Y - h;
    g.rect(x, top, w, h);
    // Roofs: flat, gabled or hipped, some with a chimney.
    const roof = random();
    if (roof < 0.35) g.poly([x, top, x + w / 2, top - 22, x + w, top]);
    else if (roof < 0.6) g.poly([x, top, x + w * 0.2, top - 16, x + w * 0.8, top - 16, x + w, top]);
    if (random() < 0.4) g.rect(x + w * (0.2 + random() * 0.5), top - 20, 6, 20);
    g.fill(fill);
    x += w - 4;
  }
  if (landmark) drawLandmark(g, landmark, width);
  return blocks;
}

/**
 * The farthest roofs and trees, drawn in white: the scene tints them with the
 * colour of the sky (the haze of the distance).
 */
export function drawFarSkyline(g: Graphics, width: number, seed: number): void {
  const random = decorRandom(seed);
  let x = -60;
  while (x < width + 60) {
    const w = 30 + random() * 70;
    const h = 110 + random() * 80;
    const top = GROUND_Y - h;
    if (random() < 0.3) {
      // A clump of trees.
      for (let i = 0; i < 3; i++)
        g.circle(x + w * (0.25 + i * 0.25), top + 14 + random() * 8, 14 + random() * 8);
      g.rect(x, top + 18, w, h - 18);
    } else {
      g.rect(x, top, w, h);
      if (random() < 0.5) g.poly([x - 2, top, x + w / 2, top - 18, x + w + 2, top]);
    }
    g.fill(0xffffff);
    x += w - 6;
  }
}

/** Windows lit at night in the town behind the street: a few dots per block. */
export function drawSkylineLights(
  g: Graphics,
  blocks: readonly { x: number; w: number; h: number }[],
  seed: number,
): void {
  const random = decorRandom(seed);
  for (const block of blocks) {
    const count = Math.floor(random() * 4);
    for (let i = 0; i < count; i++) {
      const x = block.x + 6 + random() * (block.w - 12);
      const y = GROUND_Y - block.h + 8 + random() * (block.h - 16);
      g.rect(x, y, 2.5, 3).fill(random() < 0.8 ? 0xffd27a : 0xfff0c0);
    }
  }
}

export const GARLAND_COLORS = [0xf6d36b, 0xe35d6a, 0x6fc3b8, 0xf2f2f2];
