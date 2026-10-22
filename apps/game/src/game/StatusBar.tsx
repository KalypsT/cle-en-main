import { gameContent, timeSettings } from '@cle/content';
import { useEffect, useRef } from 'react';
import { engine } from '../engine.ts';
import { AnimatedEuros } from '../ui/AnimatedEuros.tsx';
import { Icon } from '../ui/Icon.tsx';
import {
  format,
  formatDuration,
  formatEuros,
  formatGameTime,
  formatShortDate,
  formatWhen,
  t,
} from '../texts.ts';
import { useGame, useNav } from './context.tsx';

/**
 * Always on top (docs/04, 4.3), in two short lines: date and time, speed;
 * cash and free time. The pending decisions are counted on their tab.
 */
export function StatusBar() {
  const bar = useRef<HTMLElement>(null);
  // The toasts and the scenes over the game sit just under the bar, whatever its height.
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--status-bottom', `${element.getBoundingClientRect().bottom}px`),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { snapshot, session, state } = useGame();
  const nav = useNav();
  const { speed, decisions, autoPaused, accelerated } = snapshot;
  const { player } = state;
  const fullDay = engine.dailyFreeTime(state);
  const share = fullDay > 0 ? Math.min(1, player.freeTimeMinutes / fullDay) : 0;
  const cashAlert = decisions.find((decision) => decision.kind === 'cashAlert');

  return (
    <header className="status-bar" ref={bar}>
      <div className="row between">
        <div className="stack tight" aria-live="off">
          <span className="status-date" data-testid="game-date">
            {formatShortDate(state.clock.date)}
          </span>
          <span className="status-time" data-testid="game-time">
            {formatGameTime(state.clock.hour)}
            {autoPaused && ` · ${t.status.paused}`}
            {accelerated && (
              <span title={t.status.autoSpeedHint} data-testid="accelerated">
                {` · ${format(t.status.autoSpeed, { speed: gameContent.rhythm.autoSpeed.speed })}`}
              </span>
            )}
          </span>
        </div>
        <div className="speed" role="group" aria-label={t.status.speedControls}>
          {[0, ...timeSettings.speeds].map((value) => (
            <button
              key={value}
              type="button"
              className={value === 0 ? 'pause' : undefined}
              data-tutorial={value === 0 ? 'pause' : undefined}
              aria-pressed={speed === value}
              aria-label={value === 0 ? t.status.pause : format(t.status.speed, { speed: value })}
              onClick={() => session.setSpeed(value)}
            >
              {value === 0 ? (
                <Icon name="pause" size={18} />
              ) : (
                format(t.status.speed, { speed: value })
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="status-line">
        <button
          type="button"
          className="status-stat"
          aria-label={t.status.balance}
          title={t.status.balance}
          onClick={() => nav.goTab('assets')}
        >
          <Icon name="euro" size={18} />
          <span className="status-value">
            <AnimatedEuros value={player.balance} testId="balance" negative={player.balance < 0} />
          </span>
        </button>
        <div className="status-stat" title={t.status.freeTime}>
          <Icon name="clock" size={18} />
          <span className="sr-only">{t.status.freeTime}</span>
          <span className="status-value" data-testid="free-time">
            {formatDuration(player.freeTimeMinutes)}
          </span>
          <span className="freetime-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        </div>
      </div>
      {player.bankruptDay !== null ? (
        <div className="alert-banner brick" role="alert">
          <Icon name="alert" size={18} />
          {t.status.bankrupt}
        </div>
      ) : player.balance < 0 ? (
        <button type="button" className="alert-banner brick" onClick={() => nav.goTab('decisions')}>
          <Icon name="alert" size={18} />
          {format(t.status.overdraft, { amount: formatEuros(player.balance) })}
        </button>
      ) : (
        cashAlert &&
        cashAlert.kind === 'cashAlert' &&
        cashAlert.deadlineDay !== null && (
          <button
            type="button"
            className="alert-banner"
            data-testid="cash-alert"
            onClick={() => nav.goTab('decisions')}
          >
            <Icon name="alert" size={18} />
            {format(t.status.cashAlert, {
              when: formatWhen(cashAlert.deadlineDay, state.clock.date),
              amount: formatEuros(cashAlert.lowest),
            })}
          </button>
        )
      )}
    </header>
  );
}
