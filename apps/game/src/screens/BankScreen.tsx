import { debtRatio, type LoanSheet } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankName,
  format,
  formatDayLong,
  formatEuros,
  formatMoney,
  formatPercent,
  propertyLabel,
  t,
  texts as uiTexts,
} from '../texts.ts';
import { Card, KeyValues, ScreenHeader } from '../ui/components.tsx';
import { LineChart } from '../ui/LineChart.tsx';

/**
 * « Banque et SCI » (milestone 8): the loans under way, the player's own debt ratio, and the
 * SCI: create it, what it holds and owes, and what its banks would still lend.
 */
export function BankScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const sheet = engine.companySheet(state);
  const sheets = engine.loanSheets(state);
  const texts = t.bank;
  const held = new Set(
    state.properties.filter((o) => o.holder === 'company').map((o) => o.property.id),
  );
  return (
    <div className="screen">
      <ScreenHeader title={texts.heading} onBack={nav.pop} />
      <Card title={texts.loans}>
        {sheets.length === 0 ? (
          <p className="small muted">{texts.noLoans}</p>
        ) : (
          <LoanTotals sheets={sheets} />
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
      {sheets.map((sheet) => (
        <LoanCard key={sheet.loanId} sheet={sheet} company={held.has(sheet.propertyId ?? '')} />
      ))}
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

/** All the loans together, and the remaining capital year by year. */
function LoanTotals({ sheets }: { sheets: LoanSheet[] }) {
  const texts = t.bank;
  const { state } = useGame();
  const years = Math.max(...sheets.map((sheet) => sheet.remainingByYear.length));
  const curve = Array.from({ length: years }, (_, year) =>
    sheets.reduce((sum, sheet) => sum + (sheet.remainingByYear[year] ?? 0), 0),
  );
  const thisYear = state.clock.date.year;
  return (
    <>
      <KeyValues
        rows={[
          {
            label: texts.totalPayments,
            value: formatEuros(sheets.reduce((sum, sheet) => sum + sheet.monthlyPayment, 0)),
          },
          {
            label: texts.totalRemaining,
            value: formatEuros(sheets.reduce((sum, sheet) => sum + sheet.remaining, 0)),
          },
          {
            label: texts.totalInterestLeft,
            value: formatEuros(sheets.reduce((sum, sheet) => sum + sheet.interestLeft, 0)),
          },
        ]}
      />
      <LineChart
        title={texts.curve}
        xLabels={[String(thisYear), String(thisYear + years - 1)]}
        series={[{ label: texts.totalRemaining, color: '#a33a2a', values: curve }]}
      />
    </>
  );
}

/** One loan: how far it is repaid, what it costs, and a cheaper bank if there is one. */
function LoanCard({ sheet, company }: { sheet: LoanSheet; company: boolean }) {
  const { state, act } = useGame();
  const texts = t.bank;
  const owned = state.properties.find((o) => o.property.id === sheet.propertyId);
  const refinance = sheet.refinance;
  return (
    <Card
      title={format(texts.loanTitle, { bank: bankName(sheet.bankId) })}
      aside={company ? <span className="small muted">{texts.companyLoan}</span> : undefined}
      testId="loan"
    >
      {owned && (
        <p className="small muted">
          {format(texts.loanFor, { property: propertyLabel(owned.property) })}
        </p>
      )}
      <span className="small">
        {format(texts.repaid, { percent: formatPercent(sheet.repaidShare * 100) })}
      </span>
      <span className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(sheet.repaidShare * 100)}%` }} />
      </span>
      <KeyValues
        rows={[
          { label: texts.principal, value: formatEuros(sheet.principal) },
          { label: texts.remaining, value: formatEuros(sheet.remaining) },
          { label: texts.payment, value: formatMoney(sheet.monthlyPayment) },
          { label: texts.rate, value: formatPercent(sheet.ratePercent) },
          { label: texts.interestPaid, value: formatEuros(sheet.interestPaid) },
          { label: texts.interestLeft, value: formatEuros(sheet.interestLeft) },
          {
            label: texts.totalCost,
            value: formatEuros(sheet.interestPaid + sheet.interestLeft),
            total: true,
          },
          {
            label: texts.end,
            value: format(texts.endValue, {
              month: uiTexts.calendar.months[sheet.endDate.month - 1] ?? '',
              year: sheet.endDate.year,
              months: sheet.monthsLeft,
            }),
          },
        ]}
      />
      {refinance && (
        <>
          <p className="small">
            {format(refinance.saving > 0 ? texts.refinance : texts.refinanceLoss, {
              bank: bankName(refinance.bankId),
              rate: formatPercent(refinance.ratePercent),
              payment: formatMoney(refinance.monthlyPayment),
              fees: formatEuros(refinance.fees),
              saving: formatEuros(refinance.saving),
            })}
          </p>
          {refinance.saving > 0 &&
            (refinance.refusal ? (
              <p className="small muted">{texts.refinanceRefused}</p>
            ) : (
              <button
                type="button"
                className="button block"
                onClick={() =>
                  act({ type: 'bank/refinance', loanId: sheet.loanId, bankId: refinance.bankId })
                }
              >
                {format(texts.refinanceAction, { bank: bankName(refinance.bankId) })}
              </button>
            ))}
        </>
      )}
    </Card>
  );
}
