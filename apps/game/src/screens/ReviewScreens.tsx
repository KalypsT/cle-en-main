import { gameContent } from '@cle/content';
import type { Advice, CalendarDate, GameState } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  achievementName,
  format,
  formatDecimal,
  formatEuros,
  formatGameDate,
  formatPercent,
  formatSigned,
  propertyLabel,
  t,
  titleName,
  tone,
} from '../texts.ts';
import { Badge, Card, Chip, Empty, KeyValues, ScreenHeader } from '../ui/components.tsx';

/** The short monthly review (docs/02, section 2.2): the last one, or a kept one (`date`). */
export function MonthlyReviewContent({ date }: { date?: CalendarDate | undefined }) {
  const { state } = useGame();
  const review = engine.monthlyReview(state, date);
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
            value: formatDecimal(review.reputation),
            change: `${reputationChange >= 0 ? t.common.plus : t.common.minus}${formatDecimal(Math.abs(reputationChange))}`,
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
              <Badge key={id} tone="accent" icon="trophy">
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
  // A property sold since is found among the ones sold.
  const property = advice.propertyId
    ? (state.properties.find((o) => o.property.id === advice.propertyId)?.property ??
      state.soldProperties.findLast((s) => s.property.id === advice.propertyId)?.property)
    : undefined;
  return format(template, {
    montant: formatEuros(advice.amount ?? 0),
    bien: property ? propertyLabel(property) : '',
    annee: advice.year ?? year,
    taux: formatPercent((advice.ratio ?? 0) * 100),
  });
}

/**
 * The yearly review with Yvon Tableur (docs/04, « Bilan annuel »): the last one, or a kept
 * one (`year`).
 */
export function YearReviewContent({ year }: { year?: number | undefined }) {
  const { state } = useGame();
  const kept = state.reviews.years.find((entry) => entry.review.year === year);
  const review = kept?.review ?? state.lastYearReview;
  if (!review) return <Empty icon="calendar">{t.review.noYearReview}</Empty>;
  const assessment = kept ? kept.assessment : state.tax.lastAssessment;
  const wealthTax = assessment?.year === review.year ? assessment.wealthTax : 0;
  const { yvon } = gameContent;
  const pick = (list: readonly string[]) => list[review.year % list.length] ?? list[0] ?? '';
  return (
    <div className="stack" data-testid="year-review">
      <h2 className="h2 display">{format(t.review.yearHeading, { year: review.year })}</h2>
      <Card title={t.review.yvon} tint="accent">
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
            ...(wealthTax > 0
              ? [{ label: t.review.yearWealthTax, value: formatSigned(-wealthTax) }]
              : []),
          ]}
        />
        <p className="small">
          {format(t.review.yearReputation, {
            start: formatDecimal(review.reputationStart),
            end: formatDecimal(review.reputationEnd),
          })}
        </p>
      </Card>
      {(review.titles.length > 0 || review.achievements.length > 0) && (
        <Card title={t.review.yearAchievements}>
          <div className="row wrap">
            {review.titles.map((id) => (
              <Badge key={id} tone="accent" icon="trophy">
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

/** « Bilan du mois », with the months kept before it (docs/04, « Bilans »). */
export function MonthlyReviewScreen() {
  const nav = useNav();
  const { state } = useGame();
  const statements = state.reviews.statements;
  const [index, setIndex] = useState(statements.length - 1);
  const shown = statements[Math.min(index, statements.length - 1)];
  const isLast = index >= statements.length - 1;
  return (
    <div className="screen">
      <ScreenHeader title={t.menu.statement} onBack={nav.pop} />
      {statements.length > 1 && (
        <div className="row between">
          <button
            type="button"
            className="link-button"
            disabled={index <= 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            {t.review.previous}
          </button>
          <button
            type="button"
            className="link-button"
            disabled={isLast}
            onClick={() => setIndex((i) => Math.min(statements.length - 1, i + 1))}
          >
            {t.review.next}
          </button>
        </div>
      )}
      {!isLast && <p className="small muted">{t.review.pastMonthHint}</p>}
      <MonthlyReviewContent date={isLast ? undefined : shown?.date} />
    </div>
  );
}

/** « Bilan annuel », with every year kept (docs/04, « Bilans »). */
export function YearReviewScreen() {
  const nav = useNav();
  const { state } = useGame();
  const years = state.reviews.years.map((entry) => entry.review.year).reverse();
  const [year, setYear] = useState<number | undefined>(years[0]);
  return (
    <div className="screen">
      <ScreenHeader title={t.menu.yearReview} onBack={nav.pop} />
      {years.length > 1 && (
        <div className="chips" role="group" aria-label={t.review.years}>
          {years.map((candidate) => (
            <Chip key={candidate} pressed={candidate === year} onClick={() => setYear(candidate)}>
              {String(candidate)}
            </Chip>
          ))}
        </div>
      )}
      <YearReviewContent year={year} />
    </div>
  );
}
