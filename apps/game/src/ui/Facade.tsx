import type { Property } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame } from '../game/context.tsx';
import { FacadeShape } from '../world/FacadeShape.tsx';
import { facadeSpec } from '../world/facade.ts';

/** Colours of the small list pictures (the full façades come from src/world/facade.ts). */
const WALLS = ['#e9d6a8', '#e2c48d', '#d9b98a', '#efe2c4', '#c98f6b', '#d8cbb3'];
const ROOFS = ['#9a5a43', '#7d4c3a', '#6a6f78'];

/** A stable small number from an id (decoration only, not a game draw). */
function pickIndex(id: string, salt: number, length: number): number {
  let hash = salt;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % length;
}

/**
 * The building of a listing or a property, as the street draws it (modular
 * façade of src/world/facade.ts), in daylight.
 */
export function Facade({
  property,
  owned = false,
  height = 150,
}: {
  property: Property;
  owned?: boolean;
  height?: number;
}) {
  const { state } = useGame();
  const place = engine.building(state, property.id);
  const building = place?.building;
  const spec = facadeSpec({
    id: property.id,
    cityId: property.cityId,
    kind: property.kind,
    epoch: property.epoch,
    floors: building?.floors ?? (property.kind === 'house' ? 2 : 4),
    shop: building?.shop ?? false,
    variant: building?.variant ?? pickIndex(property.id, 1, 1000) / 1000,
    facadeState: building?.facadeState ?? 3.5,
    newWindows: building?.newWindows ?? false,
    highlightFloor: building?.highlightFloor ?? null,
  });
  const viewHeight = 150;
  const ground = viewHeight - 14;
  const scale = Math.min(1, (ground - 14) / (spec.wallHeight + spec.roof.height));
  const x0 = (320 - spec.width * scale) / 2;
  return (
    <svg
      className="facade"
      viewBox={`0 0 320 ${viewHeight}`}
      style={{ maxHeight: height }}
      aria-hidden="true"
    >
      <rect width="320" height={viewHeight} fill="var(--sky, #dfe9ee)" />
      <rect y={ground} width="320" height="14" fill="var(--pavement, #cfc8b8)" />
      <circle cx="38" cy={ground - 34} r="20" fill="#b9d3b0" />
      <rect x="36" y={ground - 20} width="4" height="20" fill="#8b7355" />
      <g transform={`translate(${x0} ${ground}) scale(${scale})`}>
        <FacadeShape
          spec={spec}
          highlightFloor={building?.highlightFloor ?? null}
          accent={owned ? 'var(--teal)' : null}
          scaffolding={building?.scaffolding ?? false}
        />
      </g>
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
