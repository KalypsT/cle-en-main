import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { format, formatEuros, propertyLabel, t } from '../texts.ts';
import { Badge, Card, KeyValues, ScreenHeader } from '../ui/components.tsx';

/** « Impôts » (docs/03-systemes/06): this year's estimate and the regime of each property. */
export function TaxesScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const estimate = engine.estimateTaxes(state);
  const { assessment } = estimate;
  const { installments, lastAssessment } = state.tax;
  const propertyTax = state.properties.reduce(
    (sum, owned) => sum + owned.property.annualPropertyTax,
    0,
  );
  return (
    <div className="screen">
      <ScreenHeader title={t.taxes.heading} onBack={nav.pop} />
      <p className="muted">{format(t.taxes.year, { year: state.tax.year })}</p>
      <Card title={t.taxes.estimate} testId="tax-estimate">
        <p className="big-number">{formatEuros(estimate.cost)}</p>
        <KeyValues
          rows={[
            { label: t.taxes.incomeTax, value: formatEuros(assessment.incomeTax) },
            { label: t.taxes.social, value: formatEuros(assessment.socialContributions) },
            { label: t.taxes.accountant, value: formatEuros(assessment.accountantFees) },
            { label: t.taxes.deficit, value: formatEuros(assessment.deficitOnSalary) },
          ]}
        />
        <p className="tiny muted">{t.taxes.estimateHint}</p>
      </Card>
      <Card title={t.taxes.regimes}>
        {estimate.properties.length === 0 && <p className="small muted">{t.taxes.noLet}</p>}
        {estimate.properties.map((entry) => {
          const owned = state.properties.find((o) => o.property.id === entry.propertyId);
          return (
            <div key={entry.propertyId} className="card flat">
              <p className="strong">{owned ? propertyLabel(owned.property) : entry.propertyId}</p>
              <p className="small muted">{t.taxes.category[entry.category]}</p>
              {(['micro', 'real'] as const).map((regime) => (
                <div key={regime} className="row between small">
                  <span>
                    {format(t.taxes.costIf, {
                      regime: regime === 'micro' ? t.taxes.micro : t.taxes.real,
                      amount: formatEuros(entry[regime]),
                    })}
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {entry.recommended === regime && (
                      <Badge tone="green">{t.taxes.recommended}</Badge>
                    )}
                    {owned?.taxRegime === regime && <Badge tone="teal">{t.taxes.chosen}</Badge>}
                  </span>
                </div>
              ))}
              {owned && (
                <select
                  className="select"
                  value={owned.taxRegime}
                  onChange={(e) =>
                    act(
                      {
                        type: 'tax/setRegime',
                        propertyId: entry.propertyId,
                        regime: e.target.value as 'auto' | 'micro' | 'real',
                      },
                      t.property.regimeSaved,
                    )
                  }
                >
                  {(['auto', 'micro', 'real'] as const).map((regime) => (
                    <option key={regime} value={regime}>
                      {t.property.regimes[regime]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </Card>
      {installments.remaining > 0 && (
        <Card>
          <p className="small">
            {format(t.taxes.instalments, {
              amount: formatEuros(installments.monthly),
              months: installments.remaining,
            })}
          </p>
        </Card>
      )}
      {lastAssessment && (
        <Card title={format(t.taxes.last, { year: lastAssessment.year })}>
          <KeyValues
            rows={[
              { label: t.taxes.incomeTax, value: formatEuros(lastAssessment.incomeTax) },
              { label: t.taxes.social, value: formatEuros(lastAssessment.socialContributions) },
              { label: t.taxes.accountant, value: formatEuros(lastAssessment.accountantFees) },
            ]}
          />
        </Card>
      )}
      {propertyTax > 0 && (
        <p className="small muted">
          {format(t.taxes.propertyTax, { amount: formatEuros(propertyTax) })}
        </p>
      )}
    </div>
  );
}
