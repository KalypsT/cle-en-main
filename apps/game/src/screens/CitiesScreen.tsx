import { gameContent } from '@cle/content';
import { NeighbourhoodPrices } from '../ui/MarketCurves.tsx';
import { useMemo, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  cityName,
  format,
  formatDecimal,
  formatDuration,
  formatEuros,
  formatMoney,
  formatPercent,
  t,
} from '../texts.ts';
import { Badge, BottomSheet, Card, KeyValues, ScreenHeader } from '../ui/components.tsx';

const MAP_WIDTH = 360;
const MAP_HEIGHT = 250;
const MAP_PADDING_X = 68;
const MAP_PADDING_Y = 44;

/** Pixel position of each city, from its longitude and latitude (flat projection). */
function projection() {
  const positions = Object.entries(gameContent.citiesRules.positions);
  const kx = Math.cos((47 * Math.PI) / 180);
  const points = positions.map(([id, p]) => ({ id, x: p.lon * kx, y: -p.lat }));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const scale = Math.min(
    (MAP_WIDTH - 2 * MAP_PADDING_X) / (Math.max(...xs) - minX || 1),
    (MAP_HEIGHT - 2 * MAP_PADDING_Y) / (Math.max(...ys) - minY || 1),
  );
  return Object.fromEntries(
    points.map((p) => [
      p.id,
      { x: MAP_PADDING_X + (p.x - minX) * scale, y: MAP_PADDING_Y + (p.y - minY) * scale },
    ]),
  );
}

/**
 * « Villes » (docs/03-systemes/08, « La carte »): the region with the player's base, the
 * trips between cities, and a sheet for each city (prices, rents, yield, trend, trip,
 * remote fee, local renown, properties owned) with the way to look at it or to move there.
 */
