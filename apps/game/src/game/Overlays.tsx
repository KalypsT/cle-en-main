import { gameContent } from '@cle/content';
import { fromDayNumber } from '@cle/engine';
import { type ReactNode, useId } from 'react';
import { MonthlyReviewContent, YearReviewContent } from '../screens/ReviewScreens.tsx';
import { format, formatEuros, formatGameDate, t } from '../texts.ts';
import { useGame } from './context.tsx';

/** What may come over the game: the reviews, a title's celebration, a fresh start, the end. */
export type Overlay =
  | { kind: 'month' }
  | { kind: 'year' }
  | { kind: 'title'; titleId: string }
  | { kind: 'freshStart' }
  | { kind: 'gameOver' };

function Frame({
  title,
  children,
  testId,
  className,
}: {
  title: string;
  children: ReactNode;
  testId: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={`overlay ${className ?? ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
    >
      <div className="overlay-body" data-testid={testId}>
        <h1 className="sr-only" id={id}>
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}

const CONFETTI = 24;

/** Confetti over the street for a new title (docs/05: the celebration scene). */
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: CONFETTI }, (_, i) => (
        <span
          key={i}
          style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.18}s` }}
        />
      ))}
    </div>
  );
}

export function OverlayView({
  overlay,
  onClose,
  onQuit,
  onShowChronicle,
}: {
  overlay: Overlay;
  onClose: () => void;
  onQuit: () => void;
  onShowChronicle: () => void;
}) {
  const { state } = useGame();
  switch (overlay.kind) {
    case 'month':
      return (
        <Frame title={t.menu.statement} testId="overlay-month">
          <MonthlyReviewContent />
          <button type="button" className="button primary block" onClick={onClose}>
            {t.review.continue}
          </button>
        </Frame>
      );
    case 'year':
      return (
        <Frame title={t.menu.yearReview} testId="overlay-year" className="festive">
          <YearReviewContent />
          <button type="button" className="button primary block" onClick={onClose}>
            {t.review.continue}
          </button>
        </Frame>
      );
    case 'title': {
      const title = gameContent.titles.find((candidate) => candidate.id === overlay.titleId);
      return (
        <Frame title={t.celebration.title} testId="overlay-title" className="festive">
          <Confetti />
          <p className="small muted">{t.celebration.title}</p>
          <p className="display h1 celebration-title">{title?.name ?? ''}</p>
          <p>{title?.description}</p>
          {title?.perkText && (
            <p className="small">{format(t.celebration.perk, { perk: title.perkText })}</p>
          )}
          <button type="button" className="button primary block" onClick={onClose}>
            {t.celebration.continue}
          </button>
        </Frame>
      );
    }
    case 'freshStart':
      return (
        <Frame title={t.fresh.heading} testId="overlay-fresh">
          <h2 className="h2 display">{t.fresh.heading}</h2>
          <p>
            {format(t.fresh.text, {
              savings: formatEuros(state.player.balance),
              reputation: state.player.reputation,
            })}
          </p>
          <button type="button" className="button primary block" onClick={onClose}>
            {t.fresh.continue}
          </button>
        </Frame>
      );
    case 'gameOver':
      return (
        <Frame title={t.gameOver.heading} testId="overlay-game-over">
          <h2 className="h2 display">{t.gameOver.heading}</h2>
          <p>
            {format(t.gameOver.text, {
              date: formatGameDate(fromDayNumber(state.gameOver?.day ?? 0)),
            })}
          </p>
          <button type="button" className="button block" onClick={onShowChronicle}>
            {t.gameOver.chronicle}
          </button>
          <button type="button" className="button primary block" onClick={onQuit}>
            {t.gameOver.quit}
          </button>
        </Frame>
      );
  }
}
