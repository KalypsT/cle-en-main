import type { Property, SectionRoom, SectionUnit, SpaceKind } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { format, formatDecimal, spaceName, t, tradeName } from '../texts.ts';
import { Card, ScreenHeader } from '../ui/components.tsx';
import { bubbleLabel } from '../world/StreetWorld.tsx';

/*
 * Cross-section of a building (docs/04, 4.6; mock-ups 04 and 05): the flats
 * floor by floor, the player's rooms with their wear, and the artisans at
 * work. Touching a coloured dwelling opens its sheet. Drawn in SVG by code.
 */

const WIDTH = 360;
const FRAME = 10;
const STAIRS = 26;
const ROOF = 34;

/** Wall colour of each kind of room. */
const ROOM_COLORS: Record<SpaceKind, string> = {
  entry: '#efe3cf',
  living: '#f4e6cc',
  kitchen: '#dfe8d4',
  bedroom: '#e4dcef',
  bathroom: '#d6e6ef',
  wc: '#e8eef0',
  garden: '#cfe3c0',
};
const NEIGHBOUR_COLORS = ['#e9ddd0', '#dfe4dc', '#e6dde6', '#f0e4d2', '#dde3ea'];
const NEIGHBOUR_ROOMS: (SpaceKind | 'neighbour')[] = ['neighbour', 'living', 'bedroom', 'kitchen'];

/** A neighbour at home. */
function Resident({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 4} y={y - 12} width="8" height="12" rx="2" fill="#4a4f63" />
      <rect x={x - 5} y={y - 24} width="10" height="13" rx="3" fill="#c95d4a" />
      <circle cx={x} cy={y - 29} r="5" fill="#e8bf9a" />
      <path d={`M${x - 5.5} ${y - 30} a5.5 5.5 0 0 1 11 0 z`} fill="#5a3a24" />
    </g>
  );
}

function floorName(floor: number): string {
  if (floor === 0) return t.section.groundFloor;
  if (floor === 1) return t.section.firstFloor;
  return format(t.section.floor, { floor });
}

/** A few strokes of furniture for each kind of room (x, y: floor line; w: width). */
function Furniture({
  kind,
  x,
  y,
  w,
}: {
  kind: SpaceKind | 'neighbour';
  x: number;
  y: number;
  w: number;
}) {
  const cx = x + w / 2;
  switch (kind) {
    case 'bedroom':
      return (
        <g>
          <rect x={cx - 22} y={y - 14} width="44" height="12" rx="3" fill="#8fb0d6" />
          <rect x={cx - 24} y={y - 20} width="10" height="18" rx="3" fill="#f6efe2" />
          <rect x={cx - 22} y={y - 2} width="3" height="2" fill="#6b5a4a" />
        </g>
      );
    case 'living':
      return (
        <g>
          <rect x={cx - 24} y={y - 16} width="36" height="14" rx="5" fill="#c97a5a" />
          <rect x={cx - 26} y={y - 20} width="7" height="18" rx="3" fill="#b5694c" />
          <rect x={cx + 18} y={y - 34} width="2" height="32" fill="#6b5a4a" />
          <path d={`M${cx + 13} ${y - 34} h12 l-3 -7 h-6 z`} fill="#f2c14e" />
        </g>
      );
    case 'kitchen':
      return (
        <g>
          <rect
            x={x + 6}
            y={y - 18}
            width={Math.max(6, Math.min(36, w - 22))}
            height="16"
            fill="#f6efe2"
            stroke="#b9a98f"
          />
          <rect
            x={x + 8}
            y={y - 22}
            width={Math.max(4, Math.min(32, w - 26))}
            height="3"
            fill="#8a6a4a"
          />
          <rect
            x={x + w - 16}
            y={y - 34}
            width="11"
            height="32"
            rx="2"
            fill="#f2f4f5"
            stroke="#b9bfc4"
          />
        </g>
      );
    case 'bathroom':
      return (
        <g>
          <path
            d={`M${cx - 20} ${y - 14} h40 v6 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 z`}
            fill="#f7fbfc"
            stroke="#9fb4bf"
          />
          <rect x={cx + 14} y={y - 30} width="2" height="16" fill="#9fb4bf" />
        </g>
      );
    case 'wc':
      return (
        <g>
          <rect
            x={cx - 5}
            y={y - 22}
            width="10"
            height="9"
            rx="2"
            fill="#f7fbfc"
            stroke="#9fb4bf"
          />
          <path d={`M${cx - 7} ${y - 13} h14 l-2 11 h-10 z`} fill="#f7fbfc" stroke="#9fb4bf" />
        </g>
      );
    case 'entry':
      return (
        <g>
          <rect x={cx - 1} y={y - 34} width="2" height="32" fill="#6b5a4a" />
          <circle cx={cx - 5} cy={y - 28} r="4" fill="#5d8a5a" />
        </g>
      );
    case 'garden':
      return null;
    case 'neighbour':
      return (
        <g>
          <rect x={cx - 26} y={y - 14} width="30" height="12" rx="4" fill="#9a9fb0" />
          <rect x={cx + 10} y={y - 20} width="18" height="2" fill="#8a6a4a" />
          <rect x={cx + 12} y={y - 18} width="2" height="16" fill="#8a6a4a" />
          <rect x={cx + 24} y={y - 18} width="2" height="16" fill="#8a6a4a" />
          <rect
            x={cx - 6}
            y={y - 40}
            width="16"
            height="12"
            rx="1"
            fill="#c9d8e2"
            stroke="#8a7a62"
          />
        </g>
      );
  }
}

