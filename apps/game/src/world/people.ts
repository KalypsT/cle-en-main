import type { Season, Weather } from '@cle/engine';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { shade } from './facade.ts';
import { GROUND_Y, ROAD, SIDEWALK } from './street-layout.ts';

/*
 * Passers-by, cars and birds (docs/05, 5.5 and 5.6): simple faces with a
 * slightly big head, clothes in two or three colours by season, accessories
 * by context, and a walk animated by code. Decoration only (the UI's own
 * random generator, never the game's).
 */

const SKINS = [0xf2d3b8, 0xe8bf9a, 0xd29b72, 0xa86d4a, 0x7a4b30, 0xf5dcc6];
const HAIRS = [0x2b2018, 0x5a3a24, 0x8a5a32, 0xc9a25a, 0x9a9a9a, 0x1c1c1c, 0xb4532d];
const WARM = [0xc95d4a, 0x3f6f9a, 0x5d8a5a, 0x8a5a8a, 0xd9a03a, 0x4a4f63, 0x2f6f6a, 0xa8784a];
const SUMMER = [0xf2c14e, 0x6fc3b8, 0xe35d6a, 0xffffff, 0x8fb3e0, 0xf29b6a, 0xa8d18a];
const TROUSERS = [0x2f3a4f, 0x4a4f57, 0x6a5a4a, 0x2b2d31, 0x5a6f8a, 0xc9b48c];

type Accessory = 'none' | 'umbrella' | 'dog' | 'stroller' | 'baguette' | 'bag' | 'bike';

function pickOf<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length) % list.length] as T;
}

export interface Walker {
  view: Container;
  x: number;
  y: number;
  dir: 1 | -1;
  speed: number;
  update(dt: number, still: boolean): void;
}

export interface PassantContext {
  season: Season;
  weather: Weather;
  night: boolean;
  random: () => number;
}

