import { gameContent } from '@cle/content';
import type { Listing } from '@cle/engine';
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { cityName, format, formatEuros, formatKilo, propertyLabel, t } from '../texts.ts';
import { BottomSheet, Card, ListRow, ScreenHeader, Segmented } from '../ui/components.tsx';
import { KindThumb } from '../ui/Facade.tsx';
import { ListingRow } from './ListingsScreen.tsx';
import {
  baseWidth,
  centerOn,
  clusterPins,
  fullView,
  type MapView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  viewSize,
  zoomAt,
} from './map-view.ts';

type ColorBy = 'price' | 'rent' | 'plain';
type Point = readonly [number, number];

/** Shades from light to deep teal, for the five neighbourhoods ranked. */
const SHADES = ['#eef6f3', '#d6ece6', '#b9ddd4', '#93cabd', '#6db5a5'];
const MARGIN = 250;
/** Pins closer than this on the screen (px) are shown as one cluster. */
const CLUSTER_PX = 40;
/** A finger that moved less than this (px) is a tap, not a drag. */
const TAP_SLOP = 6;
const ZOOM_STEP = 2;
const ANIMATION_MS = 200;

interface Remembered {
  view: MapView;
  colorBy: ColorBy;
}

/**
 * « Carte de la ville »: the neighbourhoods of the city (IGN outlines from
 * data/cities), its river, canal, railways and main roads, pins for the
 * listings and the player's properties. It zooms (pinch, wheel, double tap, buttons) and
 * pans; the pins keep their size on the screen and gather in clusters when crowded.
 */
