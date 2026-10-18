import { gameContent, timeSettings } from '@cle/content';
import { useEffect, useSyncExternalStore } from 'react';
import type { GameSession } from '../session/game-session.ts';
import { exportGame } from '../storage/files.ts';
import {
  bankerName,
  describeEvent,
  format,
  formatDuration,
  formatGameDate,
  formatGameTime,
  formatMoney,
  formatPercent,
  texts,
} from '../texts.ts';

interface Props {
  session: GameSession;
  onSave: () => void;
  onMenu: () => void;
  notify: (message: string) => void;
}

/** Temporary screen until the management interface of milestone 4. */
export function GameScreen({ session, onSave, onMenu, notify }: Props) {
  const { state, speed, lastEvent } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const accountBankId = gameContent.start.accountBankId;
  const banker = bankerName(accountBankId);
  const job = gameContent.jobs.find((candidate) => candidate.id === state.player.jobId);

  const meetBanker = () => {
    const result = session.dispatch({ type: 'bank/meet', bankId: accountBankId });
    if (!result.ok) notify(texts.refusals[result.reason.code]);
  };

  const eventText = lastEvent ? describeEvent(lastEvent) : null;

  return (
    <main className="screen game-screen">
      <section className="card clock" aria-live="off">
        <p className="clock-date" data-testid="game-date">
          {formatGameDate(state.clock.date)}
        </p>
        <p className="clock-time" data-testid="game-time">
          {formatGameTime(state.clock.hour)}
        </p>
      </section>

      <div className="speed-controls" role="group" aria-label={texts.game.speedControls}>
        {[0, ...timeSettings.speeds].map((value) => (
          <button
            key={value}
            type="button"
            className="button speed"
            aria-pressed={speed === value}
            onClick={() => session.setSpeed(value)}
          >
            {value === 0 ? texts.game.pause : format(texts.game.speed, { speed: value })}
          </button>
        ))}
      </div>

      <section className="card">
        <h2 className="card-heading">{texts.game.situationHeading}</h2>
        <p>{format(texts.game.job, { job: job?.name ?? state.player.jobId })}</p>
        <p data-testid="balance">
          {format(texts.game.balance, { amount: formatMoney(state.player.balance) })}
        </p>
        <p>
          {format(texts.game.freeTime, { duration: formatDuration(state.player.freeTimeMinutes) })}
        </p>
        <p>{format(texts.game.marketRate, { rate: formatPercent(state.market.ratePercent) })}</p>
        <p data-testid="trust">
          {format(texts.game.trust, {
            banker,
            trust: Math.round(state.banks[accountBankId]?.trust ?? 0),
          })}
        </p>
        {eventText && (
          <p className="muted">{format(texts.game.latestEvent, { event: eventText })}</p>
        )}
        <button type="button" className="button" onClick={meetBanker}>
          {format(texts.game.meetBanker, { banker })}
        </button>
      </section>

      <div className="stack">
        <button type="button" className="button primary" onClick={onSave}>
          {texts.game.save}
        </button>
        <button type="button" className="button" onClick={() => exportGame(state)}>
          {texts.game.export}
        </button>
        <button type="button" className="button" onClick={onMenu}>
          {texts.game.menu}
        </button>
      </div>
    </main>
  );
}
