import { cssColor, type FacadeSpec } from './facade.ts';
import { barShapes, facadeShapes, paneShapes, type Shape } from './shapes.ts';

/** Daylight pane, and the highlighted flat's pane. */
const PANE = 0xd9e7ee;
const PANE_LIT = 0xf4cf5d;
const BARS = 0xf3ead8;

/** One shape; `fill` overrides its colour (a CSS variable for the player's colour). */
function SvgShape({ shape, fill }: { shape: Shape; fill?: string | undefined }) {
  const common = {
    fill: fill ?? (shape.fill === undefined ? 'none' : cssColor(shape.fill)),
    opacity: shape.alpha,
  };
  switch (shape.kind) {
    case 'rect':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.radius}
          stroke={shape.stroke === undefined ? undefined : cssColor(shape.stroke)}
          strokeWidth={shape.strokeWidth}
          {...common}
        />
      );
    case 'poly':
      return <polygon points={shape.points.join(' ')} {...common} />;
    case 'circle':
      return <circle cx={shape.x} cy={shape.y} r={shape.r} {...common} />;
  }
}

/**
 * A façade in SVG, from the same shapes as the street (src/world/shapes.ts).
 * Origin at the bottom left; the caller places and scales it.
 */
export function FacadeShape({
  spec,
  highlightFloor,
  accent,
  scaffolding = false,
}: {
  spec: FacadeSpec;
  highlightFloor: number | null;
  /** CSS colour of the player's properties, or null. */
  accent: string | null;
  scaffolding?: boolean;
}) {
  // The SVG draws the accent with a CSS variable: shapes use a marker colour.
  const marker = 0x0f6f68;
  const { base, front } = facadeShapes(spec, {
    accent: accent ? marker : null,
    highlightFloor,
    scaffolding,
    tarp: false,
    snow: false,
    flowers: false,
  });
  const draw = (shapes: Shape[], prefix: string) =>
    shapes.map((shape, i) => (
      <SvgShape
        key={`${prefix}-${i}`}
        shape={shape}
        fill={accent !== null && shape.fill === marker ? accent : undefined}
      />
    ));
  const panes = spec.windows.flatMap((win) => {
    const lit = highlightFloor !== null && win.floor === highlightFloor;
    return [...paneShapes(spec, win, lit ? PANE_LIT : PANE), ...barShapes(spec, win, BARS)];
  });
  return (
    <g>
      {draw(base, 'base')}
      {draw(panes, 'pane')}
      {draw(front, 'front')}
    </g>
  );
}
