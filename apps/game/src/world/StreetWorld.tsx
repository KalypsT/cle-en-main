import { gameContent } from '@cle/content';
import {
  type Bubble,
  type Cents,
  type StreetBuilding,
  toDayNumber,
  type Weather,
} from '@cle/engine';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { anecdoteText, format, formatSigned, t } from '../texts.ts';
import { avatarLook } from '../ui/Avatar.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { useReducedMotion } from '../ui/media.ts';
import { FacadeShape } from './FacadeShape.tsx';
import { type FrameStats, type QualityLevel, type SceneData, StreetScene } from './StreetScene.ts';
import {
  DESIGN_HEIGHT,
  GROUND_Y,
  type LaidBuilding,
  layoutStreets,
  sceneScale,
  streetAt,
} from './street-layout.ts';

/*
 * The « Rue » (docs/04, 4.5 and 4.6): the streets of a neighbourhood side by
 * side, slid with a finger. PixiJS draws the scene under a scrolling HTML
 * layer that carries the bubbles (they open the existing sheets) and one
 * button per building (it opens its cross-section).
 */

/** Neighbourhood and scroll position kept while the game runs. */
const memory: { neighbourhoodId: string | null; scroll: Record<string, number> } = {
  neighbourhoodId: null,
  scroll: {},
};

function cssAccent(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  return match?.[1] ? parseInt(match[1], 16) : 0x2b5c8a;
}

function qualityLevel(choice: 'auto' | 'high' | 'economy'): QualityLevel | 'auto' {
  return choice === 'auto' ? 'auto' : choice === 'high' ? 2 : 0;
}

export function bubbleLabel(bubble: Bubble): string {
  return format(t.street.bubbles[bubble.kind], {
    percent: bubble.percent ?? 0,
    count: bubble.count ?? 0,
  });
}

/** Strikes of the bells at the hours of content/monde.json (discreet: not the whole hour). */
const BELL_STRIKES = 3;

const ALERT_BUBBLES = new Set(['hazard', 'incident', 'arrears', 'event']);
const BUBBLE_ICONS: Record<Bubble['kind'], IconName> = {
  hazard: 'alert',
  incident: 'alert',
  arrears: 'alert',
  saleOffer: 'euro',
  applications: 'person',
  copro: 'calendar',
  works: 'wrench',
  sold: 'check',
  forSale: 'tag',
  toLet: 'key',
  compromis: 'assets',
  event: 'info',
  anecdote: 'person',
};

/** The player's flag on the roof of each of their buildings. */
function OwnerFlag() {
  return (
    <span className="street-flag" aria-hidden="true">
      <svg viewBox="0 0 22 30" width="22" height="30">
        <rect x="1" y="0" width="2" height="30" rx="1" fill="#5a4a3a" />
        <path className="street-flag-cloth" d="M3 2 H20 L15 8 L20 14 H3 Z" fill="var(--accent)" />
        <circle cx="9" cy="8" r="2.2" fill="#f0b45a" />
      </svg>
    </span>
  );
}

function buildingName(building: StreetBuilding): string {
  const names = t.street.buildingNames;
  if (building.home) return names.home;
  if (building.role === 'ordinary') return names[building.kind];
  return names[building.role];
}

/** The player's walk starts a little after the street shows its morning. */
const PLAYER_WALK_DELAY_MS = 1500;
/** Days a removal truck stays at the door of a tenant moving in. */
const MOVING_DAYS = 1;
/** How long the month's rents float above the let buildings. */
const RENTS_SHOWN_MS = 3200;

/**
 * `held`: a review or a scene is open over the game; the month's rents wait
 * for it to close before they rise above the buildings.
 */
