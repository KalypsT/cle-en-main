import { gameContent } from '@cle/content';
import type { FinancingSimulation, LoanDecision } from '@cle/engine';
import { useEffect, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { bankName, format, formatEuros, formatPercent, formatSigned, t, tone } from '../texts.ts';
import { Amount, Card, KeyValues } from './components.tsx';
import { RateWhy } from './explain.tsx';

/** Step of the contribution slider, in cents (presentation only). */
const CONTRIBUTION_STEP = 500_00;

export function durationChoices(withWorks: boolean): number[] {
  const { minDurationYears, maxDurationYears, maxDurationWithWorksYears } = gameContent.credit;
  const max = withWorks ? maxDurationWithWorksYears : maxDurationYears;
  const years: number[] = [];
  for (let y = minDurationYears; y <= max; y++) if (y % 5 === 0 || y === max) years.push(y);
  return years;
}

export function loanVerdict(decision: LoanDecision): { text: string; tone: string } {
  switch (decision.decision) {
    case 'accepted':
      return { text: t.financing.verdictAccepted, tone: 'positive' };
    case 'counterOffer':
      return {
        text: format(t.financing.verdictCounter, { years: decision.offer.durationYears }),
        tone: 'warning',
      };
    case 'partial':
      return {
        text: format(t.financing.verdictPartial, { amount: formatEuros(decision.offer.amount) }),
        tone: 'warning',
      };
    case 'refused':
      return {
        text: format(t.financing.verdictRefused, {
          reason: format(t.financing.loanRefusals[decision.reason], {
            ratio: formatPercent((decision.debtRatioAfter ?? 0) * 100),
          }),
        }),
        tone: 'negative',
      };
  }
}

/** « Financement simulé » of a listing (docs/04): every amount comes from the engine. */
export function FinancingPanel({
  listingId,
  askingPrice,
}: {
  listingId: string;
  askingPrice: number;
}) {
  const { state } = useGame();
  const nav = useNav();
  const [open, setOpen] = useState(false);
  const [bankId, setBankId] = useState(gameContent.start.accountBankId);
  // Same length as the « Cash-flow prévu » above it.
  const [years, setYears] = useState(gameContent.yvon.thresholds.outlookYears);
  const [contribution, setContribution] = useState<number | null>(null);

  useEffect(() => {
    if (open) nav.track('financing');
    // Only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="button block"
        data-tutorial="financing"
        onClick={() => setOpen(true)}
      >
        {t.financing.open}
      </button>
    );
  }

  const base = engine.simulateFinancing(state, listingId, { bankId, durationYears: years });
  if (!base) return null;
  const minContribution = base.minContribution;
  const maxContribution = Math.max(
    minContribution,
    Math.min(Math.max(0, state.player.balance), askingPrice + base.notaryFees + base.bankFees),
  );
  const chosen = Math.min(
    maxContribution,
    Math.max(minContribution, contribution ?? minContribution),
  );
  const sim: FinancingSimulation =
    engine.simulateFinancing(state, listingId, {
      bankId,
      durationYears: years,
      contribution: chosen,
    }) ?? base;
  const verdict = loanVerdict(sim.decision);

  return (
    <Card title={t.financing.heading} testId="financing">
      <div className="grid-2">
        <label className="field">
          <span className="field-label">{t.financing.bank}</span>
          <select className="select" value={bankId} onChange={(e) => setBankId(e.target.value)}>
            {gameContent.banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bankName(bank.id)}
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
            {durationChoices(false).map((y) => (
              <option key={y} value={y}>
                {format(t.common.years, { years: y })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">
          {t.financing.contribution} : {formatEuros(chosen)}
        </span>
        <input
          className="range"
          type="range"
          min={minContribution}
          max={maxContribution}
          step={CONTRIBUTION_STEP}
          value={chosen}
          onChange={(e) => setContribution(Number(e.target.value))}
        />
      </label>
      <div className="grid-2">
        <Amount
          label={t.financing.contributionAndFees}
          value={formatEuros(sim.contribution)}
          why={
            <KeyValues
              rows={[
                { label: t.financing.price, value: formatEuros(sim.price) },
                { label: t.financing.fees, value: formatEuros(sim.notaryFees + sim.bankFees) },
                { label: t.financing.loanAmount, value: formatEuros(sim.loanAmount) },
                {
                  label: t.financing.contribution,
                  value: formatEuros(sim.contribution),
                  total: true,
                },
              ]}
            />
          }
        />
        <Amount
          label={format(t.financing.monthly, {
            rate: formatPercent(sim.rate.ratePercent),
            years: sim.durationYears,
          })}
          value={formatEuros(sim.monthlyPayment)}
          testId="financing-monthly"
          whyTitle={t.financing.rateWhy}
          why={<RateWhy quote={sim.rate} />}
        />
        <Amount label={t.financing.rent} value={formatEuros(sim.rent)} />
        <Amount
          label={t.financing.netEffort}
          value={formatSigned(sim.netEffort)}
          className={tone(sim.netEffort)}
          why={
            <div className="stack">
              <p className="small muted">{t.financing.netEffortHint}</p>
              <KeyValues
                rows={[
                  { label: t.property.lines.rent, value: formatSigned(sim.rent) },
                  {
                    label: t.property.lines.recoverableCharges,
                    value: formatSigned(sim.recoverableCharges),
                  },
                  { label: t.rent.ownerCosts, value: formatSigned(-sim.ownerCosts) },
                  { label: t.property.lines.loanPayment, value: formatSigned(-sim.monthlyPayment) },
                  { label: t.financing.netEffort, value: formatSigned(sim.netEffort), total: true },
                ]}
              />
            </div>
          }
        />
      </div>
      <hr className="divider" />
      <div className="row between">
        <span className="muted">{t.financing.cashAfter}</span>
        <span className={`strong ${sim.cashAfter < 0 ? 'negative' : ''}`}>
          {formatEuros(sim.cashAfter)}
        </span>
      </div>
      <p className={`small strong ${verdict.tone}`}>{verdict.text}</p>
    </Card>
  );
}
