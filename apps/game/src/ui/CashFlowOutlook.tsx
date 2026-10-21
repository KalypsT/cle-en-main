import type { CashFlowOutlook } from '@cle/engine';
import { gameContent } from '@cle/content';
import { format, formatEuros, formatSigned, t } from '../texts.ts';
import { Amount, Card, KeyValues } from './components.tsx';

/** Colour of a cash-flow outlook (progression, step 3). */
export function outlookTone(outlook: CashFlowOutlook): string {
  return outlook.tone === 'positive' ? 'positive' : outlook.tone === 'negative' ? 'negative' : '';
}

/** Yvon's word on a cash-flow outlook: what it would leave, or the price that pays for itself. */
export function outlookAdvice(outlook: CashFlowOutlook): string {
  switch (outlook.tone) {
    case 'positive':
      return format(t.outlook.positive, { amount: formatEuros(outlook.monthly) });
    case 'balanced':
      return t.outlook.balanced;
    case 'negative':
      return outlook.breakEvenPrice === null
        ? t.outlook.negativeNoPrice
        : format(t.outlook.negative, {
            amount: formatEuros(-outlook.monthly),
            price: formatEuros(outlook.breakEvenPrice),
          });
  }
}

/** « Cash-flow prévu » of a listing: every amount comes from the engine. */
export function CashFlowOutlookCard({ outlook }: { outlook: CashFlowOutlook }) {
  const sim = outlook.simulation;
  return (
    <Card title={t.outlook.heading} testId="cash-flow-outlook">
      <Amount
        label={format(t.outlook.label, { years: gameContent.yvon.thresholds.outlookYears })}
        value={format(t.outlook.perMonth, { amount: formatSigned(outlook.monthly) })}
        className={outlookTone(outlook)}
        why={
          <div className="stack">
            <p className="small muted">{t.outlook.hint}</p>
            <KeyValues
              rows={[
                { label: t.property.lines.rent, value: formatSigned(sim.rent) },
                {
                  label: t.property.lines.recoverableCharges,
                  value: formatSigned(sim.recoverableCharges),
                },
                { label: t.rent.ownerCosts, value: formatSigned(-sim.ownerCosts) },
                { label: t.property.lines.loanPayment, value: formatSigned(-sim.monthlyPayment) },
                { label: t.outlook.heading, value: formatSigned(outlook.monthly), total: true },
              ]}
            />
          </div>
        }
      />
      <p className="small">{outlookAdvice(outlook)}</p>
    </Card>
  );
}
