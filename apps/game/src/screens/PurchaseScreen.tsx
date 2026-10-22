import { gameContent } from '@cle/content';
import { type LoanApplication, type Purchase, toDayNumber } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankName,
  format,
  formatDayYear,
  formatEuros,
  formatPercent,
  formatWhen,
  propertyLabel,
  t,
} from '../texts.ts';
import {
  Badge,
  BottomSheet,
  Card,
  Empty,
  KeyValues,
  ScreenHeader,
  Segmented,
  Why,
} from '../ui/components.tsx';
import { RateWhy } from '../ui/explain.tsx';
import { Facade } from '../ui/Facade.tsx';
import { durationChoices, loanVerdict } from '../ui/FinancingPanel.tsx';

/** A purchase under compromis: loan applications, then the deed (docs/03-systemes/03). */
export function PurchaseScreen({ id }: { id: string }) {
  const { state, act } = useGame();
  const nav = useNav();
  const [requesting, setRequesting] = useState(false);
  const purchase = state.purchases.find((candidate) => candidate.id === id);

  if (!purchase) {
    return (
      <div className="screen">
        <ScreenHeader title={t.purchase.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }

  const today = toDayNumber(state.clock.date);
  const chosen = purchase.acceptedApplicationId !== null || purchase.cash;
  const canWithdraw = !chosen && today < purchase.loanDeadlineDay;
  const waiting = purchase.applications.some((a) => a.decision === null);
  const due = engine.cashDueAtDeed(state, purchase.id) ?? 0;

  const withdraw = () => {
    if (window.confirm(t.purchase.withdrawConfirm)) {
      if (act({ type: 'purchase/withdraw', purchaseId: purchase.id }, t.purchase.withdrawn))
        nav.pop();
    }
  };
  const payCash = () => {
    // Without a chosen loan, the engine's cash due is the price and notary fees, deposit deducted.
    if (window.confirm(format(t.purchase.payCashConfirm, { amount: formatEuros(due) }))) {
      act({ type: 'purchase/payCash', purchaseId: purchase.id });
    }
  };

  return (
    <div className="screen">
      <ScreenHeader title={t.purchase.heading} onBack={nav.pop} />
      <Facade property={purchase.property} height={120} />
      <div className="stack tight">
        <h2 className="h1">{propertyLabel(purchase.property)}</h2>
        <p className="strong">
          {format(t.purchase.compromis, { price: formatEuros(purchase.price) })}
        </p>
      </div>
      <Card>
        <KeyValues
          rows={[
            { label: t.purchase.deposit, value: formatEuros(purchase.deposit) },
            {
              label: t.purchase.loanDeadline,
              value: chosen
                ? t.common.none
                : format(t.common.until, { date: formatDayYear(purchase.loanDeadlineDay) }),
            },
            { label: t.purchase.deed, value: formatDayYear(purchase.deedDay) },
            {
              label: t.purchase.cashDue,
              value: formatEuros(due),
              className: chosen && due > state.player.balance ? 'negative' : '',
              total: true,
            },
          ]}
        />
        {chosen && (
          <p className={`small strong ${due > state.player.balance ? 'negative' : 'positive'}`}>
            {due > state.player.balance
              ? format(t.purchase.cashMissing, { amount: formatEuros(due - state.player.balance) })
              : t.purchase.cashOk}
          </p>
        )}
      </Card>

      <Card title={t.purchase.buyer} testId="purchase-buyer">
        {state.company ? (
          <Segmented
            label={t.purchase.buyer}
            options={(['player', 'company'] as const).map((holder) => ({
              value: holder,
              label: t.purchase.buyers[holder],
            }))}
            value={purchase.holder}
            onChange={(holder) =>
              act({ type: 'purchase/setHolder', purchaseId: purchase.id, holder })
            }
          />
        ) : (
          <p className="small muted">{t.purchase.noCompany}</p>
        )}
        <p className="small muted">
          {purchase.applications.length > 0 || chosen
            ? t.purchase.buyerLocked
            : t.purchase.buyerHint}
        </p>
      </Card>

      <Card
        title={t.purchase.applications}
        aside={purchase.cash && <Badge tone="accent">{t.purchase.cash}</Badge>}
      >
        {purchase.applications.length === 0 && (
          <p className="small muted">{t.purchase.noApplication}</p>
        )}
        {purchase.applications.map((application) => (
          <ApplicationRow key={application.id} purchase={purchase} application={application} />
        ))}
        {!chosen && (
          <button
            type="button"
            className="button primary block"
            data-tutorial="loan"
            onClick={() => setRequesting(true)}
            disabled={today >= purchase.loanDeadlineDay}
          >
            {t.purchase.request}
          </button>
        )}
      </Card>

      {!chosen && (
        <div className="stack">
          {!waiting && (
            <button type="button" className="button block" onClick={payCash}>
              {t.purchase.payCash}
            </button>
          )}
          {canWithdraw && (
            <button type="button" className="button danger block" onClick={withdraw}>
              {t.purchase.withdraw}
            </button>
          )}
        </div>
      )}
      {chosen && <p className="small muted">{t.purchase.bound}</p>}

      {requesting && <LoanRequestSheet purchase={purchase} onClose={() => setRequesting(false)} />}
    </div>
  );
}

function ApplicationRow({
  purchase,
  application,
}: {
  purchase: Purchase;
  application: LoanApplication;
}) {
  const { state, act } = useGame();
  const decision = application.decision;
  const accepted = purchase.acceptedApplicationId === application.id;
  let text: string;
  let tone = '';
  if (!decision) {
    text = format(t.purchase.pending, {
      when: formatWhen(application.responseDay, state.clock.date),
    });
  } else if (decision.decision === 'refused') {
    tone = 'negative';
    text = format(t.purchase.refused, {
      reason: format(t.financing.loanRefusals[decision.reason], {
        ratio: formatPercent((decision.debtRatioAfter ?? 0) * 100),
      }),
    });
  } else {
    tone = 'positive';
    text = format(t.purchase[decision.decision], {
      amount: formatEuros(decision.offer.amount),
      rate: formatPercent(decision.offer.ratePercent),
      years: decision.offer.durationYears,
    });
  }
  const offer = decision && decision.decision !== 'refused' ? decision.offer : null;
  return (
    <div className="card flat" data-testid={`application-${application.bankId}`}>
      <div className="row between">
        <span className="strong">{bankName(application.bankId)}</span>
        {accepted && (
          <Badge tone="green" icon="check">
            {t.purchase.chosen}
          </Badge>
        )}
      </div>
      <p className={`small ${tone}`}>{text}</p>
      {offer && (
        <div className="row between small">
          <span>{format(t.purchase.monthly, { amount: formatEuros(offer.monthlyPayment) })}</span>
          <Why title={t.financing.rateWhy}>
            <RateWhy quote={offer.rate} />
          </Why>
        </div>
      )}
      {offer && !purchase.acceptedApplicationId && !purchase.cash && (
        <button
          type="button"
          className="button primary"
          data-tutorial="acceptLoan"
          onClick={() =>
            act({
              type: 'purchase/acceptLoan',
              purchaseId: purchase.id,
              applicationId: application.id,
            })
          }
        >
          {t.purchase.accept}
        </button>
      )}
    </div>
  );
}

function LoanRequestSheet({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { state, act } = useGame();
  const [bankId, setBankId] = useState(gameContent.start.accountBankId);
  const [years, setYears] = useState(20);
  const [works, setWorks] = useState(0);
  const [amount, setAmount] = useState<number | null>(null);
  const sim = engine.simulateFinancing(state, purchase.id, { bankId, durationYears: years, works });
  const requested = amount ?? sim?.loanAmount ?? purchase.price;
  const preview = engine.simulateFinancing(state, purchase.id, {
    bankId,
    durationYears: years,
    works,
    amount: requested,
  });
  const verdict = preview ? loanVerdict(preview.decision) : null;
  const withWorks = works > 0;

  const send = () => {
    const events = act(
      {
        type: 'purchase/requestLoan',
        purchaseId: purchase.id,
        bankId,
        amount: requested,
        durationYears: years,
        works,
      },
      format(t.purchase.sent, { bank: bankName(bankId) }),
    );
    if (events) onClose();
  };

  return (
    <BottomSheet title={t.purchase.requestHeading} onClose={onClose}>
      <label className="field">
        <span className="field-label">{t.financing.bank}</span>
        <select className="select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          {gameContent.banks.map((bank) => (
            <option key={bank.id} value={bank.id}>
              {bank.name} · {bank.banker.name}
            </option>
          ))}
        </select>
        <span className="small muted">
          {gameContent.banks.find((b) => b.id === bankId)?.policy}
        </span>
      </label>
      <label className="field">
        <span className="field-label">{t.purchase.worksPart}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          value={Math.round(works / 100)}
          onChange={(e) => {
            setWorks(Math.max(0, Math.round(Number(e.target.value) * 100)));
            setAmount(null);
          }}
        />
        <span className="small muted">{t.purchase.worksHint}</span>
      </label>
      <label className="field">
        <span className="field-label">{t.financing.duration}</span>
        <select className="select" value={years} onChange={(e) => setYears(Number(e.target.value))}>
          {durationChoices(withWorks).map((y) => (
            <option key={y} value={y}>
              {format(t.common.years, { years: y })}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">{t.purchase.amount}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          data-testid="loan-amount"
          value={Math.round(requested / 100)}
          onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)))}
        />
      </label>
      {preview && (
        <KeyValues
          rows={[
            { label: t.financing.fees, value: formatEuros(preview.notaryFees + preview.bankFees) },
            { label: t.financing.contribution, value: formatEuros(preview.contribution) },
            {
              label: format(t.financing.monthly, {
                rate: formatPercent(preview.rate.ratePercent),
                years,
              }),
              value: formatEuros(preview.monthlyPayment),
              total: true,
            },
          ]}
        />
      )}
      {verdict && <p className={`small strong ${verdict.tone}`}>{verdict.text}</p>}
      <button type="button" className="button primary block" onClick={send}>
        {t.purchase.send}
      </button>
    </BottomSheet>
  );
}