/** A passer-by on the pavement. */
export function createPassant(context: PassantContext): Walker {
  const { random, season, weather } = context;
  const raining = weather === 'rain' || weather === 'snow';
  const view = new Container();
  const body = new Container();
  view.addChild(body);
  const skin = pickOf(SKINS, random);
  const hair = pickOf(HAIRS, random);
  const top = season === 'summer' ? pickOf(SUMMER, random) : pickOf(WARM, random);
  const bottom = pickOf(TROUSERS, random);
  const coat = season === 'winter' || (season === 'autumn' && random() < 0.6);
  const skirt = random() < 0.3;
  const child = random() < 0.12;
  const scale = child ? 0.7 : 0.92 + random() * 0.16;

  let accessory: Accessory = 'none';
  const roll = random();
  if (raining && weather === 'rain' && roll < 0.65) accessory = 'umbrella';
  else if (!child) {
    if (roll < 0.12) accessory = 'dog';
    else if (roll < 0.2) accessory = 'stroller';
    else if (roll < 0.32) accessory = 'baguette';
    else if (roll < 0.45) accessory = 'bag';
    else if (roll < 0.52 && !raining && !context.night) accessory = 'bike';
  }

  const leg = (x: number) => {
    const g = new Graphics()
      .rect(-1.6, 0, 3.2, 11)
      .fill(skirt && !coat ? skin : bottom)
      .rect(-1.8, 10, 4.2, 2.2)
      .fill(0x2b2522);
    g.position.set(x, -12);
    return g;
  };
  const arm = (x: number, color: number) => {
    const g = new Graphics()
      .roundRect(-1.3, 0, 2.6, 10, 1.2)
      .fill(color)
      .circle(0, 10.5, 1.5)
      .fill(skin);
    g.position.set(x, -23);
    return g;
  };
  const sleeve = season === 'summer' && !coat ? skin : coat ? shade(top, -0.15) : top;
  const legBack = leg(-1.2);
  const legFront = leg(1.4);
  const armBack = arm(-0.5, shade(sleeve, -0.12));
  const armFront = arm(0.8, sleeve);

  const torso = new Graphics();
  if (coat) {
    torso.roundRect(-5, -24, 10, 17, 3).fill(shade(top, -0.15));
    torso.rect(-0.4, -23, 0.8, 15).fill(shade(top, -0.3));
    if (season === 'winter') torso.roundRect(-4.5, -25.5, 9, 3, 1.5).fill(pickOf(SUMMER, random));
  } else {
    torso.roundRect(-4.5, -24, 9, 13, 3).fill(top);
    if (skirt) torso.poly([-5, -12, 5, -12, 6.5, -6, -6.5, -6]).fill(bottom);
  }
  const head = new Graphics();
  head.circle(0, -29.5, 5.6).fill(skin);
  const longHair = random() < 0.45;
  head
    .moveTo(0 + 5.9 * Math.cos(Math.PI * 1.02), -29.8 + 5.9 * Math.sin(Math.PI * 1.02))
    .arc(0, -29.8, 5.9, Math.PI * 1.02, Math.PI * 1.98)
    .fill(hair);
  if (longHair) head.roundRect(-6, -31, 4, 9, 2).fill(hair);
  if (season === 'winter' && random() < 0.5) {
    head
      .moveTo(0 + 6 * Math.cos(Math.PI), -31 + 6 * Math.sin(Math.PI))
      .arc(0, -31, 6, Math.PI, 0)
      .fill(pickOf(WARM, random));
    head.circle(0, -37.5, 1.8).fill(0xf2f2f2);
  }
  // Face, looking ahead (right; the view flips to walk left).
  head.circle(2.6, -30, 0.75).fill(0x2b2522);
  head.rect(1.5, -32.2, 2.2, 0.6).fill(shade(hair, -0.2));
  head.rect(2, -27.2, 1.8, 0.6).fill(0x9a4a3a);

  body.addChild(legBack, armBack, torso, legFront, head, armFront);
  body.scale.set(scale);

  let extra: Container | null = null;
  let dogLegs: Graphics[] = [];
  let pedal: Graphics | null = null;
  switch (accessory) {
    case 'umbrella': {
      const color = pickOf([0x2f6f6a, 0xb23d27, 0x3f6f9a, 0xf2c14e, 0x2b2d31], random);
      const umbrella = new Graphics()
        .rect(3.5, -46, 1, 22)
        .fill(0x3b3f46)
        .moveTo(4 + 13 * Math.cos(Math.PI), -44 + 13 * Math.sin(Math.PI))
        .arc(4, -44, 13, Math.PI, 0)
        .fill(color);
      body.addChild(umbrella);
      armFront.rotation = -2.4;
      break;
    }
    case 'baguette':
      body.addChild(new Graphics().roundRect(-7, -22, 16, 2.6, 1.3).fill(0xd9a35a));
      break;
    case 'bag':
      body.addChild(
        new Graphics()
          .roundRect(1.5, -14, 6, 7, 1)
          .fill(pickOf([0xf2f2ee, 0x8a5a32, 0x3f6f9a], random)),
      );
      break;
    case 'dog': {
      const dog = new Container();
      const fur = pickOf([0x8a5a32, 0x2b2522, 0xd9b98a, 0xf2f2ee], random);
      dogLegs = [-5, -2, 3, 6].map((x) => {
        const g = new Graphics().rect(-0.8, 0, 1.6, 5).fill(shade(fur, -0.2));
        g.position.set(x, -6);
        return g;
      });
      dog.addChild(...dogLegs);
      dog.addChild(
        new Graphics()
          .roundRect(-7, -10, 15, 6, 3)
          .fill(fur)
          .circle(9, -11, 3.4)
          .fill(fur)
          .circle(10.6, -11.5, 0.6)
          .fill(0x1c1c1c)
          .rect(-9, -10, 3, 1.4)
          .fill(fur),
      );
      dog.position.set(20, 0);
      const leash = new Graphics()
        .moveTo(9.5, -13)
        .lineTo(16, -10)
        .stroke({ color: 0x2b2522, width: 0.8 });
      extra = new Container();
      extra.addChild(leash, dog);
      break;
    }
    case 'stroller': {
      extra = new Container();
      extra.addChild(
        new Graphics()
          .moveTo(6, -18)
          .lineTo(13, -12)
          .stroke({ color: 0x2b2d31, width: 1.2 })
          .roundRect(12, -16, 14, 9, 4)
          .fill(pickOf([0x3f6f9a, 0x6f8a5a, 0x8a5a8a], random))
          .moveTo(19 + 7 * Math.cos(Math.PI), -15 + 7 * Math.sin(Math.PI))
          .arc(19, -15, 7, Math.PI, Math.PI * 1.6)
          .fill(0x4a4f57)
          .circle(14, -3, 3)
          .fill(0x2b2d31)
          .circle(24, -3, 3)
          .fill(0x2b2d31),
      );
      armFront.rotation = -1.1;
      break;
    }
    case 'bike': {
      legBack.visible = false;
      armBack.visible = false;
      const frame = pickOf([0xb23d27, 0x2f6f6a, 0x3f6f9a, 0x2b2d31], random);
      const bike = new Graphics()
        .circle(-9, -5, 5.5)
        .stroke({ color: 0x2b2d31, width: 1.4 })
        .circle(10, -5, 5.5)
        .stroke({ color: 0x2b2d31, width: 1.4 })
        .moveTo(-9, -5)
        .lineTo(-1, -6)
        .lineTo(7, -13)
        .lineTo(-3, -13)
        .lineTo(-9, -5)
        .moveTo(-1, -6)
        .lineTo(-3, -15)
        .moveTo(7, -13)
        .lineTo(10, -5)
        .moveTo(7, -13)
        .lineTo(6, -17)
        .stroke({ color: frame, width: 1.4 });
      body.addChildAt(bike, 0);
      body.y = -6;
      legFront.position.set(-1, -12);
      pedal = legFront;
      armFront.rotation = -1.2;
      break;
    }
  }
  if (extra) view.addChildAt(extra, 0);
  // A soft shadow on the pavement, under the walker and what they walk with.
  const shadowWidth =
    accessory === 'bike' ? 15 : accessory === 'dog' || accessory === 'stroller' ? 18 : 7;
  const shadowX = accessory === 'dog' || accessory === 'stroller' ? 9 : 0;
  view.addChildAt(
    new Graphics().ellipse(shadowX, 0.5, shadowWidth, 1.8).fill({ color: 0x000000, alpha: 0.16 }),
    0,
  );

  const speed = accessory === 'bike' ? 55 + random() * 20 : (child ? 22 : 16) + random() * 12;
  const walker: Walker = {
    view,
    x: 0,
    y: GROUND_Y + 6 + random() * (SIDEWALK - 12),
    dir: random() < 0.5 ? 1 : -1,
    speed,
    update(dt, still) {
      if (!still) walker.x += walker.dir * walker.speed * dt;
      phase += still ? 0 : dt * walker.speed * 0.32;
      const swing = Math.sin(phase);
      if (pedal) {
        pedal.rotation = swing * 0.8;
      } else {
        legBack.rotation = swing * 0.5;
        legFront.rotation = -swing * 0.5;
        body.y = -Math.abs(Math.cos(phase)) * 0.8;
      }
      if (accessory !== 'umbrella' && accessory !== 'stroller' && accessory !== 'bike') {
        armFront.rotation = swing * 0.45;
      }
      armBack.rotation = -swing * 0.45;
      dogLegs.forEach((g, i) => (g.rotation = Math.sin(phase * 1.8 + i * 1.6) * 0.6));
      view.position.set(walker.x, walker.y);
      view.scale.x = walker.dir;
    },
  };
  let phase = random() * Math.PI * 2;
  return walker;
}

