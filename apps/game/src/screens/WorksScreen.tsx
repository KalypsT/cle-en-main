import { gameContent } from '@cle/content';
import {
  type CatalogItem,
  type ItemChoice,
  itemId,
  type OwnedProperty,
  type Tier,
  TIERS,
  type Trade,
} from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  artisanName,
  format,
  formatDayYear,
  formatDuration,
  formatEuros,
  formatPercent,
  formatSigned,
  formatWhen,
  itemName,
  propertyLabel,
  spaceName,
  t,
  texts,
  tradeName,
} from '../texts.ts';
import {
  Badge,
  Card,
  DpeLetter,
  Empty,
  KeyValues,
  ScreenHeader,
  StateDots,
  Switch,
} from '../ui/components.tsx';
import { Facade } from '../ui/Facade.tsx';

interface Choice {
  tier: Tier;
  diy: boolean;
}

/** « Chantier » (docs/03-systemes/05): plan, quotes, schedule, hazards, DPE before and after. */
export function WorksScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  if (!owned) {
    return (
      <div className="screen">
        <ScreenHeader title={t.works.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader title={t.works.heading} onBack={nav.pop} />
      <Facade property={owned.property} owned height={110} />
      <p className="strong">{propertyLabel(owned.property)}</p>
      {owned.works ? <WorksInProgress owned={owned} /> : <WorksPlanner owned={owned} />}
    </div>
  );
}

function Schedule({
  owned,
  quoteIds,
  diy,
}: {
  owned: OwnedProperty;
  quoteIds?: string[];
  diy?: ItemChoice[];
}) {
  const { state } = useGame();
  const plan = engine.worksPlan(state, owned.property.id, quoteIds, diy) ?? [];
  const tasks = owned.works?.tasks ?? [];
  if (plan.length === 0) return null;
  return (
    <Card title={t.works.schedule} testId="works-schedule">
      <ol className="stack">
        {plan.map((task) => {
          const running = tasks.find((candidate) => candidate.id === task.taskId);
          return (
            <li key={task.taskId} className="stack tight">
              <div className="row between">
                <span className="strong small">
                  {format(t.works.task, {
                    trade: tradeName(task.trade),
                    who: task.artisanId ? artisanName(task.artisanId) : t.works.self,
                  })}
                </span>
                <Badge
                  tone={
                    task.status === 'done'
                      ? 'green'
                      : task.status === 'running'
                        ? 'teal'
                        : undefined
                  }
                >
                  {t.works.taskStatus[task.status]}
                </Badge>
              </div>
              <span className="tiny muted">
                {format(t.works.taskDates, {
                  start: formatDayYear(task.startDay),
                  end: formatDayYear(task.endDay),
                })}
                {' · '}
                {task.itemIds
                  .map((id) => {
                    const item = owned.property.items.find((candidate) => itemId(candidate) === id);
                    if (!item) return id;
                    const room = item.spaceId
                      ? `${spaceName(owned.property, item.spaceId)} : `
                      : '';
                    return `${room}${itemName(item.kind)}`;
                  })
                  .join(', ')}
              </span>
              {running && running.artisanId === null && (
                <span className="tiny muted">
                  {format(t.works.diyProgress, {
                    done: formatDuration(running.minutesDone),
                    needed: formatDuration(running.minutesNeeded),
                  })}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function WorksInProgress({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const project = owned.works;
  if (!project) return null;
  const hazard = project.hazard;
  return (
    <>
      <Card title={t.works.inProgress}>
        <KeyValues
          rows={[
            { label: t.works.dpeBefore, value: <DpeLetter dpe={project.dpeBefore} /> },
            { label: t.works.paid, value: formatEuros(project.paid) },
            ...(owned.worksFund
              ? [{ label: t.property.worksFund, value: formatEuros(owned.worksFund.amount) }]
              : []),
          ]}
        />
      </Card>
      {hazard && (
        <Card title={t.works.hazard} tint="amber" testId="works-hazard">
          <p className="small">
            {format(t.works.hazardText, {
              text: gameContent.worksTexts.hazards[hazard.hazardId] ?? '',
              amount: formatEuros(hazard.cost),
              days: hazard.days,
              date: formatDayYear(hazard.deadlineDay),
            })}
          </p>
          <div className="stack">
            <button
              type="button"
              className="button primary"
              onClick={() =>
                act({ type: 'works/hazard', propertyId: owned.property.id, choice: 'treat' })
              }
            >
              {t.works.treat}
            </button>
            <div className="actions">
              <button
                type="button"
                className="button"
                onClick={() =>
                  act({ type: 'works/hazard', propertyId: owned.property.id, choice: 'eco' })
                }
              >
                {t.works.eco}
              </button>
              <button
                type="button"
                className="button"
                onClick={() =>
                  act({ type: 'works/hazard', propertyId: owned.property.id, choice: 'postpone' })
                }
              >
                {t.works.postpone}
              </button>
            </div>
          </div>
          <p className="tiny muted">{formatWhen(hazard.deadlineDay, state.clock.date)}</p>
        </Card>
      )}
      <Schedule owned={owned} />
    </>
  );
}

function ItemRow({
  item,
  choice,
  occupied,
  onChange,
}: {
  item: CatalogItem;
  choice: Choice | undefined;
  occupied: boolean;
  onChange: (choice: Choice | undefined) => void;
}) {
  const states = gameContent.worksTexts.states;
  const blocked = occupied && !item.occupied;
  return (
    <div className="stack tight works-item">
      <div className="row between small">
        <span className="strong">{itemName(item.kind)}</span>
        {item.state !== null && (
          <span className="row" style={{ gap: 8 }}>
            <span className="tiny muted">{states[item.state - 1]}</span>
            <StateDots state={item.state} />
          </span>
        )}
      </div>
      <select
        className="select"
        value={choice?.tier ?? ''}
        disabled={blocked}
        aria-label={itemName(item.kind)}
        onChange={(e) =>
          onChange(
            e.target.value === ''
              ? undefined
              : { tier: e.target.value as Tier, diy: choice?.diy ?? false },
          )
        }
      >
        <option value="">{t.works.none}</option>
        {TIERS.map((tier) => (
          <option key={tier} value={tier}>
            {format(t.works.tierPrice, {
              tier: gameContent.worksTexts.tiers[tier],
              amount: formatEuros(item.tiers[tier].cost),
            })}
          </option>
        ))}
      </select>
      {choice && item.diy?.allowed && (
        <Switch
          label={t.works.diy}
          hint={format(t.works.diyLine, {
            item: itemName(item.kind),
            duration: formatDuration(item.diy.tiers[choice.tier].minutes),
            amount: formatEuros(item.diy.tiers[choice.tier].materials),
          })}
          checked={choice.diy}
          onChange={(diy) => onChange({ ...choice, diy })}
        />
      )}
    </div>
  );
}

function WorksPlanner({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const { property } = owned;
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selectedQuotes, setSelectedQuotes] = useState<string[]>([]);
  const catalog = (engine.worksCatalog(state, property.id) ?? []).filter(
    (item) => item.trade !== null,
  );
  const occupied = owned.lease !== null;
  const chosen: ItemChoice[] = Object.entries(choices).map(([itemId, c]) => ({
    itemId,
    tier: c.tier,
  }));
  const diy = Object.entries(choices)
    .filter(([, c]) => c.diy)
    .map(([itemId, c]) => ({ itemId, tier: c.tier }));
  const estimate = chosen.length > 0 ? engine.worksEstimate(state, property.id, chosen) : null;
  const artisans = engine.artisans(state, property.cityId);
  const today = state.clock.date;
  const quotes = owned.quotes;

  // Items to quote, by trade: the chosen ones not done oneself.
  const byTrade = new Map<Trade, ItemChoice[]>();
  for (const item of catalog) {
    const choice = choices[item.id];
    if (!choice || choice.diy || !item.trade) continue;
    byTrade.set(item.trade, [
      ...(byTrade.get(item.trade) ?? []),
      { itemId: item.id, tier: choice.tier },
    ]);
  }

  const groups = new Map<string | null, CatalogItem[]>();
  for (const item of catalog) groups.set(item.spaceId, [...(groups.get(item.spaceId) ?? []), item]);

  const toggleQuote = (quoteId: string) =>
    setSelectedQuotes((current) =>
      current.includes(quoteId) ? current.filter((q) => q !== quoteId) : [...current, quoteId],
    );
  const liveQuotes = selectedQuotes.filter((q) => quotes.some((quote) => quote.id === q));

  const start = () => {
    if (
      act(
        { type: 'works/start', propertyId: property.id, quoteIds: liveQuotes, diy },
        t.works.started,
      )
    ) {
      setChoices({});
      setSelectedQuotes([]);
    }
  };

  return (
    <>
      <Card title={t.works.plan}>
        <p className="small muted">{occupied ? t.works.occupiedHint : t.works.planHint}</p>
        {[...groups].map(([spaceId, items]) => (
          <details key={spaceId ?? 'dwelling'} className="items-group">
            <summary className="row between">
              <span className="h3">
                {spaceId ? spaceName(property, spaceId) : t.property.element}
              </span>
              <span className="tiny muted">
                {format(t.works.selected, {
                  count: items.filter((item) => choices[item.id]).length,
                })}
              </span>
            </summary>
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                choice={choices[item.id]}
                occupied={occupied}
                onChange={(choice) =>
                  setChoices((current) =>
                    Object.fromEntries([
                      ...Object.entries(current).filter(([key]) => key !== item.id),
                      ...(choice ? [[item.id, choice] as const] : []),
                    ]),
                  )
                }
              />
            ))}
          </details>
        ))}
      </Card>

      {estimate && (
        <Card title={t.works.estimate} testId="works-estimate">
          <KeyValues
            rows={[
              { label: t.works.referenceCost, value: formatEuros(estimate.cost) },
              { label: t.works.days, value: format(t.works.daysValue, { days: estimate.days }) },
              {
                label: t.works.dpeAfter,
                value: (
                  <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <DpeLetter dpe={estimate.dpeBefore} />→<DpeLetter dpe={estimate.dpeAfter} />
                  </span>
                ),
              },
              {
                label: t.works.valueAfter,
                value: `${formatEuros(estimate.valueAfter)} (${formatSigned(estimate.valueAfter - estimate.valueBefore)})`,
              },
              {
                label: t.works.rentAfter,
                value: `${formatEuros(estimate.rentAfter)} (${formatSigned(estimate.rentAfter - estimate.rentBefore)})`,
              },
            ]}
          />
          {estimate.blockAfter && (
            <p className="small negative">
              {t.works.stillBlocked} {texts.refusals[estimate.blockAfter]}
            </p>
          )}
        </Card>
      )}

      <Card title={t.works.quotes}>
        <p className="small muted">
          {format(t.works.quotesHint, {
            duration: formatDuration(gameContent.works.quotes.minutes),
          })}
        </p>
        {[...byTrade].map(([trade, items]) => (
          <div key={trade} className="stack tight">
            <span className="strong small">{tradeName(trade)}</span>
            <div className="row wrap">
              {artisans
                .filter((entry) => entry.artisan.trade === trade)
                .map(({ artisan }) => (
                  <button
                    key={artisan.id}
                    type="button"
                    className="button small"
                    onClick={() =>
                      act({
                        type: 'works/quote',
                        propertyId: property.id,
                        artisanId: artisan.id,
                        items,
                      })
                    }
                  >
                    {format(t.works.askQuoteTo, { artisan: artisan.name })}
                  </button>
                ))}
            </div>
          </div>
        ))}
        {byTrade.size === 0 && <p className="small muted">{t.works.noItemsForTrade}</p>}
        <hr className="divider" />
        {quotes.length === 0 && <p className="small muted">{t.works.noQuote}</p>}
        {quotes.map((quote) => (
          <label
            key={quote.id}
            className={`option-card${liveQuotes.includes(quote.id) ? ' selected' : ''}`}
            data-testid="quote"
          >
            <span className="row between">
              <span className="strong">{artisanName(quote.artisanId)}</span>
              <input
                type="checkbox"
                checked={liveQuotes.includes(quote.id)}
                onChange={() => toggleQuote(quote.id)}
              />
            </span>
            <span className="small">
              {format(t.works.quoteLine, {
                total: formatEuros(quote.total),
                when: formatWhen(quote.availableDay, today),
                expires: formatWhen(quote.expiresDay, today),
              })}
            </span>
            <span className="tiny muted">
              {format(t.works.quoteItems, { count: quote.items.length, days: quote.days })}
            </span>
          </label>
        ))}
      </Card>

      {(liveQuotes.length > 0 || diy.length > 0) && (
        <>
          <Schedule owned={owned} quoteIds={liveQuotes} diy={diy} />
          <p className="small muted">
            {format(t.works.startHint, {
              share: formatPercent(gameContent.works.quotes.depositShare * 100),
            })}
          </p>
          {owned.worksFund && (
            <p className="small">
              {format(t.works.worksFund, { amount: formatEuros(owned.worksFund.amount) })}
            </p>
          )}
          <button type="button" className="button primary block" onClick={start}>
            {t.works.start}
          </button>
        </>
      )}
      {diy.length > 0 && <p className="tiny muted">{t.works.diyHint}</p>}
    </>
  );
}