/** An artisan at work (or the player doing it himself), with a little dust. */
function Worker({ x, y }: { x: number; y: number }) {
  return (
    <g className="section-worker">
      <rect x={x - 4} y={y - 12} width="3" height="12" fill="#3f5a7a" />
      <rect x={x + 1} y={y - 12} width="3" height="12" fill="#3f5a7a" />
      <rect x={x - 5} y={y - 24} width="10" height="13" rx="2" fill="#f2a03a" />
      <circle cx={x} cy={y - 29} r="5" fill="#e8bf9a" />
      <path d={`M${x - 5.5} ${y - 30} a5.5 5.5 0 0 1 11 0 z`} fill="#f6d36b" />
      <g className="section-tool">
        <rect x={x + 5} y={y - 22} width="9" height="2.5" fill="#5a5a5a" />
      </g>
      <circle className="section-dust" cx={x + 16} cy={y - 6} r="3" fill="#d9d0c0" />
      <circle className="section-dust" cx={x + 20} cy={y - 10} r="2" fill="#d9d0c0" />
    </g>
  );
}

/** Wear of a room: stains and a crack when its state is poor. */
function Wear({
  x,
  y,
  w,
  h,
  state,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  state: number;
}) {
  if (state >= 3) return null;
  const strength = (3 - state) / 2;
  return (
    <g opacity={0.25 + strength * 0.45}>
      <ellipse cx={x + w * 0.3} cy={y + h * 0.3} rx={w * 0.12} ry={h * 0.12} fill="#a08a6a" />
      <path
        d={`M${x + w * 0.75} ${y + 4} l4 10 l-5 8 l3 9`}
        stroke="#6b5a45"
        strokeWidth="1.2"
        fill="none"
      />
      {state < 2 && (
        <rect x={x + w * 0.5} y={y + h * 0.55} width={w * 0.2} height={h * 0.18} fill="#c9b79a" />
      )}
    </g>
  );
}

