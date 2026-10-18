import { timeSettings } from '@cle/content';
import { useEffect, useSyncExternalStore } from 'react';
import type { GameSession } from '../session/game-session.ts';
import { exportGame } from '../storage/files.ts';
import { describeEvent, format, formatGameDate, formatGameTime, texts } from '../texts.ts';

interface Props {
  session: GameSession;
  onSave: () => void;
  onMenu: () => void;
  notify: (message: string) => void;
}

const DEMO_DIE_SIDES = 6;

export function GameScreen({ session, onSave, onMenu, notify }: Props) {
  const { state, speed, lastEvent } = useSyncExternalStore(session.subscribe, session.getSnapshot);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const rollDie = () => {
    const result = session.dispatch({ type: 'demo/rollDie', sides: DEMO_DIE_SIDES });
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
        <h2 className="card-heading">{texts.game.demoHeading}</h2>
        <p data-testid="last-roll">
          {state.demo.lastRoll === null
            ? texts.game.noRollYet
            : format(texts.game.lastRoll, { value: state.demo.lastRoll })}
        </p>
        {eventText && (
          <p className="muted">{format(texts.game.latestEvent, { event: eventText })}</p>
        )}
        <button type="button" className="button" onClick={rollDie}>
          {texts.game.rollDie}
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
