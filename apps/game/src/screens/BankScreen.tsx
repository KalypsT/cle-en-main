import { gameContent } from '@cle/content';
import { fromDayNumber, type Loan } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { bankName, format, formatEuros, formatGameDate, formatPercent, t } from '../texts.ts';
import { BottomSheet, Card, KeyValues, ScreenHeader, Why } from '../ui/components.tsx';
import { RateWhy } from '../ui/explain.tsx';
import { durationChoices } from '../ui/FinancingPanel.tsx';

/** Reference duration of the rates shown for each bank. */
const REFERENCE_YEARS = 20;
/** Default amount of the simulator, in cents (presentation only). */
const DEFAULT_AMOUNT = 100_000_00;

/** « Banque » (docs/04): loans, simulator, bankers and meetings, renegotiation. */
export function BankScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const [renegotiating, setRenegotiating] = useState<Loan | null>(null);
  const ratio = engine.debtRatio(state);

  return (
    <div className="screen">
      <ScreenHeader title={t.bank.heading} onBack={nav.pop} />
      <p className="small muted">
        {format(t.bank.marketRate, { rate: formatPercent(state.market.ratePercent) })}
      </p>

      <Card title={t.bank.loans}>
        {state.loans.length === 0 && <p className="small muted">{t.bank.noLoans}</p>}
        {state.loans.map((loan) => (
          <div key={loan.id} className="card flat" data-testid="loan">
            <p className="strong">
              {format(t.bank.loanLine, {
                bank: bankName(loan.bankId),
                rate: formatPercent(loan.ratePercent),
              })}
            </p>
            <KeyValues
              rows={[
                { label: t.bank.remaining, value: formatEuros(loan.remaining) },
                { label: t.bank.monthly, value: formatEuros(loan.monthlyPayment) },
                { label: t.bank.monthsLeft, value: loan.durationMonths - loan.paymentsMade },
              ]}
            />
            <button type="button" className="button small" onClick={() => setRenegotiating(loan)}>
              {t.bank.renegotiate}
            </button>
          </div>
        ))}
        <div className="row between">
          <span className="muted small">{t.bank.debtRatio}</span>
          <span className="strong">
            {Number.isFinite(ratio) ? formatPercent(ratio * 100) : '∞'}
          </span>
        </div>
        <p className="tiny muted">{t.bank.debtRatioHint}</p>
      </Card>

      <Simulator />

      <Card title={t.bank.banks}>
        {gameContent.banks.map((bank) => {
          const relation = state.banks[bank.id];
          const quote = engine.quoteRate(state, bank.id, REFERENCE_YEARS);
          return (
            <div key={bank.id} className="card flat" data-testid={`bank-${bank.id}`}>
              <p className="strong">{bank.name}</p>
              <p className="small">
                {bank.banker.name} · <span className="muted">{bank.banker.description}</span>
              </p>
              <p className="small muted">{bank.policy}</p>
              <div className="row between small">
                <span>{format(t.bank.trust, { trust: Math.round(relation?.trust ?? 0) })}</span>
                {quote && (
                  <span className="row" style={{ gap: 4 }}>
                    {format(t.bank.rate20, { rate: formatPercent(quote.ratePercent) })}
                    <Why title={t.financing.rateWhy}>
                      <RateWhy quote={quote} />
                    </Why>
                  </span>
                )}
              </div>
              {relation?.lastMeetingDay != null && (
                <p className="tiny muted">
                  {format(t.bank.lastMeeting, {
                    date: formatGameDate(fromDayNumber(relation.lastMeetingDay)),
                  })}
                </p>
              )}
              {bank.meetings && (
                <button
                  type="button"
                  className="button small"
                  onClick={() => act({ type: 'bank/meet', bankId: bank.id }, t.bank.met)}
                >
                  {t.bank.meet}
                </button>
              )}
            </div>
          );
        })}
      </Card>

      {renegotiating && (
        <RenegotiateSheet loan={renegotiating} onClose={() => setRenegotiating(null)} />
      )}
    </div>
  );
}

function Simulator() {
  const { state } = useGame();
  const [bankId, setBankId] = useState(gameContent.start.accountBankId);
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [years, setYears] = useState(REFERENCE_YEARS);
  const sim = engine.simulateLoan(state, bankId, amount, years);
  return (
    <Card title={t.bank.simulator}>
      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.financing.bank}</span>
          <select className="select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {gameContent.banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t.financing.duration}</span>
          <select
            className="select"
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
          >
            {durationChoices(true).map((y) => (
              <option key={y} value={y}>
                {format(t.common.years, { years: y })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">{t.bank.amount}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={5000}
          value={Math.round(amount / 100)}
          onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)))}
        />
      </label>
      {sim && (
        <KeyValues
          rows={[
            {
              label: t.financing.rateLines.ratePercent,
              value: formatPercent(sim.rate.ratePercent),
            },
            { label: t.bank.monthly, value: formatEuros(sim.monthlyPayment) },
            { label: t.bank.totalCost, value: formatEuros(sim.totalCost) },
            {
              label: t.bank.debtRatio,
              value: Number.isFinite(sim.debtRatioAfter)
                ? formatPercent(sim.debtRatioAfter * 100)
                : '∞',
              total: true,
            },
          ]}
        />
      )}
    </Card>
  );
}

function RenegotiateSheet({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { state, act } = useGame();
  const [bankId, setBankId] = useState(loan.bankId);
  const quote = engine.refinanceQuote(state, loan.id, bankId);
  const refinance = () => {
    if (act({ type: 'bank/refinance', loanId: loan.id, bankId }, t.bank.refinanced)) onClose();
  };
  return (
    <BottomSheet title={t.bank.renegotiateHeading} onClose={onClose}>
      <p className="small">
        {format(t.bank.loanLine, {
          bank: bankName(loan.bankId),
          rate: formatPercent(loan.ratePercent),
        })}
        {' · '}
        {formatEuros(loan.monthlyPayment)}
      </p>
      <label className="field">
        <span className="field-label">{t.bank.renegotiateWith}</span>
        <select className="select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          {gameContent.banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name}
            </option>
          ))}
        </select>
      </label>
      {quote && (
        <>
          <KeyValues
            rows={[
              { label: t.bank.newRate, value: formatPercent(quote.ratePercent) },
              { label: t.bank.newMonthly, value: formatEuros(quote.monthlyPayment) },
              { label: t.bank.fees, value: formatEuros(quote.fees) },
              { label: t.bank.monthsLeft, value: quote.months },
            ]}
          />
          {quote.refusal && (
            <p className="small negative">
              {quote.refusal === 'loan.notWorthRefinancing' ? t.bank.notWorth : t.bank.refused}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="button primary block"
        disabled={!quote || quote.refusal !== null}
        onClick={refinance}
      >
        {t.bank.refinance}
      </button>
    </BottomSheet>
  );
}
