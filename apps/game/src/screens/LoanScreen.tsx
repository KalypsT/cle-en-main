import { type LoanSheet, type PrepaymentMode, type RefinanceOption, toCents } from '@cle/engine';
import { Fragment, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankName,
  format,
  formatEuros,
  formatMoney,
  formatPercent,
  propertyLabel,
  t,
} from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader, Segmented } from '../ui/components.tsx';
import { LoanProgress, loanEnd } from './BankScreen.tsx';

const MODES: readonly PrepaymentMode[] = ['payment', 'duration'];

/**
 * One loan (docs/03-systemes/02, « La renégociation et le rachat de crédit »): where it
 * stands, how the next payment splits, what its own bank and the best other one offer
 * today, and an early repayment. Every figure comes from the engine.
 */
export function LoanScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const sheet = engine.loanSheets(state).find((candidate) => candidate.loanId === id);
  if (!sheet) {
    return (
      <div className="screen">
        <ScreenHeader title={t.bank.heading} onBack={nav.pop} />
        <Empty icon="bank">{t.loan.unknown}</Empty>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader
        title={format(t.loan.heading, { bank: bankName(sheet.bankId) })}
        onBack={nav.pop}
      />
      <LoanFigures sheet={sheet} />
      <NextPayment sheet={sheet} />
      <Refinancing sheet={sheet} />
      <Prepayment sheet={sheet} />
    </div>
  );
}

function LoanFigures({ sheet }: { sheet: LoanSheet }) {
  const { state } = useGame();
  const texts = t.bank;
  const owned = state.properties.find((o) => o.property.id === sheet.propertyId);
  return (
    <Card testId="loan-figures">
      {owned && (
        <p className="small muted">
          {format(texts.loanFor, { property: propertyLabel(owned.property) })}
        </p>
      )}
      <LoanProgress sheet={sheet} />
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
          { label: texts.end, value: loanEnd(sheet) },
        ]}
      />
    </Card>
  );
}

/** The share of interest and of capital in the next payment. */
function NextPayment({ sheet }: { sheet: LoanSheet }) {
  const texts = t.loan;
  const { interest, capital } = sheet.nextPayment;
  const total = interest + capital;
  const share = total > 0 ? capital / total : 1;
  return (
    <Card title={texts.split} testId="loan-split">
      <span className="meter" aria-hidden="true">
        <span style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <KeyValues
        rows={[
          { label: texts.splitCapital, value: formatMoney(capital) },
          { label: texts.splitInterest, value: formatMoney(interest) },
        ]}
      />
      <p className="small muted">{texts.splitHint}</p>
    </Card>
  );
}

/** Own bank's renegotiation and the best buy-back, side by side; decline them. */
function Refinancing({ sheet }: { sheet: LoanSheet }) {
  const { act } = useGame();
  const texts = t.loan;
  return (
    <Card title={texts.refinanceHeading} testId="loan-refinance">
      <p className="small muted">{texts.refinanceIntro}</p>
      {sheet.refinance.length === 0 && <p className="small">{texts.noOffer}</p>}
      {sheet.refinance.map((option) => (
        <Fragment key={option.bankId}>
          <hr className="divider" />
          <RefinanceOffer loanId={sheet.loanId} option={option} />
        </Fragment>
      ))}
      {sheet.worthy &&
        (sheet.declined ? (
          <p className="small muted">{texts.declined}</p>
        ) : (
          <button
            type="button"
            className="button block"
            data-testid="decline-refinancing"
            onClick={() => act({ type: 'bank/declineRefinancing', loanId: sheet.loanId })}
          >
            {texts.decline}
          </button>
        ))}
    </Card>
  );
}

