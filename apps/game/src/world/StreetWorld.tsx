import { gameContent } from '@cle/content';
import type { Bubble, StreetBuilding } from '@cle/engine';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { format, t } from '../texts.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { FacadeShape } from './FacadeShape.tsx';
import { type FrameStats, type QualityLevel, StreetScene } from './StreetScene.ts';
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
  const value = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  return match?.[1] ? parseInt(match[1], 16) : 0x0f6f68;
}

function qualityLevel(choice: 'auto' | 'high' | 'economy'): QualityLevel | 'auto' {
  return choice === 'auto' ? 'auto' : choice === 'high' ? 2 : 0;
}

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const listener = () => setReduced(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  return reduced;
}

export function bubbleLabel(bubble: Bubble): string {
  return format(t.street.bubbles[bubble.kind], {
    percent: bubble.percent ?? 0,
    count: bubble.count ?? 0,
  });
}

/** Strikes of the bells at the hours of content/monde.json (discreet: not the whole hour). */
const BELL_STRIKES = 3;

const ALERT_BUBBLES = new Set(['hazard', 'incident', 'arrears']);
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
};

function buildingName(building: StreetBuilding): string {
  const names = t.street.buildingNames;
  if (building.home) return names.home;
  if (building.role === 'ordinary') return names[building.kind];
  return names[building.role];
}

export function StreetWorld({ active }: { active: boolean }) {
  const { state, settings, audio } = useGame();
  const nav = useNav();
  const cityId = gameContent.start.cityId;
  const neighbourhoods = gameContent.cities[cityId]?.neighbourhoods ?? [];
  const homeNeighbourhood =
    state.properties[0]?.property.neighbourhoodId ?? neighbourhoods[0]?.id ?? '';
  const [neighbourhoodId, setNeighbourhoodId] = useState(
    memory.neighbourhoodId ?? homeNeighbourhood,
  );
  const streets = useMemo(
    () => engine.streets(state, cityId, neighbourhoodId),
    [state, cityId, neighbourhoodId],
  );
  const ambience = useMemo(() => engine.ambience(state, cityId), [state, cityId]);
  const layout = useMemo(() => layoutStreets(streets, cityId), [streets, cityId]);
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<StreetScene | null>(null);
  const [size, setSize] = useState({ width: 390, height: 520 });
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const reducedMotion = useReducedMotion();
  const scale = sceneScale(size.height);
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

  useEffect(() => {
    // Next frame: the theme (and so the accent colour) is applied by App after this effect.
    const frame = requestAnimationFrame(() =>
      sceneRef.current?.setData({
        layout,
        hour: ambience.hour,
        moment: ambience.moment,
        season: ambience.season,
        christmas: ambience.christmas,
        accent: cssAccent(),
        shopNames: t.street.shops,
        forSaleText: t.street.forSaleSign,
        neighbourhoodId,
        seed: state.seed,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [layout, ambience, neighbourhoodId, state.seed, settings.theme]);

  // A new property (just bought): show its neighbourhood and centre it.
  const ownedIds = state.properties.map((owned) => owned.property.id).join(',');
  const [seenOwned, setSeenOwned] = useState(ownedIds);
  const [focus, setFocus] = useState<string | null>(null);
  if (ownedIds !== seenOwned) {
    setSeenOwned(ownedIds);
    const known = new Set(seenOwned.split(','));
    const fresh = state.properties.find((owned) => !known.has(owned.property.id));
    if (fresh) {
      setFocus(fresh.property.id);
      setNeighbourhoodId(fresh.property.neighbourhoodId);
    }
  }

  // Back to where the player was in this neighbourhood, or to his first property.
  const shown = useRef<{ neighbourhoodId: string | null; focus: string | null }>({
    neighbourhoodId: null,
    focus: null,
  });
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    // Hidden (another tab): wait until the street shows to place it.
    if (!scroll || !active || scroll.clientWidth === 0) return;
    if (shown.current.neighbourhoodId === neighbourhoodId && shown.current.focus === focus) return;
    const newFocus = focus !== shown.current.focus ? focus : null;
    shown.current = { neighbourhoodId, focus };
    memory.neighbourhoodId = neighbourhoodId;
    const buildings = layout.streets.flatMap((street) => street.buildings);
    const target = newFocus
      ? buildings.find((item) => item.building.propertyId === newFocus)
      : memory.scroll[neighbourhoodId] === undefined
        ? buildings.find((item) => item.building.role === 'owned')
        : undefined;
    scroll.scrollLeft = target
      ? Math.max(0, (target.x + target.spec.width / 2) * scale - size.width / 2)
      : (memory.scroll[neighbourhoodId] ?? 0);
  }, [neighbourhoodId, focus, layout, scale, size.width, active]);

  useEffect(() => {
    if (!settings.showFps || !active) return;
    const timer = setInterval(() => setStats(sceneRef.current?.stats() ?? null), 500);
    return () => clearInterval(timer);
  }, [settings.showFps, active]);

  const onScroll = () => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    memory.scroll[neighbourhoodId] = scroll.scrollLeft;
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
                        accent={building.role === 'owned' ? 'var(--teal)' : null}
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
                    <span className="street-mine" style={{ bottom: spec.groundHeight * scale + 4 }}>
                      {building.home ? t.street.myHome : t.street.myProperty}
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
