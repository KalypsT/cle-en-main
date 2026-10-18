import { useEffect, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { type Checkpoint, listCheckpoints, type SlotId } from '../storage/saves.ts';
import { format, formatEuros, formatGameDate, t, texts } from '../texts.ts';
import { Card, Empty, ScreenHeader } from '../ui/components.tsx';

/** « Revenir en arrière » (docs/02, section 2.7): the last monthly points. */
export function RewindScreen() {
  const { state, slot, rewind } = useGame();
  const nav = useNav();
  const [points, setPoints] = useState<Checkpoint[] | null>(null);
  const [confirm, setConfirm] = useState<Checkpoint | null>(null);
  useEffect(() => {
    let live = true;
    listCheckpoints(slot as SlotId)
      .then((list) => live && setPoints(list))
      .catch(() => live && setPoints([]));
    return () => {
      live = false;
    };
  }, [slot]);
  const left = engine.rewindsLeft(state);
  const past = (points ?? []).filter(
    (point) =>
      point.date.year * 10_000 + point.date.month * 100 + point.date.day <
      state.clock.date.year * 10_000 + state.clock.date.month * 100 + state.clock.date.day,
  );
  return (
    <div className="screen">
      <ScreenHeader title={t.rewind.heading} onBack={nav.pop} />
      <p className="small muted">{t.rewind.intro}</p>
      <p className="strong" data-testid="rewinds-left">
        {left === null
          ? t.rewind.unlimited
          : engine.mode(state).rewinds === 0
            ? t.rewind.none
            : left === 0
              ? t.rewind.noneLeft
              : format(t.rewind.left, { count: left })}
      </p>
      {points !== null && past.length === 0 && <Empty icon="calendar">{t.rewind.empty}</Empty>}
      <div className="stack">
        {[...past].reverse().map((point) => (
          <Card
            key={`${point.date.year}-${point.date.month}`}
            title={format(t.rewind.point, {
              month: texts.calendar.months[point.date.month - 1] ?? '',
              year: point.date.year,
            })}
            testId="rewind-point"
          >
            <p className="small">
              {format(t.rewind.netWorth, { amount: formatEuros(point.netWorth) })}
            </p>
            {confirm === point ? (
              <>
                <p className="small">
                  {format(t.rewind.confirm, { date: formatGameDate(point.date) })}
                </p>
                <div className="row wrap">
                  <button type="button" className="button primary" onClick={() => rewind(point)}>
                    {t.common.confirm}
                  </button>
                  <button type="button" className="button" onClick={() => setConfirm(null)}>
                    {t.common.cancel}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="button"
                disabled={left === 0}
                onClick={() => setConfirm(point)}
              >
                {t.rewind.go}
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
