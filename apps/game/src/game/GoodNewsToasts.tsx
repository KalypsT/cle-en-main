import { useEffect } from 'react';
import { format, t } from '../texts.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Icon } from '../ui/Icon.tsx';
import type { GoodNews } from './good-news.ts';

/** How long a toast stays, and how much longer for each news grouped into it. */
const SHOWN_MS = 3800;
const EXTRA_MS = 1000;
const LONGEST_MS = 6500;
/** A group lists its first news, then says how many there are. */
const LISTED = 3;

function Face({ news, size }: { news: GoodNews; size: number }) {
  return news.face ? (
    <Avatar parts={news.face.parts} mood={news.face.mood} size={size} />
  ) : (
    <span className="toast-icon" style={{ width: size, height: size }}>
      <Icon name={news.icon} size={Math.round(size / 2)} />
    </span>
  );
}

/**
 * Good news and achievements, under the status bar (docs/04, 4.6): they never
 * stop the clock and go away by themselves, or at a touch.
 */
export function GoodNewsToasts({
  shown,
  onDismiss,
}: {
  shown: GoodNews[] | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(
      onDismiss,
      Math.min(LONGEST_MS, SHOWN_MS + EXTRA_MS * (shown.length - 1)),
    );
    return () => clearTimeout(timer);
  }, [shown, onDismiss]);

  const first = shown?.[0];
  return (
    <div className="toasts" aria-live="polite">
      {shown && first && (
        // A touch sends it away; it goes by itself anyway, so it is no button to tab to.
        <div
          className={`toast${first.kind === 'achievement' ? ' toast-achievement' : ''}`}
          data-testid={first.kind === 'achievement' ? 'achievement-toast' : 'good-news'}
          onClick={onDismiss}
        >
          {first.kind === 'achievement' ? (
            <>
              <span className="toast-badge" aria-hidden="true">
                <Icon name="trophy" size={26} />
              </span>
              <span className="stack tight">
                <span className="toast-kicker">{t.celebration.achievement}</span>
                <span className="toast-title display">{first.text}</span>
                {first.detail && <span className="small">{first.detail}</span>}
              </span>
            </>
          ) : shown.length === 1 ? (
            <>
              <Face news={first} size={40} />
              <span className="stack tight">
                <span className="toast-text">{first.text}</span>
                {first.detail && <span className="small">{first.detail}</span>}
              </span>
            </>
          ) : (
            <span className="stack tight grow">
              <span className="toast-kicker">
                {format(t.goodNews.many, { count: shown.length })}
              </span>
              {shown.slice(0, LISTED).map((news, i) => (
                <span key={i} className="toast-line">
                  <Face news={news} size={28} />
                  <span className="toast-text">{news.text}</span>
                </span>
              ))}
              {shown.length > LISTED && <span className="small muted">…</span>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
