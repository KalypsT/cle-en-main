import { gameContent } from '@cle/content';
import { toDayNumber } from '@cle/engine';
import { useGame } from '../game/context.tsx';
import { cityName, format, formatDay, formatPercent, t } from '../texts.ts';
import { Card } from './components.tsx';
import { LineChart } from './LineChart.tsx';

/** One colour per neighbourhood (up to eight in a city). */
const COLORS = [
  '#0f6f68',
  '#a35a06',
  '#5b4a8a',
  '#a33a2a',
  '#3f7d3a',
  '#2f5f8a',
  '#8a7f6a',
  '#b0407a',
];

/** The market rate on the 1st of each month (docs/04, « Statistiques »). */
export function RateCurve() {
  const { state } = useGame();
  const points = state.marketHistory;
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  return (
    <Card title={t.statistics.rate} testId="rate-curve">
      <LineChart
        title={t.statistics.rate}
        xLabels={[formatDay(toDayNumber(first.date)), formatDay(toDayNumber(last.date))]}
        formatTick={(value) => formatPercent(Math.round(value * 100) / 100)}
        fromZero={false}
        series={[
          { label: t.statistics.rate, color: '#0f6f68', values: points.map((p) => p.ratePercent) },
        ]}
      />
    </Card>
  );
}

/** Each neighbourhood's prices, index 100 on the first point kept. */
export function NeighbourhoodPrices({ cityId, title }: { cityId: string; title?: string }) {
  const { state } = useGame();
  const points = state.marketHistory.filter((point) => point.priceIndex[cityId]);
  const first = points[0];
  const last = points.at(-1);
  const neighbourhoods = gameContent.cities[cityId]?.neighbourhoods ?? [];
  if (!first || !last || points.length < 2) return null;
  return (
    <Card
      title={title ?? format(t.statistics.prices, { city: cityName(cityId) })}
      testId="neighbourhood-prices"
    >
      <LineChart
        title={format(t.statistics.prices, { city: cityName(cityId) })}
        xLabels={[formatDay(toDayNumber(first.date)), formatDay(toDayNumber(last.date))]}
        formatTick={(value) => String(Math.round(value))}
        fromZero={false}
        series={neighbourhoods.map((neighbourhood, i) => {
          const base = first.priceIndex[cityId]?.[neighbourhood.id] ?? 1;
          return {
            label: neighbourhood.name,
            color: COLORS[i % COLORS.length] ?? '#0f6f68',
            values: points.map(
              (point) => ((point.priceIndex[cityId]?.[neighbourhood.id] ?? base) / base) * 100,
            ),
          };
        })}
      />
      <p className="tiny muted">{t.statistics.pricesHint}</p>
    </Card>
  );
}