export function MapTab() {
  const { state } = useGame();
  const nav = useNav();
  const cityId = nav.cityId;
  const city = gameContent.cities[cityId];
  const memoryKey = `map:${cityId}`;
  const remembered = nav.memory.get(memoryKey) as Remembered | undefined;
  const [colorBy, setColorBy] = useState<ColorBy>(remembered?.colorBy ?? 'price');
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState<{ kind: 'listing' | 'owned'; id: string } | null>(null);
  const [group, setGroup] = useState<Listing[] | null>(null);

  const box = useMemo(() => {
    const points = (city?.neighbourhoods ?? []).flatMap((n) => n.outlines.flat());
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const minX = Math.min(...xs) - MARGIN;
    const maxX = Math.max(...xs) + MARGIN;
    const minY = Math.min(...ys) - MARGIN;
    const maxY = Math.max(...ys) + MARGIN;
    return { minX, maxY, width: maxX - minX, height: maxY - minY };
  }, [city]);

  const [view, setView] = useState<MapView>(remembered?.view ?? fullView(box));
  const [frame, setFrame] = useState({ width: 360, height: 440 });
  const frameRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ box, frame });
  const animation = useRef(0);

  useEffect(() => {
    latest.current = { box, frame };
  }, [box, frame]);
  useEffect(() => {
    nav.memory.set(memoryKey, { view, colorBy } satisfies Remembered);
  }, [nav.memory, memoryKey, view, colorBy]);

  // The frame's size in pixels: the view's aspect follows it.
  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setFrame((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Moves to a view in a short glide (zoom steps and the « whole city » button). */
  const glideTo = useCallback((target: MapView) => {
    cancelAnimationFrame(animation.current);
    const startedAt = performance.now();
    let from: MapView | null = null;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ANIMATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setView((current) => {
        from ??= current;
        const start = from;
        return {
          cx: start.cx + (target.cx - start.cx) * eased,
          cy: start.cy + (target.cy - start.cy) * eased,
          zoom: start.zoom * (target.zoom / start.zoom) ** eased,
        };
      });
      if (progress < 1) animation.current = requestAnimationFrame(step);
    };
    animation.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const zoomBy = useCallback((factor: number, px: number, py: number) => {
    const { box: size, frame: shown } = latest.current;
    setView((current) => zoomAt(size, shown, current, factor, px, py));
  }, []);

  // The wheel zooms on the pointer (a listener of its own: React's are passive).
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.0025), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  // Fingers: one drags, two pinch. A tap that did not move reaches the pins.
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const lastTap = useRef(0);
  const relative = (event: ReactPointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(animation.current);
    fingers.current.set(event.pointerId, relative(event));
    if (fingers.current.size === 1) dragged.current = false;
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const before = fingers.current.get(event.pointerId);
    if (!before) return;
    const now = relative(event);
    const { box: size, frame: shown } = latest.current;
    if (fingers.current.size === 1) {
      if (!dragged.current && Math.hypot(now.x - before.x, now.y - before.y) < TAP_SLOP) return;
      if (!dragged.current) {
        dragged.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      fingers.current.set(event.pointerId, now);
      setView((current) => panBy(size, shown, current, now.x - before.x, now.y - before.y));
      return;
    }
    // Pinch: the zoom follows the distance between the fingers, the map their middle.
    const other = [...fingers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (!other) return;
    dragged.current = true;
    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);
    const was = distance(before, other);
    const is = distance(now, other);
    fingers.current.set(event.pointerId, now);
    if (was < 1 || is < 1) return;
    const middle = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
    const middleBefore = { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 };
    setView((current) =>
      panBy(
        size,
        shown,
        zoomAt(size, shown, current, is / was, middle.x, middle.y),
        middle.x - middleBefore.x,
        middle.y - middleBefore.y,
      ),
    );
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId);
    // A click follows the pointer-up of a drag; it must not open the pin under the finger.
    if (dragged.current) setTimeout(() => (dragged.current = false), 0);
  };
  const onDoubleTap = (event: ReactPointerEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - lastTap.current < 300 && !dragged.current && fingers.current.size === 0) {
      const { x, y } = relative(event);
      const { box: size, frame: shown } = latest.current;
      glideTo(zoomAt(size, shown, view, ZOOM_STEP, x, y));
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  if (!city) return null;
  const base = baseWidth(box, frame);
  const shown = viewSize(box, frame, view.zoom);
  /** One screen pixel, in map units: the pins and labels keep their size on the screen. */
  const pixel = shown.width / frame.width;
  const sx = (x: number) => x - box.minX;
  const sy = (y: number) => box.maxY - y;
  // Lines (roads, river…) grow slowly with the zoom; changing in steps keeps the map layer still.
  const lineUnit = base / 360 / Math.max(1, 2 ** Math.round(Math.log2(view.zoom))) ** 0.65;

  const markets = engine.neighbourhoodMarkets(state, cityId);
  const metric = (id: string) => {
    const market = markets.find((m) => m.neighbourhoodId === id);
    return colorBy === 'rent' ? (market?.rentPerM2 ?? 0) : (market?.pricePerM2 ?? 0);
  };
  const ranked = [...city.neighbourhoods]
    .sort((a, b) => metric(a.id) - metric(b.id))
    .map((n) => n.id);
  const rankKey = ranked.join(',');

  const listings = state.listings.filter((listing) => listing.property.cityId === cityId);
  const counts = (id: string) => listings.filter((l) => l.property.neighbourhoodId === id).length;
  const selectedArea = city.neighbourhoods.find((n) => n.id === selected);
  const selectedMarket = markets.find((m) => m.neighbourhoodId === selected);
  const pinned = pin?.kind === 'listing' ? state.listings.find((l) => l.id === pin.id) : undefined;
  const pinnedOwned =
    pin?.kind === 'owned' ? state.properties.find((o) => o.property.id === pin.id) : undefined;

  const listingPins = listings.flatMap((listing) => {
    const point = engine.mapPosition(state, listing.id);
    return point ? [{ item: listing, x: sx(point.x), y: sy(point.y) }] : [];
  });
  const clusters = clusterPins(listingPins, CLUSTER_PX * pixel);
  const left = view.cx - shown.width / 2;
  const top = view.cy - shown.height / 2;
  const visible = (x: number, y: number) =>
    x > left - 20 * pixel &&
    x < left + shown.width + 20 * pixel &&
    y > top - 20 * pixel &&
    y < top + shown.height + 20 * pixel;

  return (
    <div className="screen">
      <ScreenHeader
        title={format(t.map.heading, { city: cityName(cityId) })}
        action={
          <button
            type="button"
            className="link-button"
            onClick={() => nav.push({ name: 'cities' })}
          >
            {t.cities.switch}
          </button>
        }
      />
      <Segmented<ColorBy>
        label={t.map.colorBy}
        value={colorBy}
        onChange={setColorBy}
        options={[
          { value: 'price', label: t.map.byPrice },
          { value: 'rent', label: t.map.byYield },
          { value: 'plain', label: t.map.plain },
        ]}
      />
      <div
        ref={frameRef}
        className="map-frame"
        data-testid="map-frame"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          onPointerEnd(event);
          onDoubleTap(event);
        }}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          if (dragged.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
      >
        <svg
          className="map"
          viewBox={`${left} ${top} ${shown.width} ${shown.height}`}
          role="img"
          aria-label={format(t.map.heading, { city: city.name })}
          data-zoom={view.zoom.toFixed(2)}
        >
          <MapLayers
            city={city}
            box={box}
            colorBy={colorBy}
            rankKey={rankKey}
            selected={selected}
            lineUnit={lineUnit}
            onSelect={setSelected}
          />
          {city.neighbourhoods.map((n) => {
            const points = n.outlines.flat();
            const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
            const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
            if (!visible(sx(cx), sy(cy))) return null;
            return (
              <text
                key={n.id}
                x={sx(cx)}
                y={sy(cy)}
                textAnchor="middle"
                fontSize={11 * pixel}
                fontWeight={800}
                fill="#5c5546"
                stroke="#fffdf8"
                strokeWidth={3 * pixel}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {n.name.toLocaleUpperCase('fr-FR')}
              </text>
            );
          })}
          {clusters.map((cluster) => {
            if (!visible(cluster.x, cluster.y)) return null;
            const [first] = cluster.items;
            if (cluster.items.length === 1 && first) {
              const favorite = state.favorites.includes(first.id);
              return (
                <g
                  key={first.id}
                  className="map-pin"
                  role="button"
                  aria-label={format(t.map.pinLabel, {
                    title: propertyLabel(first.property),
                    price: formatEuros(first.askingPrice),
                  })}
                  onClick={() => setPin({ kind: 'listing', id: first.id })}
                >
                  <circle
                    cx={cluster.x}
                    cy={cluster.y}
                    r={(favorite ? 9 : 7) * pixel}
                    fill={favorite ? '#a35a06' : '#0f6f68'}
                    stroke="#fffdf8"
                    strokeWidth={2 * pixel}
                  />
                  {/* A wider invisible target for fingers. */}
                  <circle cx={cluster.x} cy={cluster.y} r={16 * pixel} fill="transparent" />
                </g>
              );
            }
            const favorite = cluster.items.some((l) => state.favorites.includes(l.id));
            return (
              <g
                key={`cluster-${cluster.items.map((l) => l.id).join()}`}
                className="map-pin"
                role="button"
                data-testid="map-cluster"
                aria-label={format(t.map.clusterLabel, { count: cluster.items.length })}
                onClick={() => {
                  if (view.zoom >= MAX_ZOOM - 0.01) {
                    setGroup(cluster.items);
                    return;
                  }
                  // Zoom in until the pins of the cluster come apart.
                  glideTo(centerOn(box, cluster.x, cluster.y, Math.min(MAX_ZOOM, view.zoom * 3)));
                }}
              >
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={14 * pixel}
                  fill={favorite ? '#a35a06' : '#0f6f68'}
                  stroke="#fffdf8"
                  strokeWidth={2 * pixel}
                />
                <text
                  x={cluster.x}
                  y={cluster.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12 * pixel}
                  fontWeight={800}
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  {cluster.items.length}
                </text>
              </g>
            );
          })}
          {state.properties.map((owned) => {
            const point = engine.mapPosition(state, owned.property.id);
            if (!point) return null;
            const x = sx(point.x);
            const y = sy(point.y);
            if (!visible(x, y)) return null;
            const s = 9 * pixel;
            return (
              <g
                key={owned.property.id}
                className="map-pin"
                role="button"
                aria-label={format(t.map.ownedLabel, { title: propertyLabel(owned.property) })}
                onClick={() => setPin({ kind: 'owned', id: owned.property.id })}
              >
                <path
                  d={`M${x - s} ${y} L${x} ${y - s * 1.1} L${x + s} ${y} L${x + s * 0.75} ${y} L${x + s * 0.75} ${y + s} L${x - s * 0.75} ${y + s} L${x - s * 0.75} ${y}z`}
                  fill="#24262b"
                  stroke="#fffdf8"
                  strokeWidth={2 * pixel}
                />
                <circle cx={x} cy={y} r={16 * pixel} fill="transparent" />
              </g>
            );
          })}
        </svg>
        <div className="map-controls">
          <button
            type="button"
            className="map-control"
            aria-label={t.map.zoomIn}
            disabled={view.zoom >= MAX_ZOOM}
            onClick={() =>
              glideTo(zoomAt(box, frame, view, ZOOM_STEP, frame.width / 2, frame.height / 2))
            }
          >
            +
          </button>
          <button
            type="button"
            className="map-control"
            aria-label={t.map.zoomOut}
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() =>
              glideTo(zoomAt(box, frame, view, 1 / ZOOM_STEP, frame.width / 2, frame.height / 2))
            }
          >
            −
          </button>
          <button
            type="button"
            className="map-control"
            aria-label={t.map.recenter}
            disabled={view.zoom <= MIN_ZOOM}
            onClick={() => glideTo(fullView(box))}
          >
            ⌂
          </button>
        </div>
      </div>
      <div className="legend">
        <span>
          <i style={{ background: '#0f6f68', borderRadius: '50%' }} />
          {t.map.legendListings}
        </span>
        <span>
          <i style={{ background: '#a35a06', borderRadius: '50%' }} />
          {t.map.legendFavorite}
        </span>
        <span>
          <i style={{ background: '#24262b' }} />
          {t.map.legendOwned}
        </span>
      </div>
      {selectedArea && (
        <Card
          title={format(t.map.neighbourhood, {
            name: selectedArea.name,
            count: counts(selectedArea.id),
          })}
        >
          {selectedMarket && (
            <p className="small muted">
              {format(t.map.medianPrice, {
                amount: format(t.common.perM2, { amount: formatEuros(selectedMarket.pricePerM2) }),
              })}
              {' · '}
              {format(t.map.medianRent, {
                amount: format(t.common.perM2, { amount: formatEuros(selectedMarket.rentPerM2) }),
              })}
            </p>
          )}
          <button
            type="button"
            className="button primary"
            onClick={() => nav.push({ name: 'listings', neighbourhoodId: selectedArea.id })}
          >
            {format(t.common.seeAll, { count: counts(selectedArea.id) })}
          </button>
        </Card>
      )}
      <button type="button" className="button block" onClick={() => nav.push({ name: 'listings' })}>
        {format(t.map.listingsCount, { count: listings.length })}
      </button>
      <p className="tiny muted">{t.map.attribution}</p>
      {pinned && (
        <BottomSheet title={formatKilo(pinned.askingPrice)} onClose={() => setPin(null)}>
          <ListingRow listing={pinned} view={engine.listingView(state, pinned.id)} />
        </BottomSheet>
      )}
      {group && (
        <BottomSheet
          title={format(t.map.groupTitle, { count: group.length })}
          onClose={() => setGroup(null)}
        >
          <div className="list">
            {group.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                view={engine.listingView(state, listing.id)}
              />
            ))}
          </div>
        </BottomSheet>
      )}
      {pinnedOwned && (
        <BottomSheet title={propertyLabel(pinnedOwned.property)} onClose={() => setPin(null)}>
          <ListRow
            thumb={<KindThumb property={pinnedOwned.property} owned />}
            title={propertyLabel(pinnedOwned.property)}
            onClick={() => {
              setPin(null);
              nav.push({ name: 'property', id: pinnedOwned.property.id });
            }}
          />
        </BottomSheet>
      )}
    </div>
  );
}

