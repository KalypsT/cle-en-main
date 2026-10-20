import { gameContent } from '@cle/content';
import {
  type CatalogItem,
  type ItemChoice,
  type OwnedProperty,
  type Tier,
  TIERS,
  type Trade,
  toDayNumber,
} from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  artisanName,
  format,
  formatDayLong,
  formatDecimal,
  formatDuration,
  formatEuros,
  formatPercent,
  formatWhen,
  itemName,
  propertyLabel,
  spaceName,
  t,
  tradeName,
} from '../texts.ts';
import {
  Badge,
  Card,
  Empty,
  KeyValues,
  ScreenHeader,
  Segmented,
  StateDots,
  Switch,
} from '../ui/components.tsx';

/** What the player picked for one item: its tier, and whether he does it himself. */
interface Pick {
  tier: Tier;
  diy: boolean;
}

/**
 * « Chantier » (docs/04, 4.5; docs/03-systemes/05): the items to renovate and their tier, the
 * artisans' quotes, the items done oneself, the project manager; then the project under way,
 * its schedule and its hazard.
 */
export function WorksScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((o) => o.property.id === id);
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
      <p className="small muted">{propertyLabel(owned.property)}</p>
      {owned.works ? <Running owned={owned} /> : <Planner owned={owned} />}
    </div>
  );
}

function Planner({ owned }: { owned: OwnedProperty }) {
  const { state } = useGame();
  const propertyId = owned.property.id;
  const catalog = (engine.worksCatalog(state, propertyId) ?? []).filter((item) => item.trade);
  const [picks, setPicks] = useState<Map<string, Pick>>(() => new Map());
  const today = toDayNumber(state.clock.date);
  const quotes = owned.quotes.filter((quote) => quote.expiresDay > today);
  const [chosenQuotes, setChosenQuotes] = useState<Set<string> | null>(null);
  // Every valid quote is taken until the player unticks one.
  const taken = chosenQuotes ?? new Set(quotes.map((quote) => quote.id));

  if (catalog.length === 0) return <Empty icon="wrench">{t.works.nothing}</Empty>;

  const setPick = (itemId: string, pick: Pick | null) =>
    setPicks((all) => {
      const next = new Map(all);
      if (pick) next.set(itemId, pick);
      else next.delete(itemId);
      return next;
    });
  const choices: ItemChoice[] = [...picks].map(([itemId, pick]) => ({ itemId, tier: pick.tier }));
  const diy = [...picks]
    .filter(([, pick]) => pick.diy)
    .map(([itemId, pick]) => ({ itemId, tier: pick.tier }));
  const estimate = choices.length > 0 ? engine.worksEstimate(state, propertyId, choices) : null;

  return (
    <>
      <Card title={t.works.choose}>
        <p className="small muted">{t.works.chooseHint}</p>
        <ItemPicker owned={owned} catalog={catalog} picks={picks} onPick={setPick} />
      </Card>
      {estimate && (
        <Card title={t.works.summary}>
          <KeyValues
            rows={[
              { label: t.works.cost, value: formatEuros(estimate.cost) },
              {
                label: t.works.days,
                value: format(t.works.daysValue, { days: estimate.days }),
              },
              {
                label: t.works.dpe,
                value: format(t.works.dpeValue, {
                  before: estimate.dpeBefore,
                  after: estimate.dpeAfter,
                }),
              },
              {
                label: t.works.value,
                value: format(t.works.change, {
                  before: formatEuros(estimate.valueBefore),
                  after: formatEuros(estimate.valueAfter),
                }),
              },
              {
                label: t.works.rent,
                value: format(t.works.change, {
                  before: formatEuros(estimate.rentBefore),
                  after: formatEuros(estimate.rentAfter),
                }),
              },
            ]}
          />
          {estimate.blockAfter && <p className="small negative">{t.works.stillBlocked}</p>}
        </Card>
      )}
      <QuoteRequests owned={owned} catalog={catalog} picks={picks} />
      <Launch
        owned={owned}
        quotes={quotes}
        taken={taken}
        onToggle={(quoteId) => {
          const next = new Set(taken);
          if (next.has(quoteId)) next.delete(quoteId);
          else next.add(quoteId);
          setChosenQuotes(next);
        }}
        diy={diy}
        delegated={choices.filter((choice) => !picks.get(choice.itemId)?.diy)}
        onStarted={() => setPicks(new Map())}
      />
    </>
  );
}

