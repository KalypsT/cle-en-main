import { debtRatio } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { bankName, format, formatDayLong, formatMoney, formatPercent, t } from '../texts.ts';
import { Card, KeyValues, ScreenHeader } from '../ui/components.tsx';

/**
 * « Banque et SCI » (milestone 8): the loans under way, the player's own debt ratio, and the
 * SCI: create it, what it holds and owes, and what its banks would still lend.
 */
export function BankScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const sheet = engine.companySheet(state);
  const texts = t.bank;
  const held = new Set(
    state.properties.filter((o) => o.holder === 'company').map((o) => o.property.id),
  );
  return (
    <div className="screen">
      <ScreenHeader title={texts.heading} onBack={nav.pop} />
      <Card title={texts.loans}>
        {state.loans.length === 0 ? (
          <p className="small muted">{texts.noLoans}</p>
        ) : (
          <ul className="stack tight">
            {state.loans.map((loan) => (
              <li key={loan.id} className="small">
                {format(texts.loan, {
                  bank: bankName(loan.bankId),
                  remaining: formatMoney(loan.remaining),
                  payment: formatMoney(loan.monthlyPayment),
                  rate: formatPercent(loan.ratePercent),
                })}{' '}
                {loan.propertyId && held.has(loan.propertyId) ? texts.companyLoan : null}
              </li>
            ))}
          </ul>
        )}
        <KeyValues
          rows={[
            {
              label: texts.debtRatio,
              value: formatPercent(Math.min(999, debtRatio(engine.content, state) * 100)),
            },
          ]}
        />
        <p className="small muted">{texts.debtRatioHint}</p>
      </Card>
      <Card title={texts.company} testId="company">
        <p className="small">{texts.companyIntro}</p>
        {sheet.createdDay === null ? (
          <button
            type="button"
            className="button primary block"
            onClick={() => act({ type: 'company/create' })}
          >
            {format(texts.create, { amount: formatMoney(sheet.creationCost) })}
          </button>
        ) : (
          <>
            <p className="small muted">
              {format(texts.created, { date: formatDayLong(sheet.createdDay) })}
            </p>
            <KeyValues
              rows={[
                { label: texts.properties, value: String(sheet.properties) },
                { label: texts.rent, value: formatMoney(sheet.monthlyRent) },
                { label: texts.payments, value: formatMoney(sheet.monthlyPayments) },
                { label: texts.debt, value: formatMoney(sheet.debt) },
                { label: texts.ceiling, value: formatMoney(sheet.ceiling) },
                { label: texts.headroom, value: formatMoney(sheet.headroom), total: true },
                { label: texts.accountant, value: formatMoney(sheet.accountantFees) },
              ]}
            />
            <p className="small muted">{texts.buyHint}</p>
          </>
        )}
        <p className="small muted">
          {format(texts.rules, {
            coverage: formatPercent(sheet.rentCoverageShare * 100),
            fees: formatPercent(sheet.feesContributionShare * 100),
            extra: formatPercent(sheet.extraContributionShare * 100),
          })}
        </p>
      </Card>
    </div>
  );
}
