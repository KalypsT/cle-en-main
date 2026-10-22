import { gameContent } from '@cle/content';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { findChallenge, format, formatDayLong, formatWhen, giverName, t } from '../texts.ts';
import { Badge, Card, Empty, ScreenHeader } from '../ui/components.tsx';

/** The challenge on offer or under way (docs/02, section 2.10). */
export function ChallengeCard() {
  const { state, act } = useGame();
  const view = engine.progression(state).challenge;
  const challenge = view && findChallenge(view.id);
  if (!view || !challenge) return <Empty icon="trophy">{t.challenge.none}</Empty>;
  return (
    <Card
      title={format(t.challenge.from, { giver: giverName(challenge.id) })}
      aside={
        <Badge tone={view.accepted ? 'accent' : 'amber'} icon="clock">
          {view.accepted
            ? format(t.challenge.until, { date: formatDayLong(view.deadlineDay) })
            : format(t.challenge.answerBy, {
                when: formatWhen(view.deadlineDay, state.clock.date),
              })}
        </Badge>
      }
      testId="challenge"
    >
      <p className="event-text">{challenge.text}</p>
      <p className="small">{format(t.challenge.reward, { points: challenge.rewardReputation })}</p>
      {challenge.penaltyReputation < 0 && (
        <p className="small muted">
          {format(t.challenge.penalty, { points: challenge.penaltyReputation })}
        </p>
      )}
      {view.progress && (
        <p className="strong">
          {format(t.challenge.progress, {
            current: Math.round(view.progress.current),
            target: view.progress.target,
          })}
        </p>
      )}
      {!view.accepted && (
        <div className="row wrap">
          <button
            type="button"
            className="button primary"
            onClick={() => act({ type: 'challenge/answer', accept: true }, t.challenge.accepted)}
          >
            {t.challenge.accept}
          </button>
          <button
            type="button"
            className="button"
            onClick={() => act({ type: 'challenge/answer', accept: false })}
          >
            {t.challenge.decline}
          </button>
        </div>
      )}
    </Card>
  );
}

export function ChallengeHistory() {
  const { state } = useGame();
  const history = [...state.progress.challengeHistory].reverse();
  if (history.length === 0) return null;
  return (
    <Card title={t.challenge.history}>
      <ul className="plain-list">
        {history.map((entry) => (
          <li key={`${entry.id}-${entry.day}`} className="row between">
            <span>{gameContent.challenges.givers[findChallenge(entry.id)?.giver ?? 'gerard']}</span>
            <Badge tone={entry.won ? 'green' : 'brick'}>
              {entry.won ? t.challenge.won : t.challenge.lost}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChallengeScreen() {
  const nav = useNav();
  return (
    <div className="screen">
      <ScreenHeader title={t.challenge.heading} onBack={nav.pop} />
      <ChallengeCard />
    </div>
  );
}
