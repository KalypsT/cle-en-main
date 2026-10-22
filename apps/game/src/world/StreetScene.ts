import type { Season, Weather } from '@cle/engine';
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  drawCrossroad,
  drawGround,
  drawLamp,
  drawPlanter,
  drawFarSkyline,
  drawSkyline,
  drawSkylineLights,
  landmarkOf,
  drawTerrace,
  drawTree,
  drawVan,
  forSalePanel,
  GARLAND_COLORS,
} from './decor.ts';
import { mix, shade } from './facade.ts';
import { blendLight, type Light, lightOf, litShare } from './light.ts';
import { type Crowd, crowdOf } from './crowd.ts';
import {
  type Car,
  createBird,
  createCar,
  createPassant,
  createWorker,
  type Walker,
} from './people.ts';
import { barShapes, facadeShapes, paneShapes } from './shapes.ts';
import {
  decorRandom,
  drawShapes,
  fadeTexture,
  glowTexture,
  gradientTexture,
  hashString,
  paintGradient,
} from './pixi-draw.ts';
import {
  DESIGN_HEIGHT,
  GROUND_Y,
  type LaidStreet,
  ROAD,
  SIDEWALK,
  sceneScale,
  type StreetLayout,
  streetAt,
} from './street-layout.ts';
import { WeatherLayer } from './weather-fx.ts';

/*
 * The living street drawn with PixiJS 8 (docs/05): sky, town silhouette,
 * façades, street furniture, lights, passers-by, cars, birds and weather.
 * The scene only draws what the engine's queries say (streets, ambience);
 * the HTML layer above it carries the bubbles and the buttons.
 */

export type QualityLevel = 0 | 1 | 2;

/** What each graphics level allows (2: high … 0: economy). */
const QUALITY = [
  { resolution: 1, people: 0.45, particles: 0.35, maxFps: 30, birds: false, distance: false },
  { resolution: 1.5, people: 0.75, particles: 0.65, maxFps: 60, birds: true, distance: true },
  { resolution: 2, people: 1, particles: 1, maxFps: 60, birds: true, distance: true },
] as const;

export interface SceneData {
  layout: StreetLayout;
  hour: number;
  moment: import('@cle/engine').Moment;
  season: Season;
  christmas: boolean;
  /** Player's colour (CSS accent). */
  accent: number;
  /** Shop signs and the agency panel's text (content/textes/ecrans.json). */
  shopNames: readonly string[];
  forSaleText: string;
  /** City and neighbourhood: the old centre shows its landmark (the Collégiale in Dole…). */
  cityId: string;
  neighbourhoodId: string;
  /** Stable seed of the decoration (the game's seed). */
  seed: number;
}

export interface FrameStats {
  fps: number;
  /** 95th percentile of the frame times, in milliseconds. */
  p95: number;
  quality: QualityLevel;
  renderer: string;
  /** Actors in the scene, for the end-to-end test that they stay few. */
  actors: Crowd;
}

interface StreetLayers {
  laid: LaidStreet;
  /** Ground, walls and panes. */
  back: Container;
  /** Shutters, window bars, balconies, trees, lamps, signs and workers. */
  front: Container;
  /** Lit windows and shop windows, between the two. */
  lights: Graphics;
  /** Soft halos around the lit windows and their light on the pavement (added light). */
  halos: Graphics;
  /** Pools of light under the lamps, and their reflections on a wet road. */
  pools: Sprite[];
  reflections: Sprite[];
  /** Christmas garlands, over everything. */
  sparkles: Graphics;
  lampGlows: Sprite[];
  garland: { x: number; y: number; color: number }[];
}

const MARGIN = 80;
/** Clouds in the sky: half of them near, half far. */
const CLOUDS = 8;
/** Curtains of the lit windows, and the goods in the shop windows. */
const CURTAINS = [0xc9714a, 0xd9b26a, 0x8f6aa8, 0x6f9a8a, 0xe8d8c0];
const GOODS = [0xc95d4a, 0xf2c14e, 0x6fc3b8, 0x8a5a32, 0xf2f2ee, 0x3f6f9a];
/** Cars keep this gap with the one ahead, and slow down from SAFE_GAP. */
const MIN_GAP = 14;
const SAFE_GAP = 50;
const FRAME_SAMPLES = 120;
/** Frames needed before judging the speed (a slow phone gives few per second). */
const MIN_SAMPLES = 20;