function ItemPicker({
  owned,
  catalog,
  picks,
  onPick,
}: {
  owned: OwnedProperty;
  catalog: CatalogItem[];
  picks: Map<string, Pick>;
  onPick: (itemId: string, pick: Pick | null) => void;
}) {
  const groups = new Map<string | null, CatalogItem[]>();
  for (const item of catalog) groups.set(item.spaceId, [...(groups.get(item.spaceId) ?? []), item]);
  const tiers = gameContent.worksTexts.tiers;
  return (
    <div className="stack">
      {[...groups].map(([spaceId, items]) => (
        <details key={spaceId ?? 'dwelling'} className="items-group" open>
          <summary className="h3">
            {spaceId ? spaceName(owned.property, spaceId) : t.property.element}
          </summary>
          {items.map((item) => {
            const pick = picks.get(item.id);
            const tier = pick?.tier ?? 'standard';
            const reference = item.tiers[tier];
            const diy = item.diy?.allowed ? item.diy.tiers[tier] : null;
            return (
              <div key={item.id} className="stack tight works-item" data-testid={`item-${item.id}`}>
                <label className="row between small">
                  <span className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={pick !== undefined}
                      onChange={(e) =>
                        onPick(item.id, e.target.checked ? { tier, diy: false } : null)
                      }
                    />
                    {itemName(item.kind)}
                  </span>
                  {item.state === null ? (
                    <Badge icon="lock">{t.listing.unknown}</Badge>
                  ) : (
                    <StateDots state={item.state} />
                  )}
                </label>
                {pick && (
                  <div className="stack tight works-pick">
                    <Segmented<Tier>
                      label={t.value.tiers}
                      options={TIERS.map((value) => ({ value, label: tiers[value] }))}
                      value={tier}
                      onChange={(value) => onPick(item.id, { ...pick, tier: value })}
                    />
                    <span className="tiny muted">
                      {format(t.works.reference, {
                        amount: formatEuros(reference.cost),
                        days: reference.days,
                      })}
                      {owned.lease && !item.occupied ? ` · ${t.works.needsVacant}` : ''}
                    </span>
                    {diy && (
                      <Switch
                        label={t.works.diy}
                        hint={format(t.works.diyCost, {
                          duration: formatDuration(diy.minutes),
                          amount: formatEuros(diy.materials),
                        })}
                        checked={pick.diy}
                        onChange={(checked) => onPick(item.id, { ...pick, diy: checked })}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}

/** One quote request per trade among the picked items not done oneself. */
function QuoteRequests({
  owned,
  catalog,
  picks,
}: {
  owned: OwnedProperty;
  catalog: CatalogItem[];
  picks: Map<string, Pick>;
}) {
  const { state, act } = useGame();
  const byTrade = new Map<Trade, ItemChoice[]>();
  for (const item of catalog) {
    const pick = picks.get(item.id);
    if (!pick || pick.diy || !item.trade) continue;
    byTrade.set(item.trade, [
      ...(byTrade.get(item.trade) ?? []),
      { itemId: item.id, tier: pick.tier },
    ]);
  }
  if (byTrade.size === 0) return null;
  const artisans = engine.artisans(state, owned.property.cityId);
  return (
    <Card title={t.works.quotes}>
      <p className="small muted">
        {format(t.works.quotesHint, {
          duration: formatDuration(gameContent.works.quotes.minutes),
        })}
      </p>
      {[...byTrade].map(([trade, items]) => (
        <div key={trade} className="stack tight">
          <span className="strong">
            {format(t.works.trade, { trade: tradeName(trade), count: items.length })}
          </span>
          {artisans
            .filter((entry) => entry.artisan.trade === trade)
            .map(({ artisan, jobs }) => (
              <div key={artisan.id} className="row between small">
                <span className="stack tight">
                  <span>{artisan.name}</span>
                  <span className="tiny muted">
                    {format(t.works.artisanFacts, {
                      factor: formatDecimal(artisan.priceFactor),
                      reliability: formatPercent(artisan.reliability * 100),
                      jobs,
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  className="button small"
                  onClick={() =>
                    act({
                      type: 'works/quote',
                      propertyId: owned.property.id,
                      artisanId: artisan.id,
                      items,
                    })
                  }
                >
                  {t.works.askQuote}
                </button>
              </div>
            ))}
        </div>
      ))}
    </Card>
  );
}

function Launch({
  owned,
  quotes,
  taken,
  onToggle,
  diy,
  delegated,
  onStarted,
}: {
  owned: OwnedProperty;
  quotes: OwnedProperty['quotes'];
  taken: Set<string>;
  onToggle: (quoteId: string) => void;
  diy: ItemChoice[];
  delegated: ItemChoice[];
  onStarted: () => void;
}) {
  const { state, act } = useGame();
  const propertyId = owned.property.id;
  const rules = gameContent.works;
  const catalog = engine.worksCatalog(state, propertyId) ?? [];
  const nameOf = (itemId: string) => {
    const item = catalog.find((entry) => entry.id === itemId);
    if (!item) return itemId;
    const name = itemName(item.kind);
    return item.spaceId ? `${spaceName(owned.property, item.spaceId)} : ${name}` : name;
  };
  const chosen = quotes.filter((quote) => taken.has(quote.id));
  const deposit = Math.round(
    chosen.reduce((sum, q) => sum + q.total, 0) * rules.quotes.depositShare,
  );
  const diyMinutes = diy.reduce((sum, choice) => {
    const item = catalog.find((entry) => entry.id === choice.itemId);
    return sum + (item?.diy?.tiers[choice.tier].minutes ?? 0);
  }, 0);
  if (quotes.length === 0 && diy.length === 0 && delegated.length === 0) return null;
  const start = () => {
    const events = act({
      type: 'works/start',
      propertyId,
      quoteIds: chosen.map((quote) => quote.id),
      diy,
    });
    if (events) onStarted();
  };
  return (
    <Card title={t.works.start}>
      {quotes.map((quote) => (
        <label key={quote.id} className="row small" style={{ gap: 8, alignItems: 'start' }}>
          <input
            type="checkbox"
            checked={taken.has(quote.id)}
            onChange={() => onToggle(quote.id)}
          />
          <span className="stack tight">
            <span>
              {format(t.works.quote, {
                artisan: artisanName(quote.artisanId),
                amount: formatEuros(quote.total),
                days: quote.days,
                when: formatWhen(quote.availableDay, state.clock.date),
              })}
            </span>
            <span className="tiny muted">
              {format(t.works.quoteItems, {
                items: quote.items.map((line) => nameOf(line.itemId)).join(', '),
              })}
            </span>
            <span className="tiny muted">
              {format(t.works.quoteExpires, { date: formatDayLong(quote.expiresDay) })}
            </span>
          </span>
        </label>
      ))}
      {diy.length > 0 && (
        <p className="small">
          {format(t.works.diyChosen, { count: diy.length, duration: formatDuration(diyMinutes) })}
        </p>
      )}
      {chosen.length === 0 && diy.length === 0 ? (
        <p className="small muted">{t.works.nothingChosen}</p>
      ) : (
        <>
          {deposit > 0 && (
            <p className="small">{format(t.works.deposit, { amount: formatEuros(deposit) })}</p>
          )}
          <button type="button" className="button primary block" onClick={start}>
            {t.works.start}
          </button>
        </>
      )}
      <p className="tiny muted">
        {format(t.works.startHint, {
          share: formatPercent(rules.quotes.depositShare * 100),
        })}
      </p>
      {delegated.length > 0 && (
        <>
          <button
            type="button"
            className="button block"
            onClick={() => {
              if (act({ type: 'works/delegate', propertyId, items: delegated })) onStarted();
            }}
          >
            {format(t.works.delegate, {
              share: formatPercent(rules.projectManager.feeShare * 100),
            })}
          </button>
          <p className="tiny muted">{t.works.delegateHint}</p>
        </>
      )}
    </Card>
  );
}

function Running({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const project = owned.works;
  if (!project) return null;
  const propertyId = owned.property.id;
  const plan = engine.worksPlan(state, propertyId) ?? [];
  const catalog = engine.worksCatalog(state, propertyId) ?? [];
  const texts = t.works;
  const hazard = project.hazard;
  return (
    <>
      {hazard && (
        <Card title={texts.hazard} tint="brick" testId="works-hazard">
          <p className="small">{gameContent.worksTexts.hazards[hazard.hazardId] ?? ''}</p>
          <p className="small">
            {format(texts.hazardCost, { amount: formatEuros(hazard.cost), days: hazard.days })}
          </p>
          <p className="small muted">
            {format(texts.hazardDeadline, {
              when: formatWhen(hazard.deadlineDay, state.clock.date),
            })}
          </p>
          <div className="stack">
            {(['treat', 'postpone', 'eco'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className={`button block${choice === 'treat' ? ' primary' : ''}`}
                onClick={() => act({ type: 'works/hazard', propertyId, choice })}
              >
                {texts.hazardChoices[choice]}
              </button>
            ))}
          </div>
        </Card>
      )}
      <Card title={texts.running} testId="works-running">
        {project.managed && <p className="small muted">{texts.managed}</p>}
        <p className="small">{format(texts.paid, { amount: formatEuros(project.paid) })}</p>
        <ul className="stack">
          {plan.map((task) => {
            const full = project.tasks.find((entry) => entry.id === task.taskId);
            return (
              <li key={task.taskId} className="stack tight">
                <span className="row between small">
                  <span className="strong">
                    {task.artisanId ? artisanName(task.artisanId) : texts.you}
                  </span>
                  <Badge tone={task.status === 'done' ? 'teal' : undefined}>
                    {texts.taskStatus[task.status]}
                  </Badge>
                </span>
                <span className="tiny muted">
                  {tradeName(task.trade)} ·{' '}
                  {task.itemIds
                    .map((itemId) => {
                      const item = catalog.find((entry) => entry.id === itemId);
                      return item ? itemName(item.kind) : itemId;
                    })
                    .join(', ')}
                </span>
                <span className="tiny muted">
                  {task.artisanId === null && full
                    ? format(texts.diyProgress, {
                        done: formatDuration(full.minutesDone),
                        needed: formatDuration(full.minutesNeeded),
                      })
                    : format(texts.taskDates, {
                        start: formatDayLong(task.startDay),
                        end: formatDayLong(task.endDay),
                      })}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
