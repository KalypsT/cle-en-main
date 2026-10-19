import { toDayNumber } from '@cle/engine';
import { useGame, useNav } from '../game/context.tsx';
import {
  catalogText,
  choiceText,
  findCatalogEvent,
  format,
  formatDuration,
  formatWhen,
  t,
} from '../texts.ts';
import { Badge, Card, Empty, ScreenHeader } from '../ui/components.tsx';

/** A catalogue event waiting for the player's answer (docs/03-systemes/07). */
export function EventScreen({ id }: { id: string }) {
  const { state, act, notify } = useGame();
  const nav = useNav();
  const instance = state.catalog.pending.find((pending) => pending.id === id);
  const event = instance && findCatalogEvent(instance.eventId);
  if (!instance || !event?.choices) {
    return (
      <div className="screen">
        <ScreenHeader title={t.event.heading} onBack={nav.pop} />
        <Empty icon="check">{t.event.gone}</Empty>
      </div>
    );
  }
  const defaultLabel = choiceText(state, instance, event.defaultChoice ?? '') ?? '';
  const choose = (choiceId: string) => {
    const events = act({ type: 'event/choose', eventId: instance.id, choiceId });
    if (!events) return;
    const outcome = choiceText(state, instance, choiceId, 'outcome');
    notify(outcome ?? t.event.chosen);
    nav.pop();
  };
  return (
    <div className="screen">
      <ScreenHeader title={t.event.heading} onBack={nav.pop} />
      <Card
        title={t.event.families[event.family]}
        aside={
          <Badge tone="amber" icon="clock">
            {formatWhen(instance.deadlineDay, state.clock.date)}
          </Badge>
        }
        testId="catalog-event"
      >
        <p className="event-text">{catalogText(state, instance)}</p>
      </Card>
      <div className="stack">
        {event.choices.map((choice) => {
          const minutes = choice.effects.reduce(
            (sum, effect) => sum + (effect.type === 'freeTime' ? effect.minutes : 0),
            0,
          );
          return (
            <button
              key={choice.id}
              type="button"
              className="option-card"
              data-testid={`choice-${choice.id}`}
              onClick={() => choose(choice.id)}
            >
              <span className="strong">{choiceText(state, instance, choice.id)}</span>
              {minutes > 0 && (
                <span className="small muted">
                  {format(t.event.freeTime, { duration: formatDuration(minutes) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="small muted">
        {format(t.event.deadline, {
          when: formatWhen(instance.deadlineDay, state.clock.date),
          choice: defaultLabel,
        })}
      </p>
      {instance.deadlineDay < toDayNumber(state.clock.date) && <p>{t.event.gone}</p>}
    </div>
  );
}
