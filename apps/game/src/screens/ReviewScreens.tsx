import { gameContent } from '@cle/content';
import type { Advice, GameState } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  achievementName,
  format,
  formatEuros,
  formatGameDate,
  formatPercent,
  formatSigned,
  propertyLabel,
  t,
  titleName,
  tone,
} from '../texts.ts';
import { Badge, Card, Empty, KeyValues, ScreenHeader } from '../ui/components.tsx';

/** The short monthly review (docs/02, section 2.2). */
export function MonthlyReviewContent() {
  const { state } = useGame();
  const review = engine.monthlyReview(state);
  if (!review) return <Empty icon="calendar">{t.review.noMonthReview}</Empty>;
  const reputationChange = review.reputationChange;
  return (
    <div className="stack" data-testid="monthly-review">
      <h2 className="h2 display">
        {format(t.review.monthHeading, { date: formatGameDate(review.date) })}
      </h2>
      <Card>
        <KeyValues
          rows={[
            ...review.groups.map((group) => ({
              label: t.review.groups[group.group],
              value: formatSigned(group.amount),
              className: tone(group.amount),
            })),
            {
              label: t.review.net,
              value: formatSigned(review.net),
              className: tone(review.net),
              total: true,
            },
            { label: t.review.balance, value: formatEuros(review.balance) },
          ]}
        />
      </Card>
      <Card title={t.review.netWorth}>
        <p className="big-number">{formatEuros(review.netWorth)}</p>
        <p className={`small ${tone(review.netWorthChange)}`}>
          {format(t.review.change, { amount: formatSigned(review.netWorthChange) })}
        </p>
        {review.monthlyRent > 0 && (
          <p className="small">
            {format(t.review.rents, { amount: formatEuros(review.monthlyRent) })}
          </p>
        )}
        <p className="small">
          {format(t.review.reputation, {
            value: review.reputation,
            change: `${reputationChange >= 0 ? t.common.plus : t.common.minus}${Math.abs(reputationChange)}`,
          })}
        </p>
        {review.positiveStreak > 1 && (
          <p className="small">{format(t.review.streak, { count: review.positiveStreak })}</p>
        )}
      </Card>
      {(review.titles.length > 0 || review.achievements.length > 0) && (
        <Card title={t.review.newAchievements}>
          <div className="row wrap">
            {review.titles.map((id) => (
              <Badge key={id} tone="teal" icon="trophy">
                {titleName(id)}
              </Badge>
            ))}
            {review.achievements.map((id) => (
              <Badge key={id} tone="green" icon="star">
                {achievementName(id)}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function adviceText(state: GameState, advice: Advice, year: number): string {
  const variants = gameContent.yvon.advice[advice.kind];
  const template = variants[year % variants.length] ?? variants[0] ?? '';
  const owned = advice.propertyId
    ? state.properties.find((o) => o.property.id === advice.propertyId)
    : undefined;
  return format(template, {
    montant: formatEuros(advice.amount ?? 0),
    bien: owned ? propertyLabel(owned.property) : '',
    annee: advice.year ?? year,
    taux: formatPercent((advice.ratio ?? 0) * 100),
  });
}

/** The yearly review with Yvon Tableur (docs/04, « Bilan annuel »). */
export function YearReviewContent() {
  const { state } = useGame();
  const review = state.lastYearReview;
  if (!review) return <Empty icon="calendar">{t.review.noYearReview}</Empty>;
  const { yvon } = gameContent;
  const pick = (list: readonly string[]) => list[review.year % list.length] ?? list[0] ?? '';
  return (
    <div className="stack" data-testid="year-review">
      <h2 className="h2 display">{format(t.review.yearHeading, { year: review.year })}</h2>
      <Card title={t.review.yvon} tint="teal">
        <p className="event-text">{format(pick(yvon.greetings), { annee: review.year })}</p>
        <ul className="advice">
          {review.advice.map((advice, index) => (
            <li key={`${advice.kind}-${index}`}>{adviceText(state, advice, review.year)}</li>
          ))}
        </ul>
        <p className="small muted">{pick(yvon.closings)}</p>
      </Card>
      <Card>
        <p className="strong">
          {format(t.review.yearNetWorth, {
            start: formatEuros(review.netWorthStart),
            end: formatEuros(review.netWorthEnd),
          })}
        </p>
        <KeyValues
          rows={[
            {
              label: t.review.yearCashFlow,
              value: formatSigned(review.cashFlow),
              className: tone(review.cashFlow),
            },
            { label: t.review.yearRents, value: formatEuros(review.rents) },
            {
              label: t.review.yearTax,
              value: review.rentTax === null ? t.review.yearNoTax : formatSigned(-review.rentTax),
            },
            { label: t.review.yearAccountant, value: formatEuros(review.accountantFees) },
          ]}
        />
        <p className="small">
          {format(t.review.yearReputation, {
            start: review.reputationStart,
            end: review.reputationEnd,
          })}
        </p>
      </Card>
      {(review.titles.length > 0 || review.achievements.length > 0) && (
        <Card title={t.review.yearAchievements}>
          <div className="row wrap">
            {review.titles.map((id) => (
              <Badge key={id} tone="teal" icon="trophy">
                {titleName(id)}
              </Badge>
            ))}
            {review.achievements.map((id) => (
              <Badge key={id} tone="green" icon="star">
                {achievementName(id)}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export function MonthlyReviewScreen() {
  const nav = useNav();
  return (
    <div className="screen">
      <ScreenHeader title={t.menu.statement} onBack={nav.pop} />
      <MonthlyReviewContent />
    </div>
  );
}

export function YearReviewScreen() {
  const nav = useNav();
  return (
    <div className="screen">
      <ScreenHeader title={t.menu.yearReview} onBack={nav.pop} />
      <YearReviewContent />
    </div>
  );
}
