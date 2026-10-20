import { gameContent } from '@cle/content';
import { type OwnedProperty, type TaxRegimeChoice, toDayNumber } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { type PropertyTab, useGame, useNav } from '../game/context.tsx';
import {
  agencyName,
  artisanName,
  bankName,
  format,
  formatDayLong,
  formatDecimal,
  formatDayYear,
  formatDuration,
  formatEuros,
  formatGameDate,
  formatPercent,
  formatShortDate,
  formatSigned,
  formatWhen,
  itemName,
  propertyLabel,
  spaceName,
  t,
  tone,
} from '../texts.ts';
import {
  Amount,
  Badge,
  Card,
  Chip,
  Empty,
  KeyValues,
  ScreenHeader,
  Segmented,
} from '../ui/components.tsx';
import { DpeCard } from '../ui/DpeCard.tsx';
import { ItemsList, ValueWhy } from '../ui/explain.tsx';
import { Facade } from '../ui/Facade.tsx';
import { LineChart } from '../ui/LineChart.tsx';

/** « Fiche d'un bien » (docs/04): overview, rooms, letting, finances. */
export function PropertyScreen({
  id,
  initialTab,
}: {
  id: string;
  initialTab?: PropertyTab | undefined;
}) {
  const { state } = useGame();
  const nav = useNav();
  const [tab, setTab] = useState<PropertyTab>(initialTab ?? 'overview');
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  if (!owned) {
    return (
      <div className="screen">
        <ScreenHeader title={t.assets.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader title={propertyLabel(owned.property)} onBack={nav.pop} />
      <Facade property={owned.property} owned height={130} />
      <Segmented<PropertyTab>
        label={t.property.tabs.overview}
        value={tab}
        onChange={setTab}
        options={(['overview', 'rooms', 'rental', 'finances', 'history'] as const).map((value) => ({
          value,
          label: t.property.tabs[value],
        }))}
      />
      {tab === 'overview' && <Overview owned={owned} />}
      {tab === 'rooms' && <Rooms owned={owned} />}
      {tab === 'rental' && <Rental owned={owned} />}
      {tab === 'finances' && <Finances owned={owned} />}
      {tab === 'history' && <History owned={owned} />}
    </div>
  );
}

function Overview({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const nav = useNav();
  const { property } = owned;
  const estimate = engine.estimate(state, property.id);
  const summary = engine.portfolio(state).properties.find((p) => p.propertyId === property.id);
  const isHome = state.player.homePropertyId === property.id;
  const canRent = !isHome && !owned.lease && !owned.sale?.agreement;

  return (
    <>
      <div className="row wrap">
        {summary && <Badge tone="teal">{t.assets.status[summary.status]}</Badge>}
        <span className="small muted">
          {format(t.property.bought, {
            price: formatEuros(owned.purchasePrice),
            date: formatGameDate(owned.purchaseDate),
          })}
        </span>
      </div>
      {estimate && (
        <Card>
          <Amount
            label={t.property.value}
            value={formatEuros(estimate.estimate)}
            whyTitle={t.value.heading}
            why={<ValueWhy breakdown={estimate.breakdown} />}
          />
          {summary && (
            <p className={`small strong ${tone(summary.cashFlow.net)}`}>
              {format(t.common.perMonth, { amount: formatSigned(summary.cashFlow.net) })}
            </p>
          )}
        </Card>
      )}
      <CoproMeetingCard owned={owned} />
      <DpeCard property={property} id={property.id} />
      <Transformations owned={owned} />
      <Card title={t.property.actions}>
        <div className="stack">
          {canRent && (
            <button
              type="button"
              className="button primary block"
              onClick={() => nav.push({ name: 'rent', id: property.id })}
            >
              {owned.rental
                ? format(t.property.seeCandidates, { count: owned.rental.applications.length })
                : t.property.rent}
            </button>
          )}
          {!owned.works?.transformation && (
            <button
              type="button"
              className="button block"
              onClick={() => nav.push({ name: 'works', id: property.id })}
            >
              {owned.works ? t.property.worksInProgress : t.property.works}
            </button>
          )}
          {!owned.works && (
            <button
              type="button"
              className="button block"
              onClick={() => nav.push({ name: 'sale', id: property.id })}
            >
              {owned.sale
                ? format(t.property.saleInProgress, { count: owned.sale.offers.length })
                : t.property.sell}
            </button>
          )}
          {isHome ? (
            <>
              <p className="small muted">{t.property.isHome}</p>
              <button
                type="button"
                className="button block"
                onClick={() => act({ type: 'home/moveOut' })}
              >
                {t.property.moveOut}
              </button>
            </>
          ) : (
            !owned.lease &&
            state.player.homePropertyId === null && (
              <button
                type="button"
                className="button block"
                onClick={() =>
                  window.confirm(t.property.moveInConfirm) &&
                  act({ type: 'home/moveIn', propertyId: property.id })
                }
              >
                {t.property.moveIn}
              </button>
            )
          )}
        </div>
      </Card>
    </>
  );
}

/** The value curve (feedback after milestone 8): value, purchase price and debt month by month. */
function ValueCurve({ owned }: { owned: OwnedProperty }) {
  const { state } = useGame();
  const texts = t.property.valueCurve;
  const history = owned.valueHistory;
  const value = engine.estimate(state, owned.property.id)?.estimate ?? owned.purchasePrice;
  const debt = state.loans
    .filter((loan) => loan.propertyId === owned.property.id)
    .reduce((sum, loan) => sum + loan.remaining, 0);
  const first = history[0];
  const last = history.at(-1);
  return (
    <Card title={texts.heading} testId="value-curve">
      <KeyValues
        rows={[
          { label: texts.value, value: formatEuros(value) },
          { label: texts.price, value: formatEuros(owned.purchasePrice) },
          {
            label: texts.gain,
            value: formatSigned(value - owned.purchasePrice),
            className: tone(value - owned.purchasePrice),
          },
          { label: texts.debt, value: formatEuros(debt) },
          { label: texts.equity, value: formatEuros(value - debt), total: true },
        ]}
      />
      {first && last && history.length >= 2 ? (
        <LineChart
          title={texts.chart}
          xLabels={[formatShortDate(first.date), formatShortDate(last.date)]}
          series={[
            { label: texts.value, color: '#0f6f68', values: history.map((p) => p.value) },
            {
              label: texts.price,
              color: '#8a7f6a',
              values: history.map(() => owned.purchasePrice),
              dashed: true,
            },
            { label: texts.debt, color: '#a33a2a', values: history.map((p) => p.debt) },
          ]}
        />
      ) : (
        <p className="small muted">{texts.soon}</p>
      )}
    </Card>
  );
}

const BUYOUT_STEP = 100_00;

/** « Départ négocié » (feedback after milestone 8): an indemnity for the tenant to leave. */
function BuyoutCard({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const terms = engine.buyoutTerms(state, owned.property.id);
  const rent = owned.lease?.monthlyRent ?? 0;
  const [amount, setAmount] = useState(() =>
    terms
      ? Math.round((((terms.months.min + terms.months.max) / 2) * rent) / BUYOUT_STEP) * BUYOUT_STEP
      : 0,
  );
  if (!terms || rent === 0) return null;
  const texts = t.buyout;
  const waiting = terms.retryDay !== null && toDayNumber(state.clock.date) < terms.retryDay;
  const max = Math.round((terms.months.max * 1.5 * rent) / BUYOUT_STEP) * BUYOUT_STEP;
  return (
    <Card title={texts.heading} testId="buyout">
      <p className="small">{texts.intro}</p>
      <p className="small muted">
        {format(texts.usual, {
          min: formatDecimal(terms.months.min),
          max: formatDecimal(terms.months.max),
          low: formatEuros(terms.months.min * rent),
          high: formatEuros(terms.months.max * rent),
        })}
      </p>
      {waiting && terms.retryDay !== null ? (
        <p className="small warning">
          {format(texts.wait, { when: formatWhen(terms.retryDay, state.clock.date) })}
        </p>
      ) : (
        <>
          <label className="field">
            <span className="field-label">{texts.amount}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              value={Math.round(amount / 100)}
              data-testid="buyout-amount"
              onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)))}
            />
            <input
              className="range"
              type="range"
              min={0}
              max={max}
              step={BUYOUT_STEP}
              value={Math.min(max, amount)}
              onChange={(e) => setAmount(Number(e.target.value))}
              aria-label={texts.amount}
            />
          </label>
          <p className="small muted">
            {format(texts.months, { months: formatDecimal(amount / rent) })}
          </p>
          <p className="tiny muted">
            {format(texts.cost, {
              duration: formatDuration(terms.minutes),
              points: terms.reputationPenalty,
            })}
          </p>
          <button
            type="button"
            className="button block"
            disabled={amount <= 0}
            onClick={() => act({ type: 'rent/buyout', propertyId: owned.property.id, amount })}
          >
            {format(texts.offer, { amount: formatEuros(amount) })}
          </button>
        </>
      )}
    </Card>
  );
}

