import { gameContent, type Stat } from '@cle/content';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankName,
  chronicleText,
  format,
  formatDayLong,
  formatDecimal,
  formatPercent,
  rivalName,
  t,
  titleName,
} from '../texts.ts';
import { Badge, Card, ScreenHeader, Segmented } from '../ui/components.tsx';
import { ChallengeCard, ChallengeHistory } from './ChallengeScreen.tsx';

type Tab = 'titles' | 'achievements' | 'challenges' | 'chronicle';
const TABS: readonly Tab[] = ['titles', 'achievements', 'challenges', 'chronicle'];

export function statLabel(stat: Stat, key: string | null): string {
  const label = t.stats[stat];
  if (stat === 'bankTrust' && key) return `${label} (${bankName(key)})`;
  if (stat === 'rivalBeaten' && key) return `${label} (${rivalName(key)})`;
  return label;
}

function value(current: number): string {
  return formatDecimal(Math.round(current));
}

function Titles() {
  const { state } = useGame();
  const view = engine.progression(state);
  return (
    <>
      <Card title={t.progression.reputation} testId="reputation">
        <p className="big-number">
          {format(t.progression.reputationValue, { value: formatDecimal(view.reputation) })}
        </p>
        <span className="meter" aria-hidden="true">
          <span style={{ width: `${view.reputation}%` }} />
        </span>
        <p className="small muted">{t.progression.reputationHint}</p>
        {view.bankMarginPercent < 0 && (
          <p className="small">
            {format(t.progression.reputationEffects, {
              margin: `${t.common.minus}${formatPercent(-view.bankMarginPercent)}`,
            })}
          </p>
        )}
        {view.offMarket && <p className="small">{t.progression.offMarket}</p>}
      </Card>
      <Card title={t.progression.currentTitle}>
        <p className="h2 display" data-testid="current-title">
          {view.currentTitleId ? titleName(view.currentTitleId) : ''}
        </p>
      </Card>
      <div className="stack">
        {gameContent.titles.map((title) => {
          const progress = view.titles.find((entry) => entry.id === title.id);
          const held = progress?.day ?? null;
          return (
            <Card
              key={title.id}
              title={title.name}
              tint={held !== null ? 'accent' : undefined}
              aside={
                held !== null ? (
                  <Badge tone="green" icon="check">
                    {format(t.progression.held, { date: formatDayLong(held) })}
                  </Badge>
                ) : (
                  <Badge>{title.available ? t.progression.locked : t.progression.later}</Badge>
                )
              }
              testId={`title-${title.id}`}
            >
              <p className="small muted">
                {format(t.progression.step, { step: title.step })} ·{' '}
                {t.progression.branches[title.branch]}
              </p>
              <p className="small">{title.description}</p>
              {held === null &&
                title.available &&
                progress?.conditions.map((condition) => (
                  <p key={`${condition.stat}-${condition.key}`} className="small">
                    {statLabel(condition.stat, condition.key)} : {value(condition.current)} /{' '}
                    {value(condition.target)}
                  </p>
                ))}
              {title.perkText && (
                <p className="small muted">
                  {format(t.progression.perk, { perk: title.perkText })}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Achievements() {
  const { state } = useGame();
  const view = engine.progression(state);
  const earned = view.achievements.filter((a) => a.day !== null).length;
  return (
    <>
      <p className="strong" data-testid="achievement-count">
        {format(t.progression.achievementsCount, {
          count: earned,
          total: view.achievements.length,
        })}
      </p>
      <div className="list">
        {view.achievements.map((progress) => {
          const achievement = gameContent.achievements.find((a) => a.id === progress.id);
          if (!achievement) return null;
          const hidden = progress.secret && progress.day === null;
          return (
            <div
              key={achievement.id}
              className={`achievement${progress.day !== null ? ' earned' : ''}`}
              data-testid={`achievement-${achievement.id}`}
            >
              <span className="strong">{hidden ? t.progression.secret : achievement.name}</span>
              {!hidden && <span className="small">{achievement.description}</span>}
              <span className="small muted">
                {progress.day !== null
                  ? format(t.progression.earned, { date: formatDayLong(progress.day) })
                  : hidden
                    ? ''
                    : format(t.progression.achievementProgress, {
                        current: value(Math.min(progress.current, progress.target)),
                        target: value(progress.target),
                      })}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Chronicle() {
  const { state } = useGame();
  const entries = [...state.chronicle].reverse();
  return (
    <ol className="chronicle" data-testid="chronicle">
      {entries.map((entry, index) => (
        <li key={`${entry.day}-${index}`}>
          <span className="small muted">{formatDayLong(entry.day)}</span>
          <span>{chronicleText(entry)}</span>
        </li>
      ))}
    </ol>
  );
}

/** « Progression » (docs/04): titles and reputation, achievements, challenges, chronicle. */
export function ProgressionScreen() {
  const nav = useNav();
  const { state } = useGame();
  const [tab, setTab] = useState<Tab>('titles');
  const view = engine.progression(state);
  const mode = gameContent.modes.modes.find((m) => m.id === view.mode);
  return (
    <div className="screen">
      <ScreenHeader title={t.progression.heading} onBack={nav.pop} />
      <p className="small muted">
        {format(t.progression.mode, { mode: mode?.name ?? '' })} ·{' '}
        {view.rewindsLeft === null
          ? t.progression.rewindsUnlimited
          : format(t.progression.rewindsLeft, { count: view.rewindsLeft })}
      </p>
      <Segmented
        label={t.progression.heading}
        options={TABS.map((id) => ({ value: id, label: t.progression.tabs[id] }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'titles' && <Titles />}
      {tab === 'achievements' && <Achievements />}
      {tab === 'challenges' && (
        <>
          <ChallengeCard />
          <ChallengeHistory />
        </>
      )}
      {tab === 'chronicle' && <Chronicle />}
    </div>
  );
}