export class StreetScene {
  private app: Application | null = null;
  private readonly root = new Container();
  private readonly sky = new Sprite();
  private readonly orb = new Graphics();
  private readonly orbHalo = new Sprite();
  private readonly stars = new Container();
  private readonly clouds = new Container();
  /**
   * The street in world units, scaled to the view, from back to front: town silhouette,
   * walls, lit windows, what stands before the walls, passers-by and cars, then the halos.
   * The light tints all but the lit windows and the halos.
   */
  private readonly scene = new Container();
  /** The farthest roofs, in the haze: tinted with the sky's colours. */
  private readonly farSkyline = new Graphics();
  /** Haze at the foot of the town, in the horizon's colour. */
  private readonly haze = new Sprite();
  private readonly skyline = new Graphics();
  /** Lit windows of the town behind, at night. */
  private readonly skylineLights = new Graphics();
  private readonly back = new Container();
  private readonly windowLights = new Container();
  private readonly front = new Container();
  private readonly actors = new Container();
  private readonly glows = new Container();
  private readonly birds = new Container();
  private weather!: WeatherLayer;
  private glow!: Texture;
  private skyTexture!: Texture;
  private streets: StreetLayers[] = [];
  private people: Walker[] = [];
  private cars: Car[] = [];
  private flyers: Walker[] = [];
  /**
   * How many actors the view holds. Those who leave it are gone; new ones, dressed for the
   * current moment and weather, come in from the sides when there is room.
   */
  private crowd: Crowd = { people: 0, cars: 0, birds: 0 };
  /** Seconds before the next arrival of each kind. */
  private readonly arrivals = { people: 0, cars: 0, birds: 0 };
  private workers: Walker[] = [];
  private data: SceneData | null = null;
  private staticKey = '';
  private lightsKey = '';
  private skyKey = '';
  private light: Light = lightOf('day', 'sun');
  private target: Light = this.light;
  private currentWeather: Weather = 'sun';
  private width = 1;
  private height = 1;
  private scale = 1;
  private cameraX = 0;
  private lastCameraX = 0;
  private quality: QualityLevel = 2;
  private autoQuality = true;
  private reducedMotion = false;
  private frameTimes: number[] = [];
  private slowSince = 0;
  private random = decorRandom(1);
  private time = 0;
  private destroyed = false;

  /** Reads the scroll position of the HTML layer, in CSS pixels. */
  constructor(private readonly camera: () => number) {}