const CAR_COLORS = [0xd9a03a, 0xb23d27, 0x3f6f9a, 0xf2f2ee, 0x4a4f57, 0x5d8a5a, 0x2b2d31, 0x9aa5b0];

export interface Car extends Walker {
  lights: Sprite;
  /** Red rear lights: on at dusk, brighter when braking. */
  tail: Sprite;
  length: number;
  /** Speed on a free road; `speed` drops behind a slower car. */
  cruise: number;
}

/** A car on the road, with headlights that light up in the evening. */
export function createCar(random: () => number, glow: Texture, dir: 1 | -1): Car {
  const view = new Container();
  const color = pickOf(CAR_COLORS, random);
  const small = random() < 0.5;
  const length = small ? 54 : 66;
  const g = new Graphics()
    .ellipse(length / 2, -1, length / 2 + 3, 3.5)
    .fill({ color: 0x000000, alpha: 0.2 })
    .roundRect(0, -16, length, 12, 4)
    .fill(color)
    .poly([10, -16, 18, -27, length - 20, -27, length - 10, -16])
    .fill(color)
    .poly([14, -16, 20, -24, length / 2 - 1, -24, length / 2 - 1, -16])
    .fill(0xa9c4d4)
    .poly([length / 2 + 1, -16, length / 2 + 1, -24, length - 21, -24, length - 14, -16])
    .fill(0xa9c4d4)
    .circle(12, -4, 5.5)
    .fill(0x1f2125)
    .circle(length - 12, -4, 5.5)
    .fill(0x1f2125)
    .circle(12, -4, 2.2)
    .fill(0xb8bcc2)
    .circle(length - 12, -4, 2.2)
    .fill(0xb8bcc2)
    .rect(length - 3, -13, 3, 3)
    .fill(0xf6e7b0)
    .rect(0, -13, 2.5, 3)
    .fill(0xc0392b);
  g.x = -length / 2;
  view.addChild(g);
  const lights = new Sprite(glow);
  lights.anchor.set(0.15, 0.5);
  lights.width = 90;
  lights.height = 26;
  lights.position.set(length / 2 - 4, -11);
  lights.tint = 0xfff1c4;
  lights.blendMode = 'add';
  view.addChild(lights);
  const tail = new Sprite(glow);
  tail.anchor.set(0.5);
  tail.width = 16;
  tail.height = 10;
  tail.position.set(-length / 2 + 1, -11.5);
  tail.tint = 0xff3b2f;
  tail.blendMode = 'add';
  view.addChild(tail);
  const cruise = 60 + random() * 40;
  const car: Car = {
    view,
    lights,
    tail,
    length,
    cruise,
    x: 0,
    // Two lanes: towards the right on the far lane, left on the near one.
    y: GROUND_Y + SIDEWALK + (dir === 1 ? ROAD * 0.5 : ROAD - 2),
    dir,
    speed: cruise,
    update(dt: number, still: boolean) {
      if (!still) car.x += car.dir * car.speed * dt;
      view.position.set(car.x, car.y);
      view.scale.x = car.dir;
    },
  };
  return car;
}

