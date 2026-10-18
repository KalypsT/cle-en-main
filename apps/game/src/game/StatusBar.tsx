import { timeSettings } from '@cle/content';
import { engine } from '../engine.ts';
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

/** Always on top (docs/04, 4.3): date and time, speed, cash, free time, decisions. */
export function StatusBar() {
  const { snapshot, session, state } = useGame();
  const nav = useNav();
  const { speed, decisions, autoPaused } = snapshot;
  const { player } = state;
  const fullDay = engine.dailyFreeTime(state);
  const share = fullDay > 0 ? Math.min(1, player.freeTimeMinutes / fullDay) : 0;
  const cashAlert = decisions.find((decision) => decision.kind === 'cashAlert');

  return (
    <header className="status-bar">
      <div className="row between">
        <div className="stack tight" aria-live="off">
          <span className="status-date" data-testid="game-date">
            {formatShortDate(state.clock.date)}
          </span>
          <span className="status-time" data-testid="game-time">
            {formatGameTime(state.clock.hour)}
            {autoPaused && ` · ${t.status.paused}`}
          </span>
        </div>
        <div className="speed" role="group" aria-label={t.status.speedControls}>
          {[0, ...timeSettings.speeds].map((value) => (
            <button
              key={value}
              type="button"
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
      <div className="status-tiles">
        <button type="button" className="tile" onClick={() => nav.goTab('assets')}>
          <span className="tile-label">{t.status.balance}</span>
          <span
            className={`tile-value${player.balance < 0 ? ' negative' : ''}`}
            data-testid="balance"
          >
            {formatEuros(player.balance)}
          </span>
        </button>
        <div className="tile">
          <span className="tile-label">{t.status.freeTime}</span>
          <span className="tile-value" data-testid="free-time">
            {formatDuration(player.freeTimeMinutes)}
          </span>
          <span className="freetime-bar" aria-hidden="true">
            <span style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        </div>
        <button
          type="button"
          className="decisions-button"
          aria-label={`${t.status.decisions} : ${decisions.length}`}
          onClick={() => nav.goTab('decisions')}
        >
          <Icon name="decisions" />
          {decisions.length > 0 && (
            <span className="counter" data-testid="decision-count">
              {decisions.length}
            </span>
          )}
        </button>
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