  async init(
    host: HTMLElement,
    quality: QualityLevel | 'auto',
    reducedMotion: boolean,
  ): Promise<string> {
    this.autoQuality = quality === 'auto';
    this.quality = quality === 'auto' ? 2 : quality;
    this.reducedMotion = reducedMotion;
    const app = new Application();
    const rect = host.getBoundingClientRect();
    await app.init({
      preference: ['webgl', 'canvas'],
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      antialias: this.quality > 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].resolution),
      backgroundColor: 0xf6f1e6,
    });
    if (this.destroyed) {
      app.destroy(true);
      return 'none';
    }
    this.app = app;
    app.canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(app.canvas);
    this.glow = glowTexture();
    this.skyTexture = gradientTexture();
    this.sky.texture = this.skyTexture;
    this.haze.texture = fadeTexture();
    this.orbHalo.texture = this.glow;
    this.orbHalo.anchor.set(0.5);
    this.orbHalo.blendMode = 'add';
    this.weather = new WeatherLayer(this.glow);
    this.scene.addChild(
      this.farSkyline,
      this.skyline,
      this.skylineLights,
      this.haze,
      this.back,
      this.windowLights,
      this.front,
      this.actors,
      this.glows,
    );
    this.root.addChild(
      this.sky,
      this.stars,
      this.orbHalo,
      this.orb,
      this.clouds,
      this.birds,
      this.scene,
    );
    app.stage.addChild(this.root, this.weather.view);
    app.ticker.maxFPS = QUALITY[this.quality].maxFps;
    app.ticker.add(() => this.frame(app.ticker.deltaMS));
    this.resize(rect.width, rect.height);
    // Data given while the renderer was starting: draw it now.
    if (this.data) {
      this.staticKey = '';
      this.setData(this.data);
      this.resetActors();
    }
    return app.renderer.name;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  setQuality(quality: QualityLevel | 'auto'): void {
    this.autoQuality = quality === 'auto';
    this.applyQuality(quality === 'auto' ? this.quality : quality);
  }

  private applyQuality(level: QualityLevel): void {
    if (!this.app) return;
    this.quality = level;
    this.app.ticker.maxFPS = QUALITY[level].maxFps;
    this.app.renderer.resolution = Math.min(
      window.devicePixelRatio || 1,
      QUALITY[level].resolution,
    );
    this.app.renderer.resize(this.width, this.height);
    this.updateCrowd();
    this.resetActors();
    this.configureWeather();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = sceneScale(this.height);
    if (!this.app) return;
    this.app.renderer.resize(this.width, this.height);
    this.sky.width = this.width;
    // Down to the ground line, so that the horizon's colour shows behind the roofs.
    this.sky.height = this.height - (DESIGN_HEIGHT - GROUND_Y) * this.scale;
    this.weather.resize(this.width, this.height);
    // Ground at the bottom of the view whatever its height.
    this.scene.scale.set(this.scale);
    this.scene.y = this.height - DESIGN_HEIGHT * this.scale;
    this.drawSkyDecor();
    this.configureWeather();
    this.updateCrowd();
  }

  setData(data: SceneData): void {
    const previous = this.data;
    this.data = data;
    // Seeded once: drawn again at each hour, the passers-by would come back as clones.
    if (previous?.seed !== data.seed) this.random = decorRandom(data.seed);
    // Only what the static drawing shows: a new bubble or works percentage redraws nothing.
    const buildingKey = (laid: LaidStreet['buildings'][number]) => {
      const b = laid.building;
      const forSale = b.role === 'listing' || b.bubbles.some((bubble) => bubble.kind === 'forSale');
      return [
        b.id,
        laid.x,
        b.role,
        b.facadeState,
        b.newWindows,
        b.scaffolding,
        b.tarp,
        forSale,
      ].join(':');
    };
    const staticKey = [
      data.layout.streets
        // Only snow changes the drawing (snow on the ground): rain or clouds redraw nothing.
        .map(
          (s) =>
            `${s.street.id}/${s.street.weather === 'snow'}/${s.buildings.map(buildingKey).join(',')}`,
        )
        .join('|'),
      data.season,
      data.christmas,
      data.accent,
      data.neighbourhoodId,
    ].join('#');
    if (staticKey !== this.staticKey) {
      this.staticKey = staticKey;
      this.buildStatic();
      this.lightsKey = '';
    }
    if (
      !previous ||
      previous.season !== data.season ||
      previous.neighbourhoodId !== data.neighbourhoodId ||
      previous.cityId !== data.cityId
    ) {
      this.resetActors();
    } else if (previous.moment !== data.moment) {
      // A new moment of the day: the passers-by change little by little, not all at once.
      this.renewActors();
    }
    this.updateTarget();
    this.updateCrowd();
  }

  /** Frame time statistics, for the FPS counter and the end-to-end test. */
  stats(): FrameStats {
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
    return {
      fps: mean > 0 ? Math.round(1000 / mean) : 0,
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      quality: this.quality,
      renderer: this.app?.renderer.name ?? 'none',
      actors: { people: this.people.length, cars: this.cars.length, birds: this.flyers.length },
    };
  }

  /** Stops drawing while the street is hidden (another tab, the app in the background). */
  setPaused(paused: boolean): void {
    if (!this.app) return;
    if (paused) this.app.ticker.stop();
    else {
      this.frameTimes = [];
      this.app.ticker.start();
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  private currentStreet(): LaidStreet | null {
    if (!this.data) return null;
    const center = (this.cameraX + this.width / 2) / this.scale;
    return this.data.layout.streets[streetAt(this.data.layout, center)] ?? null;
  }

  private updateTarget(): void {
    if (!this.data) return;
    const weather = this.currentStreet()?.street.weather ?? 'sun';
    this.target = lightOf(this.data.moment, weather);
    if (weather !== this.currentWeather) {
      this.currentWeather = weather;
      this.configureWeather();
      this.renewActors();
    }
    this.updateCrowd();
  }

  private updateCrowd(): void {
    const data = this.data;
    if (!data) return;
    const quality = QUALITY[this.quality];
    this.crowd = crowdOf({
      moment: data.moment,
      season: data.season,
      weather: this.currentWeather,
      street: this.currentStreet()?.street ?? null,
      viewWidth: this.width / this.scale,
      quality: quality.people,
      birds: quality.birds,
    });
  }

  private configureWeather(): void {
    if (!this.data || !this.weather) return;
    const amount = this.reducedMotion ? 0 : QUALITY[this.quality].particles;
    this.weather.configure(this.currentWeather, this.data.season, amount, this.random);
  }

  private drawSkyDecor(): void {
    if (!this.data) return;
    const random = decorRandom(this.data.seed + 7);
    this.stars.removeChildren().forEach((child) => child.destroy());
    for (let i = 0; i < 46; i++) {
      const star = new Sprite(this.glow);
      const size = random() < 0.2 ? 5 : 3;
      star.anchor.set(0.5);
      star.width = size;
      star.height = size;
      star.position.set(random() * this.width, random() * this.height * 0.5);
      // Its twinkle's phase.
      star.rotation = random() * Math.PI * 2;
      this.stars.addChild(star);
    }
    this.clouds.removeChildren().forEach((child) => child.destroy());
    // Puffy clouds with a flat, shaded base; the last ones far away, smaller and slower.
    for (let i = 0; i < CLOUDS; i++) {
      const cloud = new Graphics();
      const w = 40 + random() * 55;
      const puffs = 3 + Math.floor(random() * 2);
      // The shaded underside first, the white puffs over it.
      cloud.ellipse(0, w * 0.02, w * 0.7, w * 0.14).fill(0xdde3ec);
      for (let p = 0; p < puffs; p++) {
        const r = w * (0.24 + random() * 0.14);
        const cx = -w * 0.55 + ((p + 0.5) * w * 1.1) / puffs + (random() - 0.5) * 6;
        cloud.circle(cx, -r * 0.55 - w * 0.03, r);
      }
      cloud.fill(0xffffff);
      if (i >= CLOUDS / 2) cloud.scale.set(0.6);
      cloud.position.set(random() * this.width, 40 + random() * this.height * 0.3);
      this.clouds.addChild(cloud);
    }
  }

  private buildStatic(): void {
    const data = this.data;
    if (!data || !this.app) return;
    for (const layer of [this.back, this.windowLights, this.front, this.glows])
      layer.removeChildren().forEach((child) => child.destroy({ children: true }));
    // Its own generator: the workers look the same each time the street is drawn again.
    const random = decorRandom(data.seed + 3);
    this.workers = [];
    this.streets = [];
    this.skyline.clear();
    // The town behind scrolls slower than the street (0.7 and 0.85 of its pace, see frame()):
    // only the part that can come into view is drawn.
    const reach = (pace: number) => data.layout.width * (1 - pace) + 2000;
    const kind = landmarkOf(data.cityId, data.neighbourhoodId);
    // The landmark stands behind the start of the first street, where the player arrives
    // (in the middle of the view when the street is there).
    const first = data.layout.streets[0];
    const anchor = first ? Math.min(first.x + first.width / 2, first.x + 600) : 0;
    const blocks = drawSkyline(
      this.skyline,
      reach(0.7),
      data.seed,
      kind ? { kind, x: 200 + anchor * 0.3 + 140 } : null,
    );
    drawSkylineLights(this.skylineLights.clear(), blocks, data.seed + 11);
    drawFarSkyline(this.farSkyline.clear(), reach(0.85), data.seed + 13);
    this.skyline.x = -200;
    this.haze.position.set(-400, GROUND_Y - 120);
    this.haze.width = data.layout.width + 800;
    this.haze.height = 120;
    this.drawSkyDecor();
    const snowing = (street: LaidStreet) => street.street.weather === 'snow';

    data.layout.streets.forEach((laid, index) => {
      const back = new Container();
      const ground = new Graphics();
      const snow = snowing(laid);
      drawGround(ground, laid, {
        season: data.season,
        snow,
        christmas: data.christmas,
        totalWidth: data.layout.width,
      });
      const next = data.layout.streets[index + 1];
      if (next)
        drawCrossroad(
          ground,
          laid.x + laid.width,
          next.x - laid.x - laid.width,
          laid.street.quay,
          snow,
        );
      if (index === 0) drawCrossroad(ground, laid.x - 400, 400, laid.street.quay, snow);
      if (!next) drawCrossroad(ground, laid.x + laid.width, 400, laid.street.quay, snow);
      if (!laid.street.quay) {
        for (let x = laid.x + 60; x < laid.x + laid.width; x += 210)
          drawPlanter(ground, x, data.season);
      }
      back.addChild(ground);

      const front = new Graphics();
      const buildings = new Graphics();
      // Shop signs and the agencies' panels, over the façades.
      const labels = new Container();
      const garland: StreetLayers['garland'] = [];
      const workers: Walker[] = [];
      let lastSign = -1;
      for (const item of laid.buildings) {
        const { building, spec } = item;
        const mine = building.role === 'owned';
        const shapes = facadeShapes(spec, {
          accent: mine ? data.accent : null,
          highlightFloor: building.highlightFloor,
          scaffolding: building.scaffolding,
          tarp: building.tarp,
          snow,
          flowers: data.season === 'spring' || data.season === 'summer',
        });
        // Shadow at the foot of the façade.
        buildings
          .rect(item.x - 2, GROUND_Y - 3, spec.width + 4, 3)
          .fill({ color: 0x000000, alpha: 0.08 });
        drawShapes(buildings, shapes.base, item.x, GROUND_Y);
        for (const win of spec.windows) {
          drawShapes(buildings, paneShapes(spec, win, 0x8fa6b8), item.x, GROUND_Y);
          drawShapes(
            buildings,
            [
              {
                kind: 'rect',
                x: win.x,
                y: win.y,
                w: win.w * 0.4,
                h: win.h * 0.5,
                fill: 0xc9d8e2,
                alpha: 0.6,
              },
            ],
            item.x,
            GROUND_Y,
          );
        }
        drawShapes(front, shapes.front, item.x, GROUND_Y);
        for (const win of spec.windows)
          drawShapes(front, barShapes(spec, win, spec.frame), item.x, GROUND_Y);

        if (spec.shop) {
          // Neighbouring shops never share a sign.
          const signs = Math.max(1, data.shopNames.length);
          let signIndex = hashString(`${data.seed}#${building.id}`) % signs;
          if (signIndex === lastSign) signIndex = (signIndex + 1) % signs;
          lastSign = signIndex;
          const name = data.shopNames[signIndex] ?? '';
          const sign = new Text({
            text: name.toUpperCase(),
            style: {
              fontFamily: 'Manrope Variable, sans-serif',
              fontSize: 9,
              fontWeight: '800',
              fill: 0xfffdf8,
              letterSpacing: 0.6,
            },
          });
          sign.resolution = 3;
          sign.anchor.set(0.5);
          sign.position.set(item.x + spec.width / 2, GROUND_Y - spec.groundHeight + 10);
          if (sign.width > spec.width - 14) sign.scale.set((spec.width - 14) / sign.width);
          labels.addChild(sign);
          if (data.season === 'summer' || data.season === 'spring') {
            if (building.variant > 0.35) drawTerrace(front, item, spec.shop.awning);
          }
        }
        const forSale =
          building.role === 'listing' || building.bubbles.some((b) => b.kind === 'forSale');
        if (forSale) {
          const px = item.x + spec.width / 2 - 20;
          const py =
            GROUND_Y - spec.groundHeight - (spec.floors > 1 ? 20 : 2) + (spec.shop ? 0 : -6);
          const panel = new Graphics();
          forSalePanel(panel, px, py);
          const label = new Text({
            text: data.forSaleText.toUpperCase(),
            style: {
              fontFamily: 'Manrope Variable, sans-serif',
              fontSize: 7.5,
              fontWeight: '800',
              fill: 0xb23d27,
            },
          });
          label.resolution = 3;
          label.anchor.set(0.5);
          label.position.set(px + 19, py + 8);
          if (label.width > 38) label.scale.set(38 / label.width);
          labels.addChild(panel, label);
        }
        if (building.scaffolding) {
          drawVan(
            front,
            item.x + spec.width / 2 - 35,
            building.role === 'owned' ? data.accent : 0x8a5a32,
          );
          const worker = createWorker(random);
          worker.view.position.set(item.x + spec.width * 0.3, GROUND_Y - spec.groundHeight - 2);
          workers.push(worker);
        }
        if (data.christmas) {
          const y = GROUND_Y - spec.wallHeight + 6;
          for (let x = 4; x < spec.width - 2; x += 9) {
            const sag = Math.sin((x / spec.width) * Math.PI) * 5;
            garland.push({
              x: item.x + x,
              y: y + sag,
              color: GARLAND_COLORS[(x / 9) % GARLAND_COLORS.length] ?? 0xf6d36b,
            });
          }
          front
            .moveTo(item.x + 2, y)
            .quadraticCurveTo(item.x + spec.width / 2, y + 10, item.x + spec.width - 2, y)
            .stroke({ color: 0x2f4f3a, width: 1 });
        }
        if (item.treeX !== null)
          drawTree(front, item.treeX, data.season, hashString(building.id), snow);
      }
      for (const x of laid.lamps) drawLamp(front, x, data.christmas);
      back.addChild(buildings);
      const frontLayer = new Container();
      frontLayer.addChild(front, labels);
      for (const worker of workers) frontLayer.addChild(worker.view);
      this.workers.push(...workers);
      this.back.addChild(back);
      this.front.addChild(frontLayer);

      const halos = new Graphics();
      halos.blendMode = 'add';
      const lights = new Graphics();
      const glowSprite = (x: number, y: number, width: number, height: number) => {
        const sprite = new Sprite(this.glow);
        sprite.anchor.set(0.5);
        sprite.tint = 0xffd98a;
        sprite.blendMode = 'add';
        sprite.width = width;
        sprite.height = height;
        sprite.position.set(x, y);
        return sprite;
      };
      const pools = laid.lamps.map((x) => glowSprite(x, GROUND_Y + 11, 130, 24));
      const reflections = laid.street.quay
        ? []
        : laid.lamps.map((x) => glowSprite(x, GROUND_Y + SIDEWALK + ROAD * 0.6, 16, 62));
      this.windowLights.addChild(halos, ...pools, ...reflections, lights);
      const sparkles = new Graphics();
      // The lamp's halo, and its bright bulb.
      const lampGlows = laid.lamps.flatMap((x) => [
        glowSprite(x, GROUND_Y - 75, 120, 120),
        glowSprite(x, GROUND_Y - 75, 22, 22),
      ]);
      this.glows.addChild(sparkles, ...lampGlows);
      this.streets.push({
        laid,
        back,
        front: frontLayer,
        lights,
        halos,
        pools,
        reflections,
        sparkles,
        lampGlows,
        garland,
      });
    });
    this.workers.forEach((worker) => worker.update(0, false));
  }

  /**
   * Lit windows (warm, some with curtains or somebody at home, a television's blue late in
   * the evening), shop windows with their goods and their light on the pavement, and the
   * garlands; redrawn when the hour or the glow changes.
   */
  private drawLights(): void {
    const data = this.data;
    if (!data) return;
    const share = litShare(data.hour);
    const key = `${data.hour}|${Math.round(this.light.glow * 10)}|${this.staticKey.length}`;
    if (key === this.lightsKey) return;
    this.lightsKey = key;
    const glow = this.light.glow;
    const alpha = Math.min(1, glow * 1.1);
    const open = data.hour >= 7 && data.hour < 20;
    for (const layer of this.streets) {
      const g = layer.lights.clear();
      const halos = layer.halos.clear();
      const sparkles = layer.sparkles.clear();
      if (glow <= 0.02) continue;
      for (const item of layer.laid.buildings) {
        const { spec, building } = item;
        spec.windows.forEach((win, index) => {
          const mine = building.role === 'owned' && building.highlightFloor === win.floor;
          if (!(mine && share > 0.1) && win.light >= share) return;
          const look = hashString(`${building.id}#${index}`) % 20;
          const tv = look === 0 && data.hour >= 19;
          const color = tv ? 0x8fb4ea : win.light < share * 0.3 ? 0xffd88a : 0xf5b95a;
          const x = item.x + win.x;
          const y = GROUND_Y + win.y;
          halos
            .rect(x - 4, y - 4, win.w + 8, win.h + 8)
            .fill({ color: tv ? 0x8fb4ea : 0xffc46a, alpha: 0.14 * glow });
          drawShapes(
            g,
            paneShapes(spec, win, color).map((shape) => ({ ...shape, alpha })),
            item.x,
            GROUND_Y,
          );
          // The ceiling light: the upper part of the room is brighter.
          g.rect(x, y, win.w, win.h * 0.45).fill({
            color: tv ? 0xc4d8ff : 0xffe6ae,
            alpha: alpha * 0.8,
          });
          if (look >= 12) {
            const curtain = CURTAINS[look % CURTAINS.length] ?? 0xc9714a;
            // Two drapes held back at mid-height.
            const w = win.w * 0.26;
            const r = x + win.w;
            const { h } = win;
            g.poly([x, y, x + w, y, x + w * 0.4, y + h * 0.6, x + w * 0.8, y + h, x, y + h])
              .poly([r, y, r - w, y, r - w * 0.4, y + h * 0.6, r - w * 0.8, y + h, r, y + h])
              .fill({ color: curtain, alpha: alpha * 0.9 });
          } else if (look >= 9 && win.h >= 14) {
            // Somebody at home, seen from the street.
            const cx = x + win.w * (look === 9 ? 0.35 : 0.62);
            g.circle(cx, y + win.h * 0.5, win.w * 0.13)
              .roundRect(cx - win.w * 0.22, y + win.h * 0.64, win.w * 0.44, win.h * 0.36, 2)
              .fill({ color: 0x5a3f2c, alpha: alpha * 0.75 });
          }
        });
        if (spec.shop) {
          // The two shop windows (see facadeShapes), not the pillar between them.
          const y = GROUND_Y - spec.groundHeight + 19;
          const h = spec.groundHeight - 24;
          const w = spec.width / 2 - 14;
          for (const dx of [9, spec.width / 2 + 5]) {
            const x = item.x + dx;
            // Closed at night: only a dim light stays on.
            g.rect(x, y, w, h).fill({ color: 0xffe0a0, alpha: (open ? 0.85 : 0.3) * glow });
            for (const shelf of [0.42, 0.78]) {
              const sy = y + h * shelf;
              g.rect(x + 2, sy, w - 4, 1.2).fill({ color: 0x8a6a4a, alpha: glow });
              for (let gx = x + 4, i = 0; gx < x + w - 5; gx += 6, i++) {
                const goods = GOODS[(hashString(building.id) + i) % GOODS.length] ?? 0xf2c14e;
                g.rect(gx, sy - 4, 4, 4).fill({ color: goods, alpha: glow * 0.9 });
              }
            }
            if (open)
              halos
                .poly([
                  x,
                  GROUND_Y,
                  x + w,
                  GROUND_Y,
                  x + w + 8,
                  GROUND_Y + SIDEWALK - 4,
                  x - 8,
                  GROUND_Y + SIDEWALK - 4,
                ])
                .fill({ color: 0xffd38a, alpha: 0.2 * glow });
          }
        }
      }
      for (const light of layer.garland)
        sparkles
          .circle(light.x, light.y, 1.6)
          .fill({ color: light.color, alpha: Math.max(0.5, glow) });
    }
  }

  /** Fills the view at once (a new street, season or quality): nobody comes from the sides. */
  private resetActors(): void {
    if (!this.data || !this.app) return;
    for (const walker of [...this.people, ...this.cars, ...this.flyers])
      walker.view.destroy({ children: true });
    this.people = [];
    this.cars = [];
    this.flyers = [];
    this.updateCrowd();
    const { left, right } = this.view();
    const span = right - left;
    for (let i = 0; i < this.crowd.people; i++)
      this.addPassant(left + this.random() * span, this.random() < 0.5 ? 1 : -1);
    // Spread out along the road, one lane each way.
    for (let i = 0; i < this.crowd.cars; i++) {
      const x = left + ((i + 0.2 + this.random() * 0.6) * span) / this.crowd.cars;
      this.addCar(x, i % 2 === 0 ? 1 : -1);
    }
    for (let i = 0; i < this.crowd.birds; i++)
      this.addBird(this.random() * this.width, this.random() < 0.5 ? 1 : -1);
    Object.assign(this.arrivals, { people: 0, cars: 0, birds: 0 });
  }

  /**
   * The moment or the weather changed: the actors on screen walk on and leave, and the ones
   * who come in from the sides are dressed for the new one (no one pops in or out in view).
   */
  private renewActors(): void {
    if (!this.data || !this.app) return;
    // Nobody walks with reduced motion: the new ones would never come in.
    if (this.reducedMotion) this.resetActors();
    else this.updateCrowd();
  }

  /** The visible part of the street, in world units. */
  private view(): { left: number; right: number } {
    return {
      left: this.cameraX / this.scale,
      right: (this.cameraX + this.width) / this.scale,
    };
  }

  private addPassant(x: number, dir: 1 | -1, together = false): Walker | null {
    const data = this.data;
    if (!data) return null;
    const walker = createPassant({
      season: data.season,
      weather: this.currentWeather,
      night: data.moment === 'night',
      random: this.random,
      together,
    });
    walker.x = x;
    walker.dir = dir;
    walker.update(0, true);
    this.people.push(walker);
    this.actors.addChild(walker.view);
    this.sortActors();
    return walker;
  }

  private addCar(x: number, dir: 1 | -1): void {
    const car = createCar(this.random, this.glow, dir);
    car.x = x;
    car.update(0, true);
    this.cars.push(car);
    this.actors.addChild(car.view);
    this.sortActors();
  }

  /** A bird, in view coordinates (the sky does not scroll with the street). */
  private addBird(x: number, dir: 1 | -1, y?: number): void {
    const bird = createBird(this.random);
    bird.x = x;
    bird.dir = dir;
    if (y !== undefined) bird.y = y;
    this.flyers.push(bird);
    this.birds.addChild(bird.view);
  }

  /** By depth: the far lane first, the people on the pavement in front of the buildings. */
  private sortActors(): void {
    this.actors.children.sort((a, b) => a.y - b.y);
  }

  /**
   * Brings in new actors from the sides while the view holds fewer than its crowd, one at a
   * time; when the player slides the street, they come from the side it slides towards.
   */
  private arrive(dt: number, cameraDx: number): void {
    const { left, right } = this.view();
    const arrivals = this.arrivals;
    arrivals.people -= dt;
    arrivals.cars -= dt;
    arrivals.birds -= dt;
    const missing = this.crowd.people - this.people.length;
    if (missing > 0 && arrivals.people <= 0) {
      arrivals.people = (0.5 + this.random() * 1.5) / missing;
      const dir = this.random() < 0.5 ? 1 : -1;
      const side = Math.abs(cameraDx) > 1 ? Math.sign(cameraDx) : -dir;
      const x = side < 0 ? left - MARGIN / 2 : right + MARGIN / 2;
      if (missing >= 2 && this.random() < 0.15) {
        // Two people walking together, side by side and at the same pace.
        const first = this.addPassant(x, dir, true);
        const second = this.addPassant(x - dir * 15, dir, true);
        if (first && second) {
          second.speed = first.speed = Math.min(first.speed, second.speed, 30);
          second.y = first.y + (this.random() < 0.5 ? -3 : 3);
          this.sortActors();
        }
      } else {
        this.addPassant(x, dir);
      }
    }
    if (this.cars.length < this.crowd.cars && arrivals.cars <= 0) {
      const dir = this.random() < 0.5 ? 1 : -1;
      const x = dir === 1 ? left - MARGIN * 1.5 : right + MARGIN * 1.5;
      // Wait until the lane is clear at the entry.
      const clear = this.cars.every((car) => car.dir !== dir || Math.abs(car.x - x) > SAFE_GAP * 2);
      if (clear) {
        this.addCar(x, dir);
        arrivals.cars = 1.5 + this.random() * 3;
      } else {
        arrivals.cars = 0.4;
      }
    }
    const birds = this.crowd.birds - this.flyers.length;
    if (birds > 0 && arrivals.birds <= 0) {
      // A small flock crosses the sky now and then.
      arrivals.birds = 3 + this.random() * 8;
      const dir = this.random() < 0.5 ? 1 : -1;
      const y = 50 + this.random() * Math.min(160, this.height * 0.3);
      const flock = Math.min(birds, 1 + Math.floor(this.random() * 3));
      for (let i = 0; i < flock; i++) {
        const x = dir === 1 ? -20 - i * 16 : this.width + 20 + i * 16;
        this.addBird(x, dir, y + (this.random() - 0.5) * 18);
      }
    }
  }

  /** Each car keeps its distance with the one ahead in its lane. */
  private drive(dt: number): void {
    for (const car of this.cars) {
      let gap = Infinity;
      let leader: Car | null = null;
      for (const other of this.cars) {
        if (other === car || other.dir !== car.dir) continue;
        const ahead = (other.x - car.x) * car.dir;
        if (ahead <= 0) continue;
        const space = ahead - (other.length + car.length) / 2;
        if (space < gap) {
          gap = space;
          leader = other;
        }
      }
      const target =
        leader && gap < SAFE_GAP
          ? Math.min(car.cruise, Math.max(0, leader.speed + (gap - MIN_GAP) * 2))
          : car.cruise;
      car.speed += (target - car.speed) * Math.min(1, dt * 4);
    }
  }

  /** Destroys the actors gone out of view (with a margin). */
  private dropGone<T extends Walker>(actors: T[], gone: (actor: T) => boolean): T[] {
    return actors.filter((actor) => {
      if (!gone(actor)) return true;
      actor.view.destroy({ children: true });
      return false;
    });
  }

  private frame(deltaMS: number): void {
    const data = this.data;
    if (!data || !this.app) return;
    const dt = Math.min(0.1, deltaMS / 1000);
    this.time += dt;
    this.recordFrame(deltaMS);
    this.cameraX = this.camera();
    const cameraDx = this.cameraX - this.lastCameraX;
    this.lastCameraX = this.cameraX;
    this.scene.x = -this.cameraX;
    this.skyline.x = -200 + (this.cameraX / this.scale) * 0.7;
    this.farSkyline.x = -200 + (this.cameraX / this.scale) * 0.85;
    if (Math.abs(cameraDx) > 0) this.updateTarget();

    // Light: ease towards the target.
    // The colours ease in; night (stars, moon) follows the target at once.
    this.light = {
      ...blendLight(this.light, this.target, Math.min(1, dt * 1.5)),
      night: this.target.night,
    };
    for (const layer of [this.skyline, this.back, this.front]) layer.tint = this.light.tint;
    // People and cars a little lighter than the walls: they stay readable at night.
    this.actors.tint = mix(this.light.tint, 0xffffff, 0.3);
    this.skylineLights.x = this.skyline.x;
    // The distance takes the colour of the sky behind it.
    this.farSkyline.tint = shade(mix(this.light.skyMiddle, this.light.skyBottom, 0.55), -0.1);
    this.haze.tint = this.light.skyBottom;
    this.haze.alpha = this.light.night ? 0.2 : 0.38;
    // The far town and the haze are costly to paint on slow phones.
    const distance = QUALITY[this.quality].distance;
    this.farSkyline.visible = distance;
    this.haze.visible = distance;
    this.skylineLights.alpha = Math.max(0, (this.light.glow - 0.3) / 0.7) * 0.8;
    const { skyTop, skyMiddle, skyBottom } = this.light;
    const skyKey = `${skyTop}-${skyMiddle}-${skyBottom}`;
    if (skyKey !== this.skyKey) {
      this.skyKey = skyKey;
      paintGradient(this.skyTexture, skyTop, skyMiddle, skyBottom);
    }
    this.stars.visible = this.light.night;
    if (this.light.night) {
      for (const star of this.stars.children)
        star.alpha =
          0.55 + 0.45 * Math.sin(this.time * (1.2 + (star.rotation % 1.5)) + star.rotation);
    }
    this.drawOrb();
    this.drawLights();
    const glowAlpha = this.light.glow;
    const still = this.reducedMotion;

    // Show only the streets in view.
    const view = this.view();
    const left = view.left - MARGIN;
    const right = view.right + MARGIN;
    // Street lamps only light up from dusk.
    const lamp = Math.max(0, (glowAlpha - 0.4) / 0.6);
    for (const layer of this.streets) {
      const visible = layer.laid.x + layer.laid.width > left - 400 && layer.laid.x < right + 400;
      layer.back.visible = visible;
      layer.front.visible = visible;
      layer.lights.visible = visible;
      layer.halos.visible = visible;
      layer.sparkles.visible = visible;
      for (const sprite of layer.lampGlows) {
        sprite.visible = visible && lamp > 0.02;
        sprite.alpha = lamp * (0.85 + Math.sin(this.time * 2 + sprite.x) * 0.03);
      }
      for (const sprite of layer.pools) {
        sprite.visible = visible && lamp > 0.02;
        sprite.alpha = lamp * 0.5;
      }
      // A wet road mirrors the lamps.
      const wet = data.layout.streets[layer.laid.index]?.street.weather === 'rain';
      for (const sprite of layer.reflections) {
        sprite.visible = visible && wet && lamp > 0.02;
        sprite.alpha = lamp * (0.32 + Math.sin(this.time * 3 + sprite.x) * 0.04);
      }
    }

    const outOfView = (actor: Walker, margin: number) =>
      actor.x < view.left - margin || actor.x > view.right + margin;
    this.people = this.dropGone(this.people, (walker) => outOfView(walker, MARGIN));
    this.cars = this.dropGone(this.cars, (car) => outOfView(car, MARGIN * 2));
    this.flyers = this.dropGone(this.flyers, (bird) => bird.x < -60 || bird.x > this.width + 60);
    for (const walker of this.people) walker.update(dt, still);
    this.drive(dt);
    for (const car of this.cars) {
      car.update(dt, still);
      car.lights.alpha = glowAlpha * 0.8;
      const braking = car.speed < car.cruise * 0.75;
      car.tail.alpha = Math.max(glowAlpha * 0.7, braking ? 0.9 : 0);
    }
    for (const bird of this.flyers) bird.update(dt, still);
    if (!still) this.arrive(dt, cameraDx);
    for (const worker of this.workers) worker.update(dt, still);
    // A few clouds in fair weather, a full sky otherwise.
    const cloudy = this.currentWeather === 'sun' || !QUALITY[this.quality].distance ? 3 : CLOUDS;
    for (const [i, cloud] of this.clouds.children.entries()) {
      const far = i >= CLOUDS / 2;
      cloud.visible = (i % (CLOUDS / 2)) * 2 + (far ? 1 : 0) < cloudy;
      if (!still) cloud.x += (far ? 2 + i * 0.5 : 4 + i) * dt - cameraDx * (far ? 0.05 : 0.1);
      if (cloud.x > this.width + 120) cloud.x = -120;
      if (cloud.x < -140) cloud.x = this.width + 100;
      // Opaque (overlapping puffs would show through), blended into the sky by their colour:
      // the low sun's in fair weather, the sky's for the far ones and under a grey sky.
      const sunny = this.currentWeather === 'sun' || this.currentWeather === 'clouds';
      const lit = this.light.night
        ? 0x3a4466
        : mix(this.light.tint, this.light.orbGlow, sunny ? (1 - this.light.orb) * 0.7 : 0);
      cloud.tint = mix(lit, this.light.skyTop, (far ? 0.35 : 0.12) + (sunny ? 0 : 0.2));
    }
    if (!still) this.weather.update(dt, cameraDx);
  }

  private drawOrb(): void {
    const g = this.orb.clear();
    const y = this.height * (0.62 - this.light.orb * 0.5);
    const x = this.width * 0.78;
    const shown = this.currentWeather === 'sun' || this.currentWeather === 'clouds';
    // A wide soft halo, warmer and larger when the sun is low.
    const halo = this.orbHalo;
    halo.visible = shown;
    halo.position.set(x, y);
    halo.tint = this.light.orbGlow;
    halo.width = halo.height = this.light.night ? 110 : 150 + (1 - this.light.orb) * 170;
    halo.alpha = this.light.night ? 0.22 : 0.3 + (1 - this.light.orb) * 0.35;
    if (!shown) return;
    if (this.light.night) {
      g.circle(x, y, 26).fill({ color: 0xf6f1dc, alpha: 0.08 });
      g.circle(x, y, 15).fill(0xf3eed8);
      g.circle(x - 4, y - 3, 3)
        .fill(0xdcd5bc)
        .circle(x + 5, y + 4, 2.2)
        .fill(0xdcd5bc);
    } else {
      g.circle(x, y, 30).fill({ color: 0xfff3c4, alpha: 0.35 }).circle(x, y, 18).fill(0xfff1b8);
    }
  }

  private recordFrame(deltaMS: number): void {
    this.frameTimes.push(deltaMS);
    if (this.frameTimes.length > FRAME_SAMPLES) this.frameTimes.shift();
    if (!this.autoQuality || this.frameTimes.length < MIN_SAMPLES || this.quality === 0) return;
    // Degrade when frames stay slow for 3 seconds (target: 45 fps at least).
    const mean = this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    const limit = 1000 / Math.min(45, QUALITY[this.quality].maxFps - 5);
    if (mean > limit) {
      this.slowSince += deltaMS;
      if (this.slowSince > 3000) {
        this.slowSince = 0;
        this.frameTimes = [];
        this.applyQuality((this.quality - 1) as QualityLevel);
      }
    } else {
      this.slowSince = 0;
    }
  }
}
