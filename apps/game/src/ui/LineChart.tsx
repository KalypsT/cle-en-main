import { formatKilo } from '../texts.ts';

export interface Series {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
}

const WIDTH = 340;
const HEIGHT = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 46 };

/** A small line chart (wealth curve): one point per month, labels from the caller. */
export function LineChart({
  series,
  xLabels,
  title,
  formatTick = formatKilo,
  fromZero = true,
}: {
  series: Series[];
  xLabels: [string, string];
  title: string;
  /** Labels of the vertical axis (amounts in cents by default). */
  formatTick?: (value: number) => string;
  /** The vertical axis starts at 0 (amounts); false fits it to the values (a rate, an index). */
  fromZero?: boolean;
}) {
  const all = series.flatMap((s) => s.values);
  const count = Math.max(...series.map((s) => s.values.length));
  if (all.length === 0 || count < 2) return null;
  let min = fromZero ? Math.min(0, ...all) : Math.min(...all);
  let max = Math.max(...all);
  if (max === min) max = min + 1;
  const span = max - min;
  min -= span * 0.05;
  max += span * 0.05;
  const x = (i: number) => PAD.left + (i / (count - 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / (max - min)) * (HEIGHT - PAD.top - PAD.bottom);
  const ticks = [max - (max - min) * 0.05, (max + min) / 2, min + (max - min) * 0.05];
  return (
    <figure className="stack tight">
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e3d9c6" />
            <text x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="10" fill="#6e6658">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {min < 0 && max > 0 && (
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} stroke="#9a917f" />
        )}
        {series.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
          />
        ))}
        <text x={PAD.left} y={HEIGHT - 6} fontSize="10" fill="#6e6658">
          {xLabels[0]}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} fontSize="10" fill="#6e6658" textAnchor="end">
          {xLabels[1]}
        </text>
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