function RefinanceOffer({ loanId, option }: { loanId: string; option: RefinanceOption }) {
  const { act } = useGame();
  const nav = useNav();
  const texts = t.loan;
  const bank = bankName(option.bankId);
  return (
    <div className="stack tight" data-testid={`refinance-${option.bankId}`}>
      <p className="small strong">{format(option.own ? texts.own : texts.other, { bank })}</p>
      <KeyValues
        rows={[
          { label: texts.newRate, value: formatPercent(option.ratePercent) },
          { label: texts.newPayment, value: formatMoney(option.monthlyPayment) },
          { label: texts.fees, value: formatEuros(option.fees) },
          ...(option.saving > 0
            ? [{ label: texts.saving, value: formatEuros(option.saving), total: true }]
            : []),
        ]}
      />
      {option.saving <= 0 ? (
        <p className="small muted">{texts.loss}</p>
      ) : option.refusal ? (
        <p className="small muted">{texts.refused}</p>
      ) : (
        <button
          type="button"
          className="button primary block"
          onClick={() => {
            // The loan is replaced by a new one: back to the list of loans.
            if (act({ type: 'bank/refinance', loanId, bankId: option.bankId })) nav.pop();
          }}
        >
          {format(option.own ? texts.acceptOwn : texts.acceptOther, { bank })}
        </button>
      )}
    </div>
  );
}

/** Early repayment: an amount, lower payment or shorter loan, and what it changes. */
function Prepayment({ sheet }: { sheet: LoanSheet }) {
  const { state, act } = useGame();
  const nav = useNav();
  const texts = t.loan;
  const rules = engine.content.credit.earlyRepayment;
  const min = toCents(rules.minAmount);
  const [amount, setAmount] = useState(() => Math.min(sheet.remaining, Math.max(min, 0)));
  const [mode, setMode] = useState<PrepaymentMode>('payment');
  const preview = engine.previewPrepayment(state, sheet.loanId, amount, mode);
  if (!preview) return null;
  return (
    <Card title={texts.prepayHeading} testId="loan-prepay">
      <p className="small muted">
        {format(texts.prepayIntro, {
          share: formatPercent(rules.penaltyShareOfAmount * 100),
          months: rules.penaltyInterestMonths,
          min: formatEuros(min),
        })}
      </p>
      <label className="field">
        <span className="field-label">{texts.amount}</span>
        <span className="row" style={{ gap: 8 }}>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={Math.round(amount / 100)}
            data-testid="prepay-amount"
            onChange={(e) =>
              setAmount(
                Math.min(sheet.remaining, Math.max(0, Math.round(Number(e.target.value) * 100))),
              )
            }
          />
          <button type="button" className="button" onClick={() => setAmount(sheet.remaining)}>
            {texts.all}
          </button>
        </span>
        <input
          className="range"
          type="range"
          min={0}
          max={sheet.remaining}
          step={toCents(100)}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label={texts.amount}
        />
      </label>
      {!preview.full && (
        <>
          <Segmented<PrepaymentMode>
            label={texts.mode}
            options={MODES.map((value) => ({ value, label: texts.modes[value] }))}
            value={mode}
            onChange={setMode}
          />
          <p className="small muted">{texts.modeHints[mode]}</p>
        </>
      )}
      {preview.full && <p className="small strong">{texts.previewEnds}</p>}
      <KeyValues
        rows={[
          ...(preview.full
            ? []
            : [
                { label: texts.previewPayment, value: formatMoney(preview.monthlyPayment) },
                { label: texts.previewEnd, value: loanEnd(preview) },
              ]),
          { label: texts.previewFees, value: formatEuros(preview.fees) },
          { label: texts.previewSaved, value: formatEuros(preview.interestSaved) },
          {
            label: texts.previewNet,
            value: formatEuros(preview.interestSaved - preview.fees),
            total: true,
          },
        ]}
      />
      {preview.refusal === 'loan.prepaymentTooSmall' && (
        <p className="small muted">{format(texts.tooSmall, { amount: formatEuros(min) })}</p>
      )}
      {preview.refusal === 'account.insufficientFunds' && (
        <p className="small muted">
          {format(texts.noCash, { amount: formatEuros(preview.amount + preview.fees) })}
        </p>
      )}
      <button
        type="button"
        className="button primary block"
        data-testid="prepay-confirm"
        disabled={preview.refusal !== null}
        onClick={() => {
          const done = act({
            type: 'bank/prepay',
            loanId: sheet.loanId,
            amount: preview.amount,
            mode,
          });
          if (done && preview.full) nav.pop();
          else if (done) setAmount(0);
        }}
      >
        {format(preview.full ? texts.confirmAll : texts.confirm, {
          amount: formatEuros(preview.amount),
        })}
      </button>
    </Card>
  );
}
