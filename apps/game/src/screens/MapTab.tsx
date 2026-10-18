import { gameContent } from '@cle/content';
import type { Listing } from '@cle/engine';
import { useMemo, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { cityName, format, formatEuros, formatKilo, propertyLabel, t } from '../texts.ts';
import { BottomSheet, Card, ListRow, ScreenHeader, Segmented } from '../ui/components.tsx';
import { KindThumb } from '../ui/Facade.tsx';
import { ListingRow } from './ListingsScreen.tsx';

type ColorBy = 'price' | 'rent' | 'plain';
type Point = readonly [number, number];

/** Shades from light to deep teal, for the five neighbourhoods ranked. */
const SHADES = ['#eef6f3', '#d6ece6', '#b9ddd4', '#93cabd', '#6db5a5'];
const MARGIN = 250;

/**
 * « Carte de la ville »: the neighbourhoods of the city (IGN outlines from
 * data/cities), its river, canal, railways and main roads, pins for the
 * listings and the player's properties.
 */
export function MapTab() {
  const { state } = useGame();
  const nav = useNav();
  const cityId = gameContent.start.cityId;
  const city = gameContent.cities[cityId];
  const [colorBy, setColorBy] = useState<ColorBy>('price');
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState<{ kind: 'listing' | 'owned'; id: string } | null>(null);

  const box = useMemo(() => {
    const points = (city?.neighbourhoods ?? []).flatMap((n) => n.outlines.flat());
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return {
      minX: Math.min(...xs) - MARGIN,
      maxX: Math.max(...xs) + MARGIN,
      minY: Math.min(...ys) - MARGIN,
      maxY: Math.max(...ys) + MARGIN,
    };
  }, [city]);

  if (!city) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  const unit = width / 360;
  const sx = (x: number) => x - box.minX;
  const sy = (y: number) => box.maxY - y;
  const path = (line: readonly Point[], close = false) =>
    `${line.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${Math.round(sx(x))} ${Math.round(sy(y))}`).join(' ')}${close ? 'z' : ''}`;

  const markets = engine.neighbourhoodMarkets(state, cityId);
  const metric = (id: string) => {
    const market = markets.find((m) => m.neighbourhoodId === id);
    return colorBy === 'rent' ? (market?.rentPerM2 ?? 0) : (market?.pricePerM2 ?? 0);
  };
  const ranked = [...city.neighbourhoods]
    .sort((a, b) => metric(a.id) - metric(b.id))
    .map((n) => n.id);
  const fill = (id: string) =>
    colorBy === 'plain' ? '#f7f3ea' : (SHADES[ranked.indexOf(id)] ?? SHADES[0]);

  const listings = state.listings.filter((listing) => listing.property.cityId === cityId);
  const counts = (id: string) => listings.filter((l) => l.property.neighbourhoodId === id).length;
  const selectedArea = city.neighbourhoods.find((n) => n.id === selected);
  const selectedMarket = markets.find((m) => m.neighbourhoodId === selected);
  const pinned = pin?.kind === 'listing' ? state.listings.find((l) => l.id === pin.id) : undefined;
  const pinnedOwned =
    pin?.kind === 'owned' ? state.properties.find((o) => o.property.id === pin.id) : undefined;

  const listingPins = listings
    .map((listing) => ({ listing, point: engine.mapPosition(state, listing.id) }))
    .filter(
      (entry): entry is { listing: Listing; point: { x: number; y: number } } =>
        entry.point !== null,
    );

  return (
    <div className="screen">
      <ScreenHeader title={format(t.map.heading, { city: cityName(cityId) })} />
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
      <svg
        className="map"
        viewBox={`0 0 ${Math.round(width)} ${Math.round(height)}`}
        role="img"
        aria-label={format(t.map.heading, { city: city.name })}
      >
        {city.neighbourhoods.map((n) => (
          <g key={n.id} onClick={() => setSelected(n.id)} style={{ cursor: 'pointer' }}>
            {n.outlines.map((outline, i) => (
              <path
                key={i}
                d={path(outline, true)}
                fill={fill(n.id)}
                stroke={selected === n.id ? '#0a5751' : '#a99f8a'}
                strokeWidth={(selected === n.id ? 3 : 1.2) * unit}
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
              strokeWidth={(road.importance <= 1 ? 3 : 2) * unit}
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
            strokeWidth={1.5 * unit}
            strokeDasharray={`${4 * unit} ${3 * unit}`}
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
              strokeWidth={(river.kind === 'river' ? 5 : 3) * unit}
              strokeLinecap="round"
              pointerEvents="none"
            />
          )),
        )}
        {city.neighbourhoods.map((n) => {
          const points = n.outlines.flat();
          const cx = points.reduce((sum, [x]) => sum + x, 0) / points.length;
          const cy = points.reduce((sum, [, y]) => sum + y, 0) / points.length;
          return (
            <text
              key={n.id}
              x={sx(cx)}
              y={sy(cy)}
              textAnchor="middle"
              fontSize={11 * unit}
              fontWeight={800}
              fill="#5c5546"
              stroke="#fffdf8"
              strokeWidth={3 * unit}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {n.name.toLocaleUpperCase('fr-FR')}
            </text>
          );
        })}
        {listingPins.map(({ listing, point }) => {
          const favorite = state.favorites.includes(listing.id);
          return (
            <g
              key={listing.id}
              className="map-pin"
              role="button"
              aria-label={format(t.map.pinLabel, {
                title: propertyLabel(listing.property),
                price: formatEuros(listing.askingPrice),
              })}
              onClick={() => setPin({ kind: 'listing', id: listing.id })}
            >
              <circle
                cx={sx(point.x)}
                cy={sy(point.y)}
                r={(favorite ? 9 : 7) * unit}
                fill={favorite ? '#a35a06' : '#0f6f68'}
                stroke="#fffdf8"
                strokeWidth={2 * unit}
              />
              {/* A wider invisible target for fingers. */}
              <circle cx={sx(point.x)} cy={sy(point.y)} r={16 * unit} fill="transparent" />
            </g>
          );
        })}
        {state.properties.map((owned) => {
          const point = engine.mapPosition(state, owned.property.id);
          if (!point) return null;
          const s = 9 * unit;
          return (
            <g
              key={owned.property.id}
              className="map-pin"
              role="button"
              aria-label={format(t.map.ownedLabel, { title: propertyLabel(owned.property) })}
              onClick={() => setPin({ kind: 'owned', id: owned.property.id })}
            >
              <path
                d={`M${sx(point.x) - s} ${sy(point.y)} L${sx(point.x)} ${sy(point.y) - s * 1.1} L${sx(point.x) + s} ${sy(point.y)} L${sx(point.x) + s * 0.75} ${sy(point.y)} L${sx(point.x) + s * 0.75} ${sy(point.y) + s} L${sx(point.x) - s * 0.75} ${sy(point.y) + s} L${sx(point.x) - s * 0.75} ${sy(point.y)}z`}
                fill="#24262b"
                stroke="#fffdf8"
                strokeWidth={2 * unit}
              />
              <circle cx={sx(point.x)} cy={sy(point.y)} r={16 * unit} fill="transparent" />
            </g>
          );
        })}
      </svg>
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