export function CitiesScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const sheets = engine.citySheets(state);
  const positions = useMemo(() => projection(), []);
  const [selectedId, setSelectedId] = useState(nav.cityId);
  const [moving, setMoving] = useState<string | null>(null);
  const base = sheets.find((sheet) => sheet.isBase);
  const selected = sheets.find((sheet) => sheet.cityId === selectedId) ?? sheets[0];
  const moveRules = gameContent.citiesRules.moving;

  const open = (cityId: string, route?: 'listings') => {
    nav.setCityId(cityId);
    if (route) nav.goTab('street', { name: route });
    else nav.goTab('street');
  };

  return (
    <div className="screen">
      <ScreenHeader title={t.cities.heading} onBack={nav.pop} />
      <p className="small muted">{t.cities.intro}</p>

      <svg
        className="region-map"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="group"
        aria-label={t.cities.mapLabel}
        data-testid="region-map"
      >
        {gameContent.citiesRules.trips.map((trip) => {
          const a = positions[trip.a];
          const b = positions[trip.b];
          if (!a || !b) return null;
          const fromBase = base && (trip.a === base.cityId || trip.b === base.cityId);
          return (
            <g key={`${trip.a}-${trip.b}`}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={fromBase ? 'region-road base' : 'region-road'}
              />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} className="region-minutes">
                {formatDuration(trip.oneWayMinutes)}
              </text>
            </g>
          );
        })}
        {sheets.map((sheet) => {
          const p = positions[sheet.cityId];
          if (!p) return null;
          const active = sheet.cityId === selected?.cityId;
          return (
            <g
              key={sheet.cityId}
              className={`region-city${active ? ' selected' : ''}${sheet.isBase ? ' base' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={sheet.name}
              aria-pressed={active}
              data-testid={`region-city-${sheet.cityId}`}
              onClick={() => setSelectedId(sheet.cityId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedId(sheet.cityId);
              }}
            >
              <rect x={p.x - 40} y={p.y - 18} width={80} height={52} className="region-hit" />
              <circle cx={p.x} cy={p.y} r={sheet.isBase ? 11 : 8} />
              {sheet.propertiesOwned > 0 && (
                <circle cx={p.x + 11} cy={p.y - 9} r={5} className="owned-dot" />
              )}
              <text x={p.x} y={p.y + 24} textAnchor="middle">
                {sheet.name}
              </text>
            </g>
          );
        })}
      </svg>

      {selected && (
        <Card
          title={selected.name}
          aside={selected.isBase ? <Badge tone="accent">{t.cities.base}</Badge> : undefined}
          testId={`city-sheet-${selected.cityId}`}
        >
          <p className="small">{selected.profile}</p>
          <p className="tiny muted">{selected.decor}</p>
          <KeyValues
            rows={[
              {
                label: t.cities.trip.replace('{base}', base ? cityName(base.cityId) : ''),
                value: selected.isBase
                  ? t.cities.noTrip
                  : format(t.cities.tripValue, {
                      duration: formatDuration(selected.trip.minutes),
                      cost: formatMoney(selected.trip.cost),
                    }),
              },
              {
                label: t.cities.apartmentPrice,
                value: format(t.cities.perM2, {
                  amount: formatEuros(selected.apartmentPricePerM2),
                }),
              },
              {
                label: t.cities.housePrice,
                value: format(t.cities.perM2, { amount: formatEuros(selected.housePricePerM2) }),
              },
              {
                label: t.cities.rent,
                value: format(t.cities.perM2, { amount: formatMoney(selected.rentPerM2) }),
              },
              {
                label: t.cities.yield,
                value: formatPercent(Math.round(selected.grossYieldPercent * 10) / 10),
              },
              {
                label: t.cities.trend,
                value: format(t.cities.perYear, { percent: formatDecimal(selected.trendPercent) }),
              },
              {
                label: t.cities.sales,
                value: format(t.cities.salesValue, {
                  sales: selected.salesPerYear,
                  listings: selected.listingsOnline,
                }),
              },
              {
                label: t.cities.remote,
                value: selected.isBase
                  ? t.cities.remoteNone
                  : format(t.cities.remoteValue, {
                      amount: formatMoney(selected.remoteFeePerProperty),
                    }),
              },
              {
                label: t.cities.renown,
                value: format(t.cities.renownValue, { value: Math.round(selected.renown) }),
              },
              {
                label: t.cities.owned,
                value: format(t.cities.ownedValue, { count: selected.propertiesOwned }),
              },
              {
                label: t.cities.artisans,
                value: format(t.cities.artisansValue, { count: selected.artisansKnown }),
              },
              {
                label: t.cities.worksIndex,
                value: format(t.cities.worksIndexValue, {
                  percent: formatPercent(Math.round(selected.worksCostIndex * 100)),
                }),
              },
            ]}
          />
          <p className="tiny muted">{t.cities.renownHint}</p>
          <div className="stack">
            <button type="button" className="button" onClick={() => open(selected.cityId)}>
              {t.cities.seeStreet}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => open(selected.cityId, 'listings')}
            >
              {t.cities.seeListings}
            </button>
            {!selected.isBase && (
              <button
                type="button"
                className="button primary"
                data-testid="move-here"
                onClick={() => setMoving(selected.cityId)}
              >
                {t.cities.move}
              </button>
            )}
          </div>
        </Card>
      )}
      {selected && <NeighbourhoodPrices cityId={selected.cityId} title={t.cities.prices} />}
      <p className="tiny muted">{t.cities.attribution}</p>

      {moving && (
        <BottomSheet
          title={format(t.cities.moveTitle, { city: cityName(moving) })}
          onClose={() => setMoving(null)}
        >
          <p>
            {format(t.cities.moveText, {
              city: cityName(moving),
              rent: formatMoney(sheets.find((sheet) => sheet.cityId === moving)?.homeRent ?? 0),
              cost: formatEuros(moveRules.costEuros * 100),
              previous: cityName(state.player.baseCityId),
              months: Math.round(moveRules.cooldownDays / 30),
            })}
          </p>
          <div className="stack">
            <button
              type="button"
              className="button primary"
              data-testid="move-confirm"
              onClick={() => {
                const city = moving;
                setMoving(null);
                if (
                  act(
                    { type: 'city/move', cityId: city },
                    format(t.cities.moved, { city: cityName(city) }),
                  )
                ) {
                  nav.setCityId(city);
                }
              }}
            >
              {t.cities.moveConfirm}
            </button>
            <button type="button" className="button" onClick={() => setMoving(null)}>
              {t.cities.moveCancel}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
