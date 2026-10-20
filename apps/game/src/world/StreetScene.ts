import type { Season, Weather } from '@cle/engine';
import { Application, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import {
  drawCrossroad,
  drawGround,
  drawLamp,
  drawPlanter,
  drawSkyline,
  landmarkOf,
  drawTerrace,
  drawTree,
  drawVan,
  forSalePanel,
  GARLAND_COLORS,
} from './decor.ts';
import { blendLight, type Light, lightOf, litShare } from './light.ts';
import { createBird, createCar, createPassant, createWorker, type Walker } from './people.ts';
import { barShapes, facadeShapes, paneShapes } from './shapes.ts';
import {
  decorRandom,
  drawShapes,
  glowTexture,
  gradientTexture,
  hashString,
  paintGradient,
} from './pixi-draw.ts';
import {
  DESIGN_HEIGHT,
  GROUND_Y,
  type LaidStreet,
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
  { resolution: 1, people: 0.45, particles: 0.35, maxFps: 30, birds: false },
  { resolution: 1.5, people: 0.75, particles: 0.65, maxFps: 60, birds: true },
  { resolution: 2, people: 1, particles: 1, maxFps: 60, birds: true },
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
}

interface StreetLayers {
  laid: LaidStreet;
  base: Container;
  lights: Graphics;
  lampGlows: Sprite[];
  garland: { x: number; y: number; color: number }[];
}

/** Base people per street view, by moment. */
const PEOPLE = { morning: 7, day: 11, evening: 8, night: 3 } as const;
const CARS = { morning: 2, day: 3, evening: 2, night: 1 } as const;
const MARGIN = 80;
const FRAME_SAMPLES = 120;
/** Frames needed before judging the speed (a slow phone gives few per second). */
const MIN_SAMPLES = 20;

export class StreetScene {
  private app: Application | null = null;
  private readonly root = new Container();
  private readonly sky = new Sprite();
  private readonly orb = new Graphics();
  private readonly stars = new Graphics();
  private readonly clouds = new Container();
  private readonly skyline = new Graphics();
  /** Everything tinted by the light: the street and its people. */
  private readonly lit = new Container();
  private readonly world = new Container();
  private readonly actors = new Container();
  private readonly glows = new Container();
  private readonly birds = new Container();
  private weather!: WeatherLayer;
  private glow!: Texture;
  private skyTexture!: Texture;
  private streets: StreetLayers[] = [];
  private people: Walker[] = [];
  private cars: (Walker & { lights: Sprite })[] = [];
  private flyers: Walker[] = [];
  /** Actors of an earlier moment or weather: they leave the view and are not replaced. */
  private stale = new WeakSet<Walker>();
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
    this.weather = new WeatherLayer(this.glow);
    this.lit.addChild(this.skyline, this.world, this.actors);
    this.root.addChild(
      this.sky,
      this.stars,
      this.orb,
      this.clouds,
      this.birds,
      this.lit,
      this.glows,
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
    this.sky.height = this.height;
    this.weather.resize(this.width, this.height);
    // Ground at the bottom of the view whatever its height.
    const offsetY = this.height - DESIGN_HEIGHT * this.scale;
    for (const layer of [this.lit, this.glows]) {
      layer.scale.set(this.scale);
      layer.y = offsetY;
    }
    this.drawSkyDecor();
    this.configureWeather();
  }

  setData(data: SceneData): void {
    const previous = this.data;
    this.data = data;
    this.random = decorRandom(data.seed);
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
  }

  private configureWeather(): void {
    if (!this.data || !this.weather) return;
    const amount = this.reducedMotion ? 0 : QUALITY[this.quality].particles;
    this.weather.configure(this.currentWeather, this.data.season, amount, this.random);
  }

  private drawSkyDecor(): void {
    if (!this.data) return;
    const random = decorRandom(this.data.seed + 7);
    this.stars.clear();
    for (let i = 0; i < 40; i++) {
      this.stars
        .circle(random() * this.width, random() * this.height * 0.5, random() < 0.2 ? 1.4 : 0.8)
        .fill(0xffffff);
    }
    this.clouds.removeChildren().forEach((child) => child.destroy());
    for (let i = 0; i < 4; i++) {
      const cloud = new Graphics();
      const w = 50 + random() * 50;
      cloud
        .ellipse(0, 0, w, 11)
        .fill(0xffffff)
        .ellipse(w * 0.3, -9, w * 0.45, 12)
        .fill(0xffffff);
      cloud.position.set(random() * this.width, 40 + random() * this.height * 0.3);
      cloud.alpha = 0.6;
      this.clouds.addChild(cloud);
    }
  }

  private buildStatic(): void {
    const data = this.data;
    if (!data || !this.app) return;
    this.world.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.glows.removeChildren().forEach((child) => child.destroy());
    this.workers = [];
    this.streets = [];
    this.skyline.clear();
    drawSkyline(
      this.skyline,
      data.layout.width + 400,
      data.seed,
      landmarkOf(data.cityId, data.neighbourhoodId),
    );
    this.skyline.x = -200;
    this.drawSkyDecor();
    const snowing = (street: LaidStreet) => street.street.weather === 'snow';

    data.layout.streets.forEach((laid, index) => {
      const base = new Container();
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
      base.addChild(ground);

      const front = new Graphics();
      const buildings = new Graphics();
      // Shop signs and the agencies' panels, over the façades.
      const labels = new Container();
      const garland: StreetLayers['garland'] = [];
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
          const worker = createWorker(this.random);
          worker.view.position.set(item.x + spec.width * 0.3, GROUND_Y - spec.groundHeight - 2);
          this.workers.push(worker);
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
      base.addChild(buildings, front, labels);
      for (const worker of this.workers) base.addChild(worker.view);
      this.world.addChild(base);

      const lights = new Graphics();
      lights.blendMode = 'add';
      this.glows.addChild(lights);
      const lampGlows = laid.lamps.map((x) => {
        const sprite = new Sprite(this.glow);
        sprite.anchor.set(0.5);
        sprite.tint = 0xffd98a;
        sprite.blendMode = 'add';
        sprite.width = 120;
        sprite.height = 120;
        sprite.position.set(x, GROUND_Y - 75);
        this.glows.addChild(sprite);
        return sprite;
      });
      this.streets.push({ laid, base, lights, lampGlows, garland });
    });
    this.workers.forEach((worker) => worker.update(0, false));
  }

  /** Lit windows and garlands, redrawn when the hour or the glow changes. */
  private drawLights(): void {
    const data = this.data;
    if (!data) return;
    const share = litShare(data.hour);
    const key = `${data.hour}|${Math.round(this.light.glow * 10)}|${this.staticKey.length}`;
    if (key === this.lightsKey) return;
    this.lightsKey = key;
    const glow = this.light.glow;
    for (const layer of this.streets) {
      const g = layer.lights.clear();
      if (glow <= 0.02) continue;
      for (const item of layer.laid.buildings) {
        const { spec, building } = item;
        for (const win of spec.windows) {
          const mine = building.role === 'owned' && building.highlightFloor === win.floor;
          if (!(mine && share > 0.1) && win.light >= share) continue;
          const warm = win.light < share * 0.3 ? 0xfff0c0 : 0xffd27a;
          for (const shape of paneShapes(spec, win, warm)) {
            drawShapes(g, [{ ...shape, alpha: 0.95 * glow }], item.x, GROUND_Y);
          }
        }
        if (spec.shop && data.hour >= 7 && data.hour < 20) {
          g.rect(
            item.x + 9,
            GROUND_Y - spec.groundHeight + 19,
            spec.width - 18,
            spec.groundHeight - 24,
          ).fill({ color: 0xffe2a0, alpha: 0.7 * glow });
        }
      }
      for (const light of layer.garland)
        g.circle(light.x, light.y, 1.6).fill({ color: light.color, alpha: Math.max(0.5, glow) });
    }
  }

  private resetActors(): void {
    if (!this.data || !this.app) return;
    for (const walker of [...this.people, ...this.cars, ...this.flyers])
      walker.view.destroy({ children: true });
    this.people = [];
    this.cars = [];
    this.flyers = [];
    this.addActors(true);
  }

  /**
   * The moment or the weather changed: the actors on screen walk on and leave, the new ones
   * come in from the sides (no one pops in or out in view).
   */
  private renewActors(): void {
    if (!this.data || !this.app) return;
    // Nobody walks with reduced motion: the new ones would never come in.
    if (this.reducedMotion) {
      this.resetActors();
      return;
    }
    for (const walker of [...this.people, ...this.cars, ...this.flyers]) this.stale.add(walker);
    this.addActors(false);
  }

  /** Passers-by, cars and birds of the current moment and weather; `anywhere` in view or outside. */
  private addActors(anywhere: boolean): void {
    const data = this.data;
    if (!data) return;
    const quality = QUALITY[this.quality];
    const weatherFactor =
      this.currentWeather === 'rain' || this.currentWeather === 'snow' ? 0.6 : 1;
    const people = Math.max(1, Math.round(PEOPLE[data.moment] * quality.people * weatherFactor));
    const night = data.moment === 'night';
    const street = this.currentStreet();
    for (let i = 0; i < people; i++) {
      const walker = createPassant({
        season: data.season,
        weather: this.currentWeather,
        night,
        random: this.random,
      });
      this.placeInView(walker, anywhere);
      walker.view.scale.x = walker.dir;
      this.people.push(walker);
      this.actors.addChild(walker.view);
    }
    if (!street?.street.quay) {
      for (let i = 0; i < CARS[data.moment]; i++) {
        const car = createCar(this.random, this.glow);
        this.placeInView(car, anywhere);
        this.cars.push(car);
        this.actors.addChild(car.view);
      }
    }
    // Sort by depth: the far lane first, people on the pavement in front of the buildings.
    this.actors.children.sort((a, b) => a.y - b.y);
    if (
      quality.birds &&
      !night &&
      this.currentWeather !== 'rain' &&
      this.currentWeather !== 'snow'
    ) {
      for (let i = 0; i < 3; i++) {
        const bird = createBird(this.random);
        bird.x = anywhere ? this.random() * this.width : -30 - this.random() * 200;
        this.flyers.push(bird);
        this.birds.addChild(bird.view);
      }
    }
  }

  /** Removes the stale actors that went out of view, and destroys them. */
  private dropStale<T extends Walker>(actors: T[], gone: (actor: T) => boolean): T[] {
    return actors.filter((actor) => {
      if (!this.stale.has(actor) || !gone(actor)) return true;
      actor.view.destroy({ children: true });
      return false;
    });
  }

  /** Puts a walker in the visible part of the street (or just outside it). */
  private placeInView(walker: Walker, anywhere: boolean): void {
    const left = this.cameraX / this.scale;
    const right = (this.cameraX + this.width) / this.scale;
    walker.x = anywhere
      ? left - MARGIN + this.random() * (right - left + MARGIN * 2)
      : walker.dir === 1
        ? left - MARGIN / 2
        : right + MARGIN / 2;
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
    const worldX = -this.cameraX;
    this.lit.x = worldX;
    this.glows.x = worldX;
    this.skyline.x = -200 + (this.cameraX / this.scale) * 0.7;
    if (Math.abs(cameraDx) > 0) this.updateTarget();

    // Light: ease towards the target.
    // The colours ease in; night (stars, moon) follows the target at once.
    this.light = {
      ...blendLight(this.light, this.target, Math.min(1, dt * 1.5)),
      night: this.target.night,
    };
    this.lit.tint = this.light.tint;
    const skyKey = `${this.light.skyTop}-${this.light.skyBottom}`;
    if (skyKey !== this.skyKey) {
      this.skyKey = skyKey;
      paintGradient(this.skyTexture, this.light.skyTop, this.light.skyBottom);
    }
    this.stars.alpha = this.light.night ? 1 : 0;
    this.drawOrb();
    this.drawLights();
    const glowAlpha = this.light.glow;
    const still = this.reducedMotion;

    // Show only the streets in view.
    const left = this.cameraX / this.scale - MARGIN;
    const right = (this.cameraX + this.width) / this.scale + MARGIN;
    for (const layer of this.streets) {
      const visible = layer.laid.x + layer.laid.width > left - 400 && layer.laid.x < right + 400;
      layer.base.visible = visible;
      layer.lights.visible = visible;
      for (const sprite of layer.lampGlows) {
        // Street lamps only light up from dusk.
        const lamp = Math.max(0, (glowAlpha - 0.4) / 0.6);
        sprite.visible = visible && lamp > 0.02;
        sprite.alpha = lamp * (0.85 + Math.sin(this.time * 2 + sprite.x) * 0.03);
      }
    }

    const outOfView = (walker: Walker, margin: number) =>
      walker.x < left - margin || walker.x > right + margin;
    this.people = this.dropStale(this.people, (walker) => outOfView(walker, MARGIN));
    this.cars = this.dropStale(this.cars, (car) => outOfView(car, MARGIN * 2));
    this.flyers = this.dropStale(this.flyers, (bird) => bird.x < -40 || bird.x > this.width + 40);
    for (const walker of this.people) {
      walker.update(dt, still);
      // A stale one that left is destroyed on the next frame; it must not come back.
      if (outOfView(walker, MARGIN) && !this.stale.has(walker)) this.respawn(walker);
    }
    for (const car of this.cars) {
      car.update(dt, still);
      car.lights.alpha = glowAlpha * 0.8;
      if (outOfView(car, MARGIN * 2) && !this.stale.has(car)) this.respawn(car);
    }
    for (const bird of this.flyers) {
      bird.update(dt, still);
      if (bird.x < -40) bird.x = this.width + 30;
      if (bird.x > this.width + 40) bird.x = -30;
    }
    for (const worker of this.workers) worker.update(dt, still);
    for (const [i, cloud] of this.clouds.children.entries()) {
      if (!still) cloud.x += (4 + i) * dt - cameraDx * 0.1;
      if (cloud.x > this.width + 120) cloud.x = -120;
      if (cloud.x < -140) cloud.x = this.width + 100;
      cloud.alpha = this.currentWeather === 'sun' ? 0.45 : 0.75;
      cloud.tint = this.light.night ? 0x3a4466 : this.light.tint;
    }
    if (!still) this.weather.update(dt, cameraDx);
  }

  private respawn(walker: Walker): void {
    walker.dir = this.random() < 0.5 ? 1 : -1;
    this.placeInView(walker, false);
    walker.view.scale.x = walker.dir;
  }

  private drawOrb(): void {
    const g = this.orb.clear();
    const y = this.height * (0.62 - this.light.orb * 0.5);
    const x = this.width * 0.78;
    if (this.currentWeather !== 'sun' && this.currentWeather !== 'clouds') return;
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