type City = NonNullable<(typeof gameContent.cities)[string]>;

/**
 * The map itself (neighbourhoods, parks, roads, rail, rivers): heavy to draw, and changed
 * only by the colours, the selection or a step of the zoom, not by every move of the view.
 */
const MapLayers = memo(function MapLayers({
  city,
  box,
  colorBy,
  rankKey,
  selected,
  lineUnit,
  onSelect,
}: {
  city: City;
  box: { minX: number; maxY: number };
  colorBy: ColorBy;
  rankKey: string;
  selected: string | null;
  lineUnit: number;
  onSelect: (id: string) => void;
}) {
  const ranked = rankKey.split(',');
  const fill = (id: string) =>
    colorBy === 'plain' ? '#f7f3ea' : (SHADES[ranked.indexOf(id)] ?? SHADES[0]);
  const coordinate = (value: number) => Math.round(value * 2) / 2;
  const path = (line: readonly Point[], close = false) =>
    `${line
      .map(
        ([x, y], i) =>
          `${i === 0 ? 'M' : 'L'}${coordinate(x - box.minX)} ${coordinate(box.maxY - y)}`,
      )
      .join(' ')}${close ? 'z' : ''}`;
  return (
    <>
      {city.neighbourhoods.map((n) => (
        <g key={n.id} onClick={() => onSelect(n.id)} style={{ cursor: 'pointer' }}>
          {n.outlines.map((outline, i) => (
            <path
              key={i}
              d={path(outline, true)}
              fill={fill(n.id)}
              stroke={selected === n.id ? '#0a5751' : '#a99f8a'}
              strokeWidth={(selected === n.id ? 3 : 1.2) * lineUnit}
            />
          ))}
        </g>
      ))}
      {city.map.parks.map((park, i) =>
        park.outlines.map((outline, j) => (
          <path
            key={`${i}-${j}`}
            d={path(outline, true)}
            fill="#cfe3c2"
            stroke="none"
            pointerEvents="none"
          />
        )),
      )}
      {city.map.roads.map((road, i) =>
        road.lines.map((line, j) => (
          <path
            key={`${i}-${j}`}
            d={path(line)}
            fill="none"
            stroke="#ffffff"
            strokeWidth={(road.importance <= 1 ? 3 : 2) * lineUnit}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )),
      )}
      {city.map.railways.map((line, i) => (
        <path
          key={i}
          d={path(line)}
          fill="none"
          stroke="#8e8778"
          strokeWidth={1.5 * lineUnit}
          strokeDasharray={`${4 * lineUnit} ${3 * lineUnit}`}
          pointerEvents="none"
        />
      ))}
      {city.map.rivers.map((river, i) =>
        river.lines.map((line, j) => (
          <path
            key={`${i}-${j}`}
            d={path(line)}
            fill="none"
            stroke="#8fbfdc"
            strokeWidth={(river.kind === 'river' ? 5 : 3) * lineUnit}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )),
      )}
    </>
  );
});
