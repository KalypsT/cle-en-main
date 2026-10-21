import { type SoldProperty, toDayNumber } from '@cle/engine';
import { useState } from 'react';
import { useGame, useNav } from '../game/context.tsx';
import { formatDayLong, formatEuros, formatSigned, propertyLabel, t, tone } from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader, Segmented } from '../ui/components.tsx';
import { Facade } from '../ui/Facade.tsx';
import { FormerTenants, formatLeaseDuration, History } from './PropertyHistory.tsx';
import { ValueChart } from './PropertyScreen.tsx';

type Tab = 'summary' | 'value' | 'tenants' | 'history';
const TABS: readonly Tab[] = ['summary', 'value', 'tenants', 'history'];

/** The last sale of a property (a property bought back and sold again keeps its last sale). */
export function findSold(sold: readonly SoldProperty[], propertyId: string) {
  return sold.findLast((candidate) => candidate.property.id === propertyId);
}

/** « Bien vendu »: the summary of the operation, the value curve and the history, read only. */
export function SoldPropertyScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>('summary');
  const sold = findSold(state.soldProperties, id);
  const texts = t.soldProperty;
  if (!sold) {
    return (
      <div className="screen">
        <ScreenHeader title={texts.heading} onBack={nav.pop} />
        <Empty icon="info">{texts.gone}</Empty>
      </div>
    );
  }
  return (
    <div className="screen" data-testid="sold-property">
      <ScreenHeader title={propertyLabel(sold.property)} onBack={nav.pop} />
      <Facade property={sold.property} height={130} />
      <Segmented<Tab>
        label={texts.heading}
        value={tab}
        onChange={setTab}
        options={TABS.map((value) => ({ value, label: texts.tabs[value] }))}
      />
      {tab === 'summary' && <Summary sold={sold} />}
      {tab === 'value' && (
        <Card title={texts.valueHeading}>
          <ValueChart history={sold.valueHistory} purchasePrice={sold.purchasePrice} />
        </Card>
      )}
      {tab === 'tenants' && <FormerTenants log={sold.log} />}
      {tab === 'history' && <History property={sold.property} log={sold.log} />}
    </div>
  );
}

function Summary({ sold }: { sold: SoldProperty }) {
  const texts = t.soldProperty;
  const works = sold.log.reduce((sum, entry) => sum + (entry.kind === 'works' ? entry.cost : 0), 0);
  const boughtDay = toDayNumber(sold.purchaseDate);
  const optional = (label: string, amount: number) =>
    amount > 0 ? [{ label, value: formatSigned(-amount) }] : [];
  return (
    <Card title={texts.summary} testId="sold-summary">
      {sold.forced && <p className="small">{texts.forced}</p>}
      {sold.holder === 'company' && <p className="small muted">{texts.company}</p>}
      <KeyValues
        rows={[
          { label: texts.bought, value: formatDayLong(boughtDay) },
          { label: texts.purchasePrice, value: formatEuros(sold.purchasePrice) },
          { label: texts.acquisitionCost, value: formatEuros(sold.acquisitionCost) },
          ...(works > 0 ? [{ label: texts.works, value: formatEuros(works) }] : []),
          { label: texts.rents, value: formatEuros(sold.rentsReceived) },
          { label: texts.held, value: formatLeaseDuration(sold.soldDay - boughtDay) },
        ]}
      />
      <p className="small muted">{texts.rentsHint}</p>
      <KeyValues
        rows={[
          { label: texts.soldOn, value: formatDayLong(sold.soldDay) },
          { label: texts.price, value: formatEuros(sold.price) },
          ...optional(texts.agencyFees, sold.agencyFees),
          ...optional(texts.loanRepaid, sold.loanRepaid),
          ...optional(texts.loanFees, sold.loanFees),
          ...optional(texts.capitalGainsTax, sold.capitalGainsTax),
          ...optional(texts.depositTransferred, sold.depositTransferred),
          { label: texts.net, value: formatEuros(sold.net), total: true },
          { label: texts.gain, value: formatSigned(sold.gain), className: tone(sold.gain) },
        ]}
      />
      <p className="small muted">{texts.gainHint}</p>
    </Card>
  );
}
