import type { Property } from '@cle/engine';

/**
 * Simple façades drawn by code (docs/05, section 5.3), until the modular
 * façades of milestone 5: Dole's golden limestone, soft shutters.
 */
const WALLS = ['#e9d6a8', '#e2c48d', '#d9b98a', '#efe2c4', '#c98f6b', '#d8cbb3'];
const SHUTTERS = ['#7fa6a0', '#a7b8d6', '#c9897a', '#9cb48a', '#d6b26e', '#8e9aa6'];
const ROOFS = ['#9a5a43', '#7d4c3a', '#6a6f78'];

/** A stable small number from an id (decoration only, not a game draw). */
function pickIndex(id: string, salt: number, length: number): number {
  let hash = salt;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % length;
}

export function Facade({
  property,
  owned = false,
  height = 150,
}: {
  property: Property;
  owned?: boolean;
  height?: number;
}) {
  const wall = WALLS[pickIndex(property.id, 1, WALLS.length)];
  const shutter = owned ? '#0f6f68' : SHUTTERS[pickIndex(property.id, 2, SHUTTERS.length)];
  const roof = ROOFS[pickIndex(property.id, 3, ROOFS.length)];
  const house = property.kind === 'house';
  const floors = house
    ? 2
    : property.kind === 'building'
      ? 4
      : Math.max(3, Math.min(5, (property.floor ?? 1) + 2));
  const columns = house ? 3 : 4;
  const width = house ? 170 : 150;
  const x0 = (320 - width) / 2;
  const floorHeight = 30;
  const top = 150 - 18 - floors * floorHeight;
  const highlighted =
    property.kind === 'apartment' ? Math.min(floors - 1, property.floor ?? 0) : -1;
  return (
    <svg className="facade" viewBox="0 0 320 150" style={{ maxHeight: height }} aria-hidden="true">
      <rect width="320" height="150" fill="#dfe9ee" />
      <rect y="132" width="320" height="18" fill="#cfd6c4" />
      <circle cx="272" cy="96" r="22" fill="#b9d3b0" />
      <rect x="270" y="110" width="4" height="24" fill="#8b7355" />
      {house ? (
        <path
          d={`M${x0 - 10} ${top + 2} L160 ${top - 34} L${x0 + width + 10} ${top + 2}z`}
          fill={roof}
        />
      ) : (
        <rect x={x0 - 6} y={top - 8} width={width + 12} height="9" rx="2" fill={roof} />
      )}
      <rect x={x0} y={top} width={width} height={132 - top} fill={wall} />
      {Array.from({ length: floors }, (_, row) =>
        Array.from({ length: columns }, (_, column) => {
          const level = floors - 1 - row;
          const x = x0 + 14 + column * ((width - 28) / columns) + 4;
          const y = top + 8 + row * floorHeight;
          const door = level === 0 && column === Math.floor(columns / 2);
          if (door) {
            return (
              <rect
                key={`${row}-${column}`}
                x={x + 2}
                y={y + 2}
                width="18"
                height={floorHeight - 4 + 2}
                rx="2"
                fill="#3b3f46"
              />
            );
          }
          const lit = level === highlighted;
          return (
            <g key={`${row}-${column}`}>
              <rect x={x - 5} y={y + 2} width="4" height="18" fill={shutter} />
              <rect x={x + 22} y={y + 2} width="4" height="18" fill={shutter} />
              <rect
                x={x}
                y={y}
                width="21"
                height="20"
                rx="2"
                fill={lit ? '#f4cf5d' : '#eef4f7'}
                stroke={lit ? '#0f6f68' : '#8b7a62'}
                strokeWidth={lit ? 2.5 : 1.2}
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** Small picture for list rows. */
export function KindThumb({ property, owned = false }: { property: Property; owned?: boolean }) {
  const wall = owned ? '#0f6f68' : WALLS[pickIndex(property.id, 1, WALLS.length)];
  const roof = ROOFS[pickIndex(property.id, 3, ROOFS.length)];
  if (property.kind === 'house') {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M5 19 L20 7 L35 19z" fill={roof} />
        <rect x="9" y="18" width="22" height="16" fill={wall} />
        <rect x="13" y="22" width="6" height="5" fill="#f4e7c6" />
        <rect x="22" y="24" width="5" height="10" fill="#3b3f46" />
      </svg>
    );
  }
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="9" y="5" width="22" height="31" fill={wall} />
      <rect x="8" y="4" width="24" height="3" fill={roof} />
      {[9, 16, 23].map((y) =>
        [13, 22].map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="5" height="4" fill="#f4e7c6" />
        )),
      )}
      <rect x="17.5" y="30" width="5" height="6" fill="#3b3f46" />
    </svg>
  );
}