/** A bird flying across the sky, flapping its wings. */
export function createBird(random: () => number): Walker {
  const g = new Graphics()
    .moveTo(-5, 0)
    .quadraticCurveTo(-2.5, -3, 0, 0)
    .quadraticCurveTo(2.5, -3, 5, 0)
    .stroke({ color: 0x3b3f46, width: 1.3 });
  const view = new Container();
  view.addChild(g);
  let phase = random() * 6;
  const bird: Walker = {
    view,
    x: 0,
    y: 60 + random() * 180,
    dir: random() < 0.5 ? 1 : -1,
    speed: 40 + random() * 30,
    update(dt, still) {
      if (!still) bird.x += bird.dir * bird.speed * dt;
      phase += dt * 12;
      g.scale.y = 0.4 + Math.abs(Math.sin(phase));
      bird.y += Math.sin(phase * 0.2) * 0.1;
      view.position.set(bird.x, bird.y);
    },
  };
  return bird;
}

/** A worker on the scaffolding, hammering. */
export function createWorker(random: () => number): Walker {
  const view = new Container();
  const armHammer = new Graphics()
    .rect(-1, 0, 2, 9)
    .fill(0xf2a03a)
    .rect(-2, 8, 4, 3)
    .fill(0x5a5a5a);
  armHammer.position.set(2, -20);
  view.addChild(
    new Graphics()
      .rect(-2.5, -12, 2, 12)
      .fill(0x3f5a7a)
      .rect(0.5, -12, 2, 12)
      .fill(0x3f5a7a)
      .roundRect(-4.5, -23, 9, 12, 2)
      .fill(0xf2a03a)
      .circle(0, -27, 4.6)
      .fill(pickOf(SKINS, random))
      .moveTo(0 + 5 * Math.cos(Math.PI), -28 + 5 * Math.sin(Math.PI))
      .arc(0, -28, 5, Math.PI, 0)
      .fill(0xf6d36b),
    armHammer,
  );
  let phase = random() * 6;
  const worker: Walker = {
    view,
    x: 0,
    y: 0,
    dir: 1,
    speed: 0,
    update(dt, still) {
      if (still) return;
      phase += dt * 7;
      armHammer.rotation = -1.2 + Math.abs(Math.sin(phase)) * 1.4;
    },
  };
  return worker;
}
