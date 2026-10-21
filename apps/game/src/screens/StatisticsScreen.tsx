import type { Stat } from '@cle/content';
import { toDayNumber } from '@cle/engine';
import { useGame, useNav } from '../game/context.tsx';
import { format, formatDay, formatDecimal, formatEuros, t } from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader } from '../ui/components.tsx';
import { NeighbourhoodPrices, RateCurve } from '../ui/MarketCurves.tsx';
import { LineChart, type Series } from '../ui/LineChart.tsx';
import { statLabel } from './ProgressionScreen.tsx';

const COUNTERS: readonly Stat[] = [
  'purchases',
  'bargainPurchases',
  'sales',
  'salesWithGain',
  'worksDone',
  'dpeClassesGained',
  'leasesSigned',
  'incidentsRepaired',
  'diyTasks',
  'bankMeetings',
  'loansRepaid',
  'bestPositiveStreak',
  'quietYears',
  'challengesWon',
  'eventChoices',
  'anecdotes',
  'forcedSales',
];

/** « Statistiques » (docs/02, 2.10): long-term curves and records. */
export function StatisticsScreen() {
  const { state } = useGame();
  const nav = useNav();
  const { history, progress } = state;
  const first = history[0];
  const last = history.at(-1);
  const charts: { title: string; series: Series[]; formatTick?: (value: number) => string }[] = [
    {
      title: t.statistics.netWorth,
      series: [
        { label: t.statistics.netWorth, color: '#0f6f68', values: history.map((p) => p.netWorth) },
      ],
    },
    {
      title: t.statistics.rents,
      series: [
        { label: t.statistics.rents, color: '#3f7d3a', values: history.map((p) => p.monthlyRent) },
      ],
      formatTick: (value) => formatEuros(value),
    },
    {
      title: t.statistics.debt,
      series: [{ label: t.statistics.debt, color: '#a33a2a', values: history.map((p) => p.debt) }],
    },
    {
      title: t.statistics.cashFlow,
      series: [
        { label: t.statistics.cashFlow, color: '#a35a06', values: history.map((p) => p.cashFlow) },
      ],
      formatTick: (value) => formatEuros(value),
    },
    {
      title: t.statistics.reputation,
      series: [
        {
          label: t.statistics.reputation,
          color: '#5b4a8a',
          values: history.map((p) => p.reputation),
        },
      ],
      formatTick: (value) => formatDecimal(value),
    },
  ];
  return (
    <div className="screen">
      <ScreenHeader title={t.statistics.heading} onBack={nav.pop} />
      {first && last && history.length >= 2 ? (
        charts.map((chart) => (
          <Card key={chart.title} title={chart.title}>
            <LineChart
              title={format(t.statistics.chartLabel, { label: chart.title })}
              xLabels={[formatDay(toDayNumber(first.date)), formatDay(toDayNumber(last.date))]}
              series={chart.series}
              {...(chart.formatTick ? { formatTick: chart.formatTick } : {})}
            />
          </Card>
        ))
      ) : (
        <Empty icon="chart">{t.statistics.empty}</Empty>
      )}
      <RateCurve />
      <NeighbourhoodPrices cityId={state.player.baseCityId} />
      <Card title={t.statistics.records} testId="records">
        <KeyValues
          rows={[
            { label: t.statistics.maxNetWorth, value: formatEuros(progress.records.maxNetWorth) },
            {
              label: t.statistics.bestCapitalGain,
              value: formatEuros(progress.records.bestCapitalGain),
            },
            { label: t.statistics.biggestWorks, value: formatEuros(progress.records.biggestWorks) },
            { label: t.statistics.bestMonth, value: formatEuros(progress.records.bestMonth) },
          ]}
        />
      </Card>
      <Card title={t.statistics.counters}>
        <KeyValues
          rows={COUNTERS.map((stat) => ({
            label: statLabel(stat, null),
            value: String(progress.counters[stat] ?? 0),
          }))}
        />
      </Card>
    </div>
  );
}
