import { type PropertyStatus, toDayNumber } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  format,
  formatDay,
  formatDayLong,
  formatDayYear,
  formatEuros,
  formatSigned,
  propertyLabel,
  t,
  tone,
} from '../texts.ts';
import {
  Badge,
  Card,
  Empty,
  KeyValues,
  ListRow,
  ScreenHeader,
  SectionTitle,
  Tile,
} from '../ui/components.tsx';
import { KindThumb } from '../ui/Facade.tsx';
import { LineChart } from '../ui/LineChart.tsx';

const STATUS_TONE: Record<PropertyStatus, 'teal' | 'amber' | 'green' | undefined> = {
  home: 'teal',
  works: 'amber',
  sold: 'teal',
  forSale: 'amber',
  let: 'green',
  listedForRent: 'amber',
  vacant: 'amber',
};

/** « Patrimoine »: synthesis, curve, cash flow, the properties (docs/04, Mes biens). */
export function AssetsTab() {
  const { state } = useGame();
  const nav = useNav();
  const summary = engine.portfolio(state);
  const history = state.history;
  const first = history[0];
  const last = history.at(-1);

  return (
    <div className="screen">
      <ScreenHeader title={t.assets.heading} />
      <div className="grid-2">
        <Tile label={t.assets.netWorth} value={formatEuros(summary.netWorth)} testId="net-worth" />
        <Tile label={t.assets.cash} value={formatEuros(summary.balance)} />
        <Tile label={t.assets.propertiesValue} value={formatEuros(summary.propertiesValue)} />
        <Tile label={t.assets.debt} value={formatEuros(summary.debt)} />
        <Tile
          label={t.assets.cashFlow}
          value={
            <span className={tone(summary.propertiesCashFlow)}>
              {formatSigned(summary.propertiesCashFlow)}
            </span>
          }
          hint={t.assets.cashFlowHint}
        />
        <Tile
          label={t.assets.monthlyBudget}
          value={
            <span className={tone(summary.monthlyBudget)}>
              {formatSigned(summary.monthlyBudget)}
            </span>
          }
          hint={t.street.monthlyHint}
        />
      </div>

      <Card title={t.assets.curve}>
        {first && last && history.length >= 2 ? (
          <LineChart
            title={t.assets.curve}
            xLabels={[formatDay(toDayNumber(first.date)), formatDay(toDayNumber(last.date))]}
            series={[
              {
                label: t.assets.curveNetWorth,
                color: '#0f6f68',
                values: history.map((p) => p.netWorth),
              },
              {
                label: t.assets.curveBalance,
                color: '#a35a06',
                values: history.map((p) => p.balance),
                dashed: true,
              },
            ]}
          />
        ) : (
          <p className="small muted">{t.assets.curveEmpty}</p>
        )}
      </Card>

      {state.purchases.length > 0 && (
        <>
          <SectionTitle title={t.assets.purchases} />
          <div className="list">
            {state.purchases.map((purchase) => (
              <ListRow
                key={purchase.id}
                thumb={<KindThumb property={purchase.property} />}
                title={propertyLabel(purchase.property)}
                subtitle={format(t.assets.deedOn, { date: formatDayLong(purchase.deedDay) })}
                side={<span className="strong">{formatEuros(purchase.price)}</span>}
                testId={`purchase-${purchase.id}`}
                onClick={() => nav.push({ name: 'purchase', id: purchase.id })}
              />
            ))}
          </div>
        </>
      )}

      <SectionTitle title={t.assets.properties} />
      {summary.properties.length === 0 ? (
        <Empty icon="assets">
          <p>{t.assets.empty}</p>
          <button
            type="button"
            className="button primary"
            onClick={() => nav.push({ name: 'listings' })}
          >
            {t.assets.seeListings}
          </button>
        </Empty>
      ) : (
        <div className="list">
          {summary.properties.map((row) => {
            const owned = state.properties.find((o) => o.property.id === row.propertyId);
            if (!owned) return null;
            return (
              <ListRow
                key={row.propertyId}
                thumb={<KindThumb property={owned.property} owned />}
                title={propertyLabel(owned.property)}
                testId={`property-${row.propertyId}`}
                extra={<Badge tone={STATUS_TONE[row.status]}>{t.assets.status[row.status]}</Badge>}
                side={
                  <span className="stack tight">
                    <span className="strong">{formatEuros(row.value)}</span>
                    <span className={`small ${tone(row.cashFlow.net)}`}>
                      {format(t.common.perMonth, { amount: formatSigned(row.cashFlow.net) })}
                    </span>
                  </span>
                }
                onClick={() => nav.push({ name: 'property', id: row.propertyId })}
              />
            );
          })}
        </div>
      )}
      {summary.properties.length > 0 && (
        <Card title={t.assets.cashFlow}>
          <KeyValues
            rows={[
              ...summary.properties.map((row) => {
                const owned = state.properties.find((o) => o.property.id === row.propertyId);
                return {
                  label: owned ? propertyLabel(owned.property) : row.propertyId,
                  value: formatSigned(row.cashFlow.net),
                  className: tone(row.cashFlow.net),
                };
              }),
              {
                label: t.assets.cashFlow,
                value: formatSigned(summary.propertiesCashFlow),
                className: tone(summary.propertiesCashFlow),
                total: true,
              },
            ]}
          />
        </Card>
      )}
      {state.soldProperties.length > 0 && (
        <>
          <SectionTitle title={t.assets.sold} />
          <div className="list" data-testid="sold-properties">
            {[...state.soldProperties].reverse().map((sold) => (
              <ListRow
                key={`${sold.property.id}-${sold.soldDay}`}
                thumb={<KindThumb property={sold.property} />}
                title={propertyLabel(sold.property)}
                subtitle={format(t.assets.soldLine, { date: formatDayYear(sold.soldDay) })}
                extra={sold.forced ? <Badge tone="amber">{t.assets.forced}</Badge> : undefined}
                side={
                  <span className="stack tight">
                    <span className="strong">{formatEuros(sold.price)}</span>
                    <span className={`small ${tone(sold.gain)}`}>{formatSigned(sold.gain)}</span>
                  </span>
                }
                onClick={() => nav.push({ name: 'soldProperty', id: sold.property.id })}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