function Rooms({
  unit,
  x,
  y,
  w,
  h,
}: {
  unit: SectionUnit;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  const total = unit.rooms.reduce((sum, room) => sum + Math.max(4, room.surface), 0);
  const widths = unit.rooms.map((room) => (Math.max(4, room.surface) / total) * w);
  const starts = widths.map((_, i) => x + widths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <g>
      {unit.rooms.map((room, i) => {
        const width = widths[i] ?? 0;
        const roomX = starts[i] ?? x;
        return (
          <g key={room.spaceId}>
            <rect x={roomX} y={y} width={width} height={h} fill={ROOM_COLORS[room.kind]} />
            <Wear x={roomX} y={y} w={width} h={h} state={room.state} />
            <rect x={roomX} y={y + h - 4} width={width} height="4" fill="#c9a77d" />
            <Furniture kind={room.kind} x={roomX} y={y + h - 4} w={width} />
            {room.renovating && <Worker x={roomX + width * 0.35} y={y + h - 4} />}
            <rect x={roomX + width - 1} y={y} width="2" height={h} fill="#8a7a62" />
          </g>
        );
      })}
    </g>
  );
}

export function SectionScreen({
  neighbourhoodId,
  buildingId,
}: {
  neighbourhoodId: string;
  buildingId: string;
}) {
  const { state } = useGame();
  const nav = useNav();
  const cityId = nav.cityId;
  const section = engine.section(state, cityId, neighbourhoodId, buildingId);
  const ambience = engine.ambience(state, cityId);
  const street = engine
    .streets(state, cityId, neighbourhoodId)
    .find((candidate) => candidate.buildings.some((b) => b.id === buildingId));
  const building = street?.buildings.find((b) => b.id === buildingId);

  if (!section || !building) {
    return (
      <div className="screen">
        <ScreenHeader title={t.street.buildingNames.apartment} onBack={nav.pop} />
        <p className="muted">{t.section.gone}</p>
      </div>
    );
  }

  const property: Property | undefined = section.units.find((u) => u.propertyId)?.propertyId
    ? (state.properties.find((o) => o.property.id === buildingId)?.property ??
      state.listings.find((l) => l.property.id === buildingId)?.property ??
      state.purchases.find((p) => p.property.id === buildingId)?.property)
    : undefined;
  const night = ambience.moment === 'night' || ambience.moment === 'evening';
  const floorHeight = section.kind === 'house' ? 96 : 84;
  const height = ROOF + section.floors * floorHeight + FRAME + 22;
  const inner = WIDTH - FRAME * 2;
  const columnsWithStairs = section.kind === 'apartment';
  // The player's (or the listed) dwelling gets more room than the neighbours'.
  const weight = (unit: SectionUnit) =>
    unit.role === 'neighbour' ? 1 : Math.max(1, Math.min(2.4, unit.rooms.length / 2));
  const unitX = (unit: SectionUnit) => {
    const row = section.units.filter((other) => other.floor === unit.floor);
    const stairs = columnsWithStairs && row.length > 1 ? STAIRS : 0;
    const total = row.reduce((sum, other) => sum + weight(other), 0);
    const free = inner - stairs * (row.length - 1);
    let x = FRAME;
    for (const other of row) {
      const w = (free * weight(other)) / total;
      if (other.id === unit.id) return { x, w };
      x += w + stairs;
    }
    return { x: FRAME, w: free };
  };
  const unitY = (floor: number) => ROOF + (section.floors - 1 - floor) * floorHeight;
  const title = building.home
    ? t.street.buildingNames.home
    : building.role === 'ordinary'
      ? t.street.buildingNames[building.kind]
      : t.street.buildingNames[building.role];

  const openUnit = (unit: SectionUnit) => {
    if (!unit.propertyId) return;
    if (unit.role === 'player') {
      nav.push({
        name: 'property',
        id: unit.propertyId,
        tab: section.worksPercent !== null ? 'rooms' : 'overview',
      });
    } else if (unit.role === 'listing') {
      const listing = state.listings.find((l) => l.property.id === unit.propertyId);
      if (listing) nav.push({ name: 'listing', id: listing.id });
    } else if (unit.role === 'purchase') {
      const purchase = state.purchases.find((p) => p.property.id === unit.propertyId);
      if (purchase) nav.push({ name: 'purchase', id: purchase.id });
    }
  };

  const mine = section.units.filter((unit) => unit.role !== 'neighbour');
  const rooms: { unit: SectionUnit; room: SectionRoom }[] = mine.flatMap((unit) =>
    unit.rooms.map((room) => ({ unit, room })),
  );
  const dwellingTrades = [...new Set(mine.flatMap((unit) => unit.works))];

  return (
    <div className="screen">
      <ScreenHeader
        title={title}
        onBack={nav.pop}
        action={
          section.worksPercent !== null ? (
            <span className="badge amber">
              {format(t.section.worksProgress, { percent: section.worksPercent })}
            </span>
          ) : undefined
        }
      />
      <p className="small muted section-subtitle">
        {format(t.section.subtitle, {
          street: street?.name ?? '',
          epoch: t.listing.epochs[section.epoch],
        })}
      </p>
      <div className={`section-frame${night ? ' night' : ''}`} data-testid="section">
        <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label={title}>
          <rect width={WIDTH} height={height} fill={night ? '#26304f' : '#dfeaf0'} />
          {/* Roof and floors. */}
          {section.kind === 'house' ? (
            <path d={`M2 ${ROOF + 2} L${WIDTH / 2} 2 L${WIDTH - 2} ${ROOF + 2}z`} fill="#9a5a43" />
          ) : (
            <rect x="4" y={ROOF - 12} width={WIDTH - 8} height="14" fill="#8e5a46" />
          )}
          <rect
            x={FRAME - 4}
            y={ROOF}
            width={inner + 8}
            height={section.floors * floorHeight + 4}
            fill="#5d4a3c"
          />
          {Array.from({ length: section.floors }, (_, floor) => {
            const y = unitY(floor);
            const units = section.units.filter((unit) => unit.floor === floor);
            const shop = units.length === 0 && floor === 0 && section.kind !== 'house';
            return (
              <g key={floor}>
                {columnsWithStairs &&
                  units.slice(0, -1).map((unit) => {
                    const { x, w } = unitX(unit);
                    return (
                      <g key={`stairs-${unit.id}`}>
                        <rect
                          x={x + w}
                          y={y + 2}
                          width={STAIRS}
                          height={floorHeight - 4}
                          fill="#a99b8b"
                        />
                        <path
                          d={`M${x + w + 4} ${y + floorHeight - 4} ${Array.from({ length: 5 }, () => `h4 v-${(floorHeight - 12) / 5}`).join(' ')}`}
                          stroke="#857767"
                          fill="none"
                        />
                      </g>
                    );
                  })}
                {shop && (
                  <g>
                    <rect
                      x={FRAME}
                      y={y + 2}
                      width={inner}
                      height={floorHeight - 4}
                      fill="#efe6d6"
                    />
                    <rect
                      x={FRAME + 20}
                      y={y + floorHeight - 30}
                      width={inner - 40}
                      height="26"
                      fill="#b98a5a"
                    />
                    <text x={WIDTH / 2} y={y + 24} textAnchor="middle" className="section-label">
                      {t.section.shop}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          {section.units.map((unit, index) => {
            const { x, w } = unitX(unit);
            const y = unitY(unit.floor) + 2;
            const h = floorHeight - 4;
            const ours = unit.role !== 'neighbour';
            const lit = night && unit.occupied;
            return (
              <g key={unit.id}>
                {ours && unit.rooms.length > 0 ? (
                  <Rooms unit={unit} x={x} y={y} w={w} h={h} />
                ) : (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={
                        unit.occupied
                          ? (NEIGHBOUR_COLORS[index % NEIGHBOUR_COLORS.length] ?? '#e9ddd0')
                          : '#cfc8bd'
                      }
                    />
                    <rect x={x} y={y + h - 4} width={w} height="4" fill="#c9a77d" />
                    {unit.occupied && (
                      <Furniture
                        kind={NEIGHBOUR_ROOMS[index % NEIGHBOUR_ROOMS.length] ?? 'neighbour'}
                        x={x}
                        y={y + h - 4}
                        w={w}
                      />
                    )}
                    {unit.occupied && index % 3 === 1 && (
                      <Resident x={x + w * 0.62} y={y + h - 4} />
                    )}
                  </g>
                )}
                {lit && <rect x={x} y={y} width={w} height={h} fill="#ffd27a" opacity="0.18" />}
                {night && !unit.occupied && (
                  <rect x={x} y={y} width={w} height={h} fill="#10152a" opacity="0.45" />
                )}
                {ours && (
                  <rect
                    x={x + 1.5}
                    y={y + 1.5}
                    width={w - 3}
                    height={h - 3}
                    fill="none"
                    className="section-mine"
                    strokeWidth="3"
                    strokeDasharray="6 4"
                  />
                )}
                {ours && (
                  <text x={x + 8} y={y + 16} className="section-tag">
                    {t.section.units[unit.role]}
                  </text>
                )}
              </g>
            );
          })}
          <rect
            x="0"
            y={height - 22}
            width={WIDTH}
            height="22"
            fill={night ? '#3b4a3a' : '#9cc28a'}
          />
          {section.garden && <circle cx="18" cy={height - 30} r="14" fill="#6aab58" />}
        </svg>
        {/* One button per dwelling, over the drawing. */}
        {section.units.map((unit) => {
          const { x, w } = unitX(unit);
          const y = unitY(unit.floor);
          const ours = unit.role !== 'neighbour';
          const style = {
            left: `${(x / WIDTH) * 100}%`,
            top: `${(y / height) * 100}%`,
            width: `${(w / WIDTH) * 100}%`,
            height: `${(floorHeight / height) * 100}%`,
          };
          return ours ? (
            <button
              key={unit.id}
              type="button"
              className="section-hit"
              style={style}
              data-testid={`unit-${unit.role}`}
              aria-label={format(t.section.openUnit, {
                name: t.section.units[unit.role],
                floor: floorName(unit.floor),
              })}
              onClick={() => openUnit(unit)}
            />
          ) : (
            <span
              key={unit.id}
              className="section-hit neighbour"
              style={style}
              role="img"
              aria-label={format(
                unit.occupied ? t.section.neighbourUnit : t.section.neighbourEmpty,
                {
                  floor: floorName(unit.floor),
                },
              )}
            />
          );
        })}
      </div>
      {mine.length === 0 ? (
        <p className="small muted">{t.section.ordinary}</p>
      ) : (
        <p className="tiny muted">{t.section.legend}</p>
      )}
      {building.bubbles.length > 0 && (
        <div className="row wrap">
          {building.bubbles.map((bubble) => (
            <span key={bubble.kind} className="badge">
              {bubbleLabel(bubble)}
            </span>
          ))}
        </div>
      )}
      {property && rooms.length > 0 && (
        <Card title={t.section.rooms}>
          <ul className="section-rooms">
            {rooms.map(({ room }) => (
              <li key={room.spaceId}>
                <span className="grow">{spaceName(property, room.spaceId)}</span>
                {room.renovating ? (
                  <span className="badge amber">
                    {format(t.section.renovating, { trade: tradeName(room.renovating) })}
                  </span>
                ) : (
                  <span className="small muted">
                    {format(t.section.roomState, { state: formatDecimal(room.state) })}
                  </span>
                )}
                <span className="state-bar" aria-hidden="true">
                  <span style={{ width: `${(room.state / 5) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          {dwellingTrades.length > 0 && (
            <p className="small">
              {format(t.section.dwellingWorks, {
                trades: dwellingTrades.map(tradeName).join(', '),
              })}
            </p>
          )}
          {mine[0] && (
            <button
              type="button"
              className="button primary"
              onClick={() => mine[0] && openUnit(mine[0])}
            >
              {section.worksPercent !== null && mine[0].role === 'player'
                ? t.section.seeWorks
                : t.section.openSheet}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}