/** The co-ownership's general meeting (docs/03-systemes/05): one vote per resolution. */
function CoproMeetingCard({ owned }: { owned: OwnedProperty }) {
  const { act } = useGame();
  const meeting = owned.coproMeeting;
  if (!meeting) return null;
  const texts = t.coproMeeting;
  const rules = gameContent.works.copro;
  const propertyId = owned.property.id;
  return (
    <Card title={texts.heading} testId="copro-meeting">
      <p className="small">
        {format(texts.when, {
          date: formatDayLong(meeting.voteDay),
          lots: owned.property.copro?.lots ?? 1,
        })}
      </p>
      <p className="small muted">
        {meeting.attended
          ? texts.attended
          : format(texts.attend, { duration: formatDuration(rules.attendMinutes) })}
      </p>
      <ul className="stack tight">
        {meeting.resolutions.map((resolution) => {
          const rule = rules.resolutions.find((r) => r.id === resolution.id);
          return (
            <li key={resolution.id} className="stack tight">
              <span className="strong">
                {gameContent.worksTexts.resolutions[resolution.id] ?? resolution.id}
              </span>
              <span className="small muted">
                {format(texts.share, {
                  amount: formatEuros(resolution.cost),
                  months: rule?.months ?? 0,
                })}
              </span>
              <div className="row wrap">
                {(['for', 'against'] as const).map((vote) => (
                  <Chip
                    key={vote}
                    pressed={resolution.vote === vote}
                    onClick={() =>
                      act({ type: 'copro/vote', propertyId, resolutionId: resolution.id, vote })
                    }
                  >
                    {texts[vote]}
                  </Chip>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {!meeting.attended && <p className="small muted">{texts.absent}</p>}
    </Card>
  );
}

/** « Transformer le bien » (milestone 8): the project manager's quotes, and the one under way. */
function Transformations({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const texts = t.transformation;
  const running = owned.works?.transformation;
  if (running) {
    return (
      <Card title={texts.heading} tint="amber" testId="transformation">
        <p className="small">
          {format(texts.inProgress, {
            kind: texts.kinds[running.kind],
            date: formatDayYear(running.endDay),
          })}
        </p>
      </Card>
    );
  }
  const options = engine
    .transformationOptions(state, owned.property.id)
    .flatMap((option) =>
      typeof option.estimate === 'string' ? [] : [{ kind: option.kind, ...option.estimate }],
    );
  if (options.length === 0) return null;
  return (
    <Card title={texts.heading} testId="transformation">
      <p className="small muted">{texts.intro}</p>
      {options.map((option) => (
        <div key={option.kind} className="stack tight">
          <p className="strong">{texts.kinds[option.kind]}</p>
          <p className="small">
            {format(texts.descriptions[option.kind], {
              count: option.quote.lots?.length ?? 1,
              surface: format(t.common.surface, { surface: option.quote.surfaceAfter }),
            })}
          </p>
          <KeyValues
            rows={[
              { label: texts.works, value: formatEuros(option.quote.works) },
              { label: texts.fee, value: formatEuros(option.quote.fee) },
              { label: texts.total, value: formatEuros(option.quote.total), total: true },
              { label: texts.valueAfter, value: formatEuros(option.valueAfter) },
            ]}
          />
          <p className="small muted">
            {format(texts.duration, { months: Math.round(option.quote.days / 30) })}
          </p>
          <button
            type="button"
            className="button block"
            onClick={() =>
              act({ type: 'works/transform', propertyId: owned.property.id, kind: option.kind })
            }
          >
            {texts.start}
          </button>
        </div>
      ))}
    </Card>
  );
}

function Rooms({ owned }: { owned: OwnedProperty }) {
  const { state } = useGame();
  const catalog = engine.worksCatalog(state, owned.property.id) ?? [];
  return (
    <Card>
      <ItemsList property={owned.property} items={catalog} />
    </Card>
  );
}

/** « 8 mois », « 2 ans et 3 mois » (a lease, from a number of days). */
function formatLeaseDuration(days: number): string {
  const months = Math.max(1, Math.round(days / 30.4));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 ? format(t.property.history.years, { count: years }) : '',
    rest > 0 ? format(t.property.history.months, { count: rest }) : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/** What happened to the property, most recent first: works, tenants, incidents. */
function History({ owned }: { owned: OwnedProperty }) {
  const texts = t.property.history;
  const tiers = gameContent.worksTexts.tiers;
  const tenantTexts = gameContent.tenantTexts;
  const entries = [...owned.log].reverse();
  const spent = owned.log.reduce(
    (sum, entry) => sum + (entry.kind === 'works' ? entry.cost : 0),
    0,
  );
  return (
    <Card title={texts.heading} testId="property-history">
      {entries.length === 0 && <p className="small muted">{texts.empty}</p>}
      <ul className="stack">
        {entries.map((entry, i) => (
          <li key={`${entry.day}-${entries.length - i}`} className="stack tight">
            <span className="row between small">
              <span className="strong">
                {entry.kind === 'works' &&
                  format(texts.works, {
                    item: entry.spaceId
                      ? `${spaceName(owned.property, entry.spaceId)} : ${itemName(entry.itemKind)}`
                      : itemName(entry.itemKind),
                    tier: tiers[entry.tier].toLowerCase(),
                  })}
                {entry.kind === 'tenantIn' &&
                  format(texts.tenantIn, {
                    name: entry.tenantName,
                    rent: formatEuros(entry.monthlyRent),
                  })}
                {entry.kind === 'tenantOut' &&
                  format(texts.tenantOut, {
                    name: entry.tenantName,
                    reason: texts.tenantReasons[entry.reason],
                  })}
                {entry.kind === 'incident' &&
                  format(texts.incident, {
                    text: tenantTexts.incidents[entry.kindId] ?? entry.kindId,
                    cost: formatEuros(entry.cost),
                  })}
              </span>
              <span className="tiny muted">{formatDayYear(entry.day)}</span>
            </span>
            {entry.kind === 'tenantOut' && (
              <>
                <span className="tiny muted">
                  {format(texts.tenantOutDetails, {
                    duration: formatLeaseDuration(entry.day - entry.startDay),
                    rent: formatEuros(entry.monthlyRent),
                  })}
                </span>
                {entry.depositReturned + entry.damages > 0 && (
                  <span className="tiny muted">
                    {format(texts.tenantOutMoney, {
                      returned: formatEuros(entry.depositReturned),
                      damages: formatEuros(entry.damages),
                    })}
                  </span>
                )}
              </>
            )}
            {entry.kind === 'works' && (
              <span className="tiny muted">
                {format(texts.worksBy, {
                  who: entry.artisanId ? artisanName(entry.artisanId) : texts.byYou,
                  cost: formatEuros(entry.cost),
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {spent > 0 && <p className="small">{format(texts.total, { amount: formatEuros(spent) })}</p>}
    </Card>
  );
}

function Rental({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const nav = useNav();
  const { lease, rental, property } = owned;
  if (!lease) {
    return (
      <Card>
        <p className="muted">{t.property.noLease}</p>
        {rental && (
          <p className="small">
            {format(t.property.rentalListed, {
              date: formatDayYear(rental.listedDay),
              rent: formatEuros(rental.monthlyRent),
            })}
          </p>
        )}
        {state.player.homePropertyId !== property.id && (
          <button
            type="button"
            className="button primary"
            onClick={() => nav.push({ name: 'rent', id: property.id })}
          >
            {rental
              ? format(t.property.seeCandidates, { count: rental.applications.length })
              : t.property.rent}
          </button>
        )}
      </Card>
    );
  }
  const { tenant } = lease;
  const tenantTexts = gameContent.tenantTexts;
  const incident = lease.incident;
  const incidentRule =
    incident && gameContent.renting.incidents.find((k) => k.id === incident.kindId);
  return (
    <>
      <Card
        title={t.property.lease}
        aside={<Badge tone="green">{t.property.leaseType[lease.leaseType]}</Badge>}
      >
        <div className="stack tight">
          <p className="strong">
            {tenant.firstName} {tenant.lastName}
          </p>
          <p className="small muted">
            {tenantTexts.profiles[tenant.profileId]} · {tenantTexts.traits[tenant.traitId]}
          </p>
        </div>
        <KeyValues
          rows={[
            { label: t.property.monthlyRent, value: formatEuros(lease.monthlyRent) },
            { label: t.property.leaseStart, value: formatDayYear(lease.startDay) },
            { label: t.property.term, value: formatDayYear(lease.termDay) },
            { label: t.property.satisfaction, value: `${Math.round(lease.satisfaction)} / 100` },
            { label: t.property.depositHeld, value: formatEuros(lease.deposit) },
            {
              label: t.property.management,
              value: lease.agencyId ? agencyName(lease.agencyId) : t.property.selfManaged,
            },
            { label: t.property.insured, value: lease.insured ? t.common.yes : t.common.no },
          ]}
        />
        {gameContent.renting.leaseTypes[lease.leaseType].shortTerm && (
          <button
            type="button"
            className="button block"
            onClick={() => act({ type: 'rent/withdraw', propertyId: property.id })}
          >
            {t.transformation.stopShortTerm}
          </button>
        )}
        {lease.noticeEndDay !== null && (
          <p className="small warning strong">
            {format(t.property.notice, { date: formatDayYear(lease.noticeEndDay) })}
          </p>
        )}
        {lease.arrears && (
          <p className="small negative strong">
            {format(t.property.arrears, {
              amount: formatEuros(lease.arrears.amount),
              months: lease.arrears.months,
            })}
          </p>
        )}
        {lease.arrears?.procedureEndDay != null && (
          <p className="small negative">
            {format(t.property.procedure, { date: formatDayYear(lease.arrears.procedureEndDay) })}
          </p>
        )}
      </Card>
      {incident && (
        <Card
          title={format(t.property.incident, {
            text: tenantTexts.incidents[incident.kindId] ?? '',
          })}
          tint="amber"
        >
          {incident.repair ? (
            <p className="small">
              {format(t.property.repairBooked, {
                date: formatDayYear(incident.repair.day),
                amount: formatEuros(incident.repair.cost),
              })}
            </p>
          ) : (
            <>
              <p className="small">
                {format(t.property.incidentDeadline, {
                  when: formatWhen(
                    incident.day + gameContent.renting.incidentPatienceDays,
                    state.clock.date,
                  ),
                })}
              </p>
              <div className="actions">
                {incidentRule?.selfRepair && (
                  <button
                    type="button"
                    className="button"
                    onClick={() =>
                      act({ type: 'rent/repair', propertyId: property.id, method: 'self' })
                    }
                  >
                    {t.property.repairSelf}
                  </button>
                )}
                <button
                  type="button"
                  className="button primary"
                  onClick={() =>
                    act({ type: 'rent/repair', propertyId: property.id, method: 'artisan' })
                  }
                >
                  {t.property.repairArtisan}
                </button>
              </div>
            </>
          )}
        </Card>
      )}
      <BuyoutCard owned={owned} />
      <Card title={t.property.changeManagement}>
        <select
          className="select"
          value={lease.agencyId ?? ''}
          onChange={(e) =>
            act({
              type: 'rent/manage',
              propertyId: property.id,
              agencyId: e.target.value === '' ? null : e.target.value,
            })
          }
        >
          <option value="">{t.rent.self}</option>
          {gameContent.renting.agencies.map((agency) => (
            <option key={agency.id} value={agency.id}>
              {agency.name} ·{' '}
              {format(t.rent.agencyFee, { fee: formatPercent(agency.feeShare * 100) })}
            </option>
          ))}
        </select>
      </Card>
    </>
  );
}

function Finances({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const flow = engine.cashFlow(state, owned.property.id);
  const loans = state.loans.filter((loan) => loan.propertyId === owned.property.id);
  const lines = t.property.lines;
  return (
    <>
      {flow && (
        <Card title={t.property.cashFlow}>
          <KeyValues
            rows={[
              { label: lines.rent, value: formatSigned(flow.rent) },
              { label: lines.recoverableCharges, value: formatSigned(flow.recoverableCharges) },
              { label: lines.charges, value: formatSigned(-flow.charges) },
              { label: lines.insurance, value: formatSigned(-flow.insurance) },
              { label: lines.managementFees, value: formatSigned(-flow.managementFees) },
              { label: lines.coproCalls, value: formatSigned(-flow.coproCalls) },
              { label: lines.propertyTax, value: formatSigned(-flow.propertyTax) },
              { label: lines.loanPayment, value: formatSigned(-flow.loanPayment) },
              {
                label: lines.net,
                value: formatSigned(flow.net),
                className: tone(flow.net),
                total: true,
              },
            ]}
          />
        </Card>
      )}
      <ValueCurve owned={owned} />
      <Card title={t.property.loan}>
        {loans.length === 0 && <p className="small muted">{t.property.noLoan}</p>}
        {loans.map((loan) => (
          <div key={loan.id} className="stack tight">
            <p className="small strong">
              {format(t.property.loanLine, {
                bank: bankName(loan.bankId),
                rate: formatPercent(loan.ratePercent),
                amount: formatEuros(loan.remaining),
              })}
            </p>
            {flow && (
              <p className="small muted">
                {format(t.property.loanInterest, { amount: formatEuros(flow.loanInterest) })}
              </p>
            )}
          </div>
        ))}
      </Card>
      <Card title={t.property.purchase}>
        <KeyValues
          rows={[
            { label: t.financing.price, value: formatEuros(owned.purchasePrice) },
            { label: t.property.purchaseCost, value: formatEuros(owned.acquisitionCost) },
            ...(owned.worksFund
              ? [
                  {
                    label: t.property.worksFund,
                    value: format(t.property.worksFundUntil, {
                      amount: formatEuros(owned.worksFund.amount),
                      date: formatDayYear(owned.worksFund.untilDay),
                    }),
                  },
                ]
              : []),
          ]}
        />
      </Card>
      <Card title={t.property.taxRegime}>
        <select
          className="select"
          value={owned.taxRegime}
          onChange={(e) =>
            act(
              {
                type: 'tax/setRegime',
                propertyId: owned.property.id,
                regime: e.target.value as TaxRegimeChoice,
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
      </Card>
    </>
  );
}