export function StreetWorld({ active, held = false }: { active: boolean; held?: boolean }) {
  const { state, session, settings, audio, notify, ambience: shownAmbience } = useGame();
  const nav = useNav();
  const cityId = nav.cityId;
  const neighbourhoods = gameContent.cities[cityId]?.neighbourhoods ?? [];
  const homeNeighbourhood =
    state.properties.find((owned) => owned.property.cityId === cityId)?.property.neighbourhoodId ??
    neighbourhoods[0]?.id ??
    '';
  const [chosenNeighbourhoodId, setNeighbourhoodId] = useState(
    memory.neighbourhoodId ?? homeNeighbourhood,
  );
  // The remembered neighbourhood may belong to another city: start from the player's own.
  const neighbourhoodId = neighbourhoods.some((n) => n.id === chosenNeighbourhoodId)
    ? chosenNeighbourhoodId
    : homeNeighbourhood;
  // Recomputed only when what the street shows changes: not at every hour of the clock.
  const { clock, listings, properties, purchases, rivals, seed } = state;
  const day = toDayNumber(clock.date);
  // A new object at each render: kept while its values stay the same.
  const { hour, moment, season, christmas, bells } = shownAmbience.ambience;
  const ambience = useMemo(
    () => ({ ...shownAmbience.ambience }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hour, moment, season, christmas, bells, shownAmbience.ambience.weather],
  );
  const liveStreets = useMemo(
    () => engine.streets(state, cityId, neighbourhoodId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, properties, purchases, rivals, seed, day, ambience.moment, cityId, neighbourhoodId],
  );
  // At high speed, each street keeps the weather it had (rain would come and go every second).
  const [heldWeather, setHeldWeather] = useState<Record<string, Weather> | null>(null);
  if (shownAmbience.still && heldWeather === null)
    setHeldWeather(Object.fromEntries(liveStreets.map((street) => [street.id, street.weather])));
  else if (!shownAmbience.still && heldWeather !== null) setHeldWeather(null);
  const streets = useMemo(
    () =>
      heldWeather
        ? liveStreets.map((street) => ({
            ...street,
            weather: heldWeather[street.id] ?? street.weather,
          }))
        : liveStreets,
    [liveStreets, heldWeather],
  );
  const layout = useMemo(() => layoutStreets(streets, cityId), [streets, cityId]);
  const scrollKey = `${cityId}/${neighbourhoodId}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<StreetScene | null>(null);
  const [size, setSize] = useState({ width: 390, height: 520 });
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const reducedMotion = useReducedMotion();
  const scale = sceneScale(size.height, size.width);
  const offsetY = size.height - DESIGN_HEIGHT * scale;

  // Create the PixiJS scene once; it lives while the game runs.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new StreetScene(() => scrollRef.current?.scrollLeft ?? 0);
    sceneRef.current = scene;
    window.__streetStats = () => scene.stats();
    scene
      .init(host, qualityLevel(settings.quality), reducedMotion)
      .then((renderer) => {
        host.dataset.renderer = renderer;
      })
      .catch(() => setFailed(true));
    return () => {
      scene.destroy();
      sceneRef.current = null;
      delete window.__streetStats;
    };
    // The quality and the reduced motion are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => sceneRef.current?.setQuality(qualityLevel(settings.quality)), [settings.quality]);
  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion]);

  // Draw only while the street is on screen and the app in the foreground.
  useEffect(() => {
    const update = () => sceneRef.current?.setPaused(!active || document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [active]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      setSize({ width, height });
      sceneRef.current?.resize(width, height);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // A tenant moving in: the removal truck stays the day of the move and the next.
  const movingKey = properties
    .filter((owned) => owned.lease && day - owned.lease.startDay <= MOVING_DAYS)
    .map((owned) => owned.property.id)
    .join(',');
  const movingIn = useMemo(() => (movingKey ? movingKey.split(',') : []), [movingKey]);

  // The latest data, given to the scene at the next frame.
  const sceneData = useRef<Omit<SceneData, 'accent'> | null>(null);
  const sceneFrame = useRef<number | null>(null);
  useEffect(() => {
    // Hidden street: nothing to draw; the data is given again when it shows.
    if (!active) return;
    sceneData.current = {
      layout,
      hour: ambience.hour,
      moment: ambience.moment,
      season: ambience.season,
      christmas: ambience.christmas,
      shopNames: t.street.shops,
      forSaleText: t.street.forSaleSign,
      cityId,
      neighbourhoodId,
      seed: state.seed,
      movingIn,
    };
    // Next frame: the theme (and so the accent colour) is applied by App after this effect.
    // One frame at a time, never cancelled: when the hours go by faster than the frames, a
    // cancelled frame would leave the scene without its data.
    sceneFrame.current ??= requestAnimationFrame(() => {
      sceneFrame.current = null;
      if (sceneData.current)
        sceneRef.current?.setData({ ...sceneData.current, accent: cssAccent() });
    });
  }, [active, layout, ambience, cityId, neighbourhoodId, state.seed, settings.theme, movingIn]);
  useEffect(
    () => () => {
      if (sceneFrame.current !== null) cancelAnimationFrame(sceneFrame.current);
    },
    [],
  );

  // A new property (just bought): show its neighbourhood and centre it. A new object each
  // time, so that asking again for the same building centres it again.
  const ownedIds = state.properties.map((owned) => owned.property.id).join(',');
  const [seenOwned, setSeenOwned] = useState(ownedIds);
  const [focus, setFocus] = useState<{ id: string; smooth: boolean } | null>(null);
  if (ownedIds !== seenOwned) {
    setSeenOwned(ownedIds);
    const known = new Set(seenOwned.split(','));
    const fresh = state.properties.find((owned) => !known.has(owned.property.id));
    if (fresh) {
      setFocus({ id: fresh.property.id, smooth: false });
      setNeighbourhoodId(fresh.property.neighbourhoodId);
      if (fresh.property.cityId !== cityId) nav.setCityId(fresh.property.cityId);
    }
  }

  // The rents of the month rise above the let buildings (docs/04, 4.9), once the review
  // that comes with them is closed and the street on screen.
  const [pendingRents, setPendingRents] = useState<Record<string, Cents> | null>(null);
  const [shownRents, setShownRents] = useState<{
    key: number;
    amounts: Record<string, Cents>;
  } | null>(null);
  useEffect(
    () =>
      session.onEvents((events) => {
        const amounts: Record<string, Cents> = {};
        for (const event of events) {
          if (event.type !== 'monthlyStatement') continue;
          for (const line of event.lines) {
            if (line.kind === 'rentalIncome' && line.amount > 0)
              amounts[line.propertyId] = (amounts[line.propertyId] ?? 0) + line.amount;
          }
        }
        if (Object.keys(amounts).length > 0) setPendingRents(amounts);
      }),
    [session],
  );
  if (pendingRents && active && !held) {
    setShownRents({ key: (shownRents?.key ?? 0) + 1, amounts: pendingRents });
    setPendingRents(null);
  }
  useEffect(() => {
    if (!shownRents) return;
    const timer = setTimeout(() => setShownRents(null), RENTS_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [shownRents]);
  const rentOrder = shownRents ? Object.keys(shownRents.amounts) : [];

  // In the morning the player goes out: their avatar walks down the street once a day, out
  // of their own home's door when they live in the street (docs/05, 5.5).
  const walkedDay = useRef<number | null>(null);
  const avatar = state.player.avatar;
  const homeDoor = useMemo(() => {
    const home = layout.streets
      .flatMap((laid) => laid.buildings)
      .find((item) => item.building.home);
    return home ? home.x + home.spec.door.x + home.spec.door.w / 2 : null;
  }, [layout]);
  useEffect(() => {
    if (!active || ambience.moment !== 'morning' || shownAmbience.still) return;
    if (walkedDay.current === day) return;
    const timer = setTimeout(() => {
      walkedDay.current = day;
      sceneRef.current?.walkPlayer({ ...avatarLook(avatar), marker: cssAccent() }, homeDoor);
    }, PLAYER_WALK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, ambience.moment, shownAmbience.still, day, homeDoor, avatar]);

  // « Mes biens »: from one of the player's buildings of the city to the next (docs/04, 4.9).
  const ownedHere = useMemo(() => {
    const order = (gameContent.cities[cityId]?.neighbourhoods ?? []).map((n) => n.id);
    return properties
      .filter((owned) => owned.property.cityId === cityId)
      .map((owned) => owned.property)
      .sort(
        (a, b) =>
          order.indexOf(a.neighbourhoodId) - order.indexOf(b.neighbourhoodId) ||
          a.id.localeCompare(b.id),
      );
  }, [properties, cityId]);
  const nextOwned = useRef(0);
  const showNextOwned = () => {
    const target = ownedHere[nextOwned.current % ownedHere.length];
    if (!target) return;
    nextOwned.current += 1;
    const sameNeighbourhood = target.neighbourhoodId === neighbourhoodId;
    setNeighbourhoodId(target.neighbourhoodId);
    setFocus({ id: target.id, smooth: sameNeighbourhood && !reducedMotion });
  };

  // Back to where the player was in this neighbourhood, or to his first property.
  const shown = useRef<{
    neighbourhoodId: string | null;
    focus: { id: string; smooth: boolean } | null;
  }>({
    neighbourhoodId: null,
    focus: null,
  });
  // The scale and width the scroll position was set for: when they change (the view's real
  // size arrives, the phone turns), the same point of the street stays in the middle.
  const placed = useRef({ scale, width: size.width });
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    // Hidden (another tab): wait until the street shows to place it.
    if (!scroll || !active || scroll.clientWidth === 0) return;
    const before = placed.current;
    placed.current = { scale, width: size.width };
    if (shown.current.neighbourhoodId === scrollKey && shown.current.focus === focus) {
      if (before.scale !== scale || before.width !== size.width) {
        const middle = (scroll.scrollLeft + before.width / 2) / before.scale;
        scroll.scrollLeft = Math.max(0, middle * scale - size.width / 2);
      }
      return;
    }
    const newFocus = focus !== shown.current.focus ? focus : null;
    shown.current = { neighbourhoodId: scrollKey, focus };
    memory.neighbourhoodId = neighbourhoodId;
    const buildings = layout.streets.flatMap((street) => street.buildings);
    const target = newFocus
      ? buildings.find((item) => item.building.propertyId === newFocus.id)
      : memory.scroll[scrollKey] === undefined
        ? buildings.find((item) => item.building.role === 'owned')
        : undefined;
    const left = target
      ? Math.max(0, (target.x + target.spec.width / 2) * scale - size.width / 2)
      : (memory.scroll[scrollKey] ?? 0);
    if (newFocus?.smooth) scroll.scrollTo({ left, behavior: 'smooth' });
    else scroll.scrollLeft = left;
  }, [neighbourhoodId, scrollKey, focus, layout, scale, size.width, active]);

  useEffect(() => {
    if (!settings.showFps || !active) return;
    const timer = setInterval(() => setStats(sceneRef.current?.stats() ?? null), 500);
    return () => clearInterval(timer);
  }, [settings.showFps, active]);

  const onScroll = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    memory.scroll[scrollKey] = scroll.scrollLeft;
    setCurrent(streetAt(layout, (scroll.scrollLeft + size.width / 2) / scale));
  };

  const goStreet = (index: number) => {
    const target = layout.streets[index];
    scrollRef.current?.scrollTo({
      left: Math.max(0, target ? target.x * scale : 0),
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  };

  const open = (bubble: Bubble) => {
    const target = bubble.target;
    if (target.screen === 'property')
      nav.push({ name: 'property', id: target.id, tab: target.tab });
    else if (target.screen === 'anecdote') notify(anecdoteText(state, target.anecdote));
    else nav.push({ name: target.screen, id: target.id });
  };

  const street = layout.streets[current] ?? layout.streets[0];
  const weather = street?.street.weather ?? ambience.weather;
  const quay = street?.street.quay ?? false;
  const works = street?.buildings.some((item) => item.building.scaffolding) ?? false;

  // Ambiences only while the street is on screen.
  useEffect(() => {
    audio.setScene(
      active ? { moment: ambience.moment, weather, season: ambience.season, quay, works } : null,
    );
  }, [audio, active, ambience.moment, ambience.season, weather, quay, works]);
  useEffect(() => () => audio.setScene(null), [audio]);
  useEffect(() => {
    if (active && ambience.bells) audio.bells(BELL_STRIKES);
  }, [audio, active, ambience.bells, ambience.hour]);
  const top = (item: LaidBuilding) =>
    offsetY + (GROUND_Y - item.spec.wallHeight - item.spec.roof.height) * scale;

  return (
    <div
      ref={rootRef}
      className={`street-world${failed ? ' fallback' : ''}`}
      data-moment={ambience.moment}
      data-weather={weather}
      data-season={ambience.season}
      data-testid="street"
    >
      <div ref={hostRef} className="street-canvas" />
      <div
        ref={scrollRef}
        className="street-scroll"
        onScroll={onScroll}
        aria-label={format(t.street.scene, {
          street: street?.street.name ?? '',
          moment: t.street.moments[ambience.moment],
          weather: t.street.weathers[weather],
        })}
        role="region"
      >
        <div className="street-track" style={{ width: layout.width * scale }}>
          {layout.streets.map((laid) => (
            <span
              key={laid.street.id}
              className="street-snap"
              style={{ left: laid.x * scale }}
              aria-hidden="true"
            />
          ))}
          {layout.streets.flatMap((laid) =>
            laid.buildings.map((item) => {
              const { building, spec } = item;
              const height = (spec.wallHeight + spec.roof.height) * scale;
              return (
                <div
                  key={building.id}
                  className="street-building"
                  style={{
                    left: item.x * scale,
                    top: top(item),
                    width: spec.width * scale,
                    height,
                  }}
                >
                  {failed && (
                    <svg
                      className="street-fallback"
                      viewBox={`-6 ${-spec.wallHeight - spec.roof.height - 4} ${spec.width + 12} ${spec.wallHeight + spec.roof.height + 4}`}
                      aria-hidden="true"
                    >
                      <FacadeShape
                        spec={spec}
                        highlightFloor={building.highlightFloor}
                        accent={building.role === 'owned' ? 'var(--accent)' : null}
                        scaffolding={building.scaffolding}
                      />
                    </svg>
                  )}
                  <button
                    type="button"
                    className="street-hit"
                    aria-label={format(t.street.openSection, {
                      name: buildingName(building),
                      street: laid.street.name,
                    })}
                    data-testid={`building-${building.id}`}
                    onClick={() =>
                      nav.push({ name: 'section', neighbourhoodId, buildingId: building.id })
                    }
                  />
                  {building.role === 'owned' && (
                    <>
                      <OwnerFlag />
                      <span
                        className="street-mine"
                        style={{ bottom: spec.groundHeight * scale + 4 }}
                      >
                        <Icon name="key" size={12} />
                        {building.home ? t.street.myHome : t.street.myProperty}
                      </span>
                    </>
                  )}
                  {shownRents && building.propertyId && shownRents.amounts[building.propertyId] && (
                    <span
                      key={shownRents.key}
                      className="street-rent"
                      data-testid="street-rent"
                      style={{
                        animationDelay: `${rentOrder.indexOf(building.propertyId) * 0.15}s`,
                      }}
                    >
                      <span className="street-coin" aria-hidden="true">
                        €
                      </span>
                      {formatSigned(shownRents.amounts[building.propertyId] ?? 0)}
                    </span>
                  )}
                  {building.bubbles.length > 0 && (
                    <div className="street-bubbles">
                      {building.bubbles.map((bubble) => (
                        <button
                          key={bubble.kind}
                          type="button"
                          className={`street-bubble${ALERT_BUBBLES.has(bubble.kind) ? ' alert' : ''}${building.role === 'owned' ? ' mine' : ''}`}
                          data-testid={`bubble-${bubble.kind}`}
                          onClick={() => open(bubble)}
                        >
                          <Icon name={BUBBLE_ICONS[bubble.kind]} size={14} />
                          {bubbleLabel(bubble)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
      <div className="street-header">
        <label className="street-chip">
          <Icon name="map" size={16} />
          <span className="visually-hidden">{t.street.neighbourhood}</span>
          <select
            value={neighbourhoodId}
            onChange={(event) => setNeighbourhoodId(event.target.value)}
            data-testid="street-neighbourhood"
          >
            {neighbourhoods.map((neighbourhood) => (
              <option key={neighbourhood.id} value={neighbourhood.id}>
                {neighbourhood.name}
              </option>
            ))}
          </select>
        </label>
        <div className="street-chip street-name">
          <button
            type="button"
            aria-label={t.street.previousStreet}
            disabled={current === 0}
            onClick={() => goStreet(current - 1)}
          >
            <Icon name="back" size={16} />
          </button>
          <span data-testid="street-name">{street?.street.name}</span>
          <button
            type="button"
            aria-label={t.street.nextStreet}
            disabled={current >= layout.streets.length - 1}
            onClick={() => goStreet(current + 1)}
          >
            <Icon name="chevron" size={16} />
          </button>
        </div>
        {ownedHere.length > 0 && (
          <button
            type="button"
            className="street-chip street-owned"
            data-testid="street-next-owned"
            onClick={showNextOwned}
          >
            <Icon name="key" size={16} />
            {format(t.street.myProperties, { count: ownedHere.length })}
          </button>
        )}
      </div>
      {failed && <p className="street-fallback-note small">{t.street.fallback}</p>}
      {stats && settings.showFps && active && (
        <p className="street-fps tiny" data-testid="street-fps">
          {format(t.street.fps, {
            fps: stats.fps,
            p95: stats.p95,
            renderer: stats.renderer,
            quality: stats.quality,
          })}
        </p>
      )}
    </div>
  );
}

/** For the end-to-end test of the fluidity. */
declare global {
  interface Window {
    __streetStats?: () => FrameStats | null;
  }
}
