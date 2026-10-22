import type { AgendaItem, GameState } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankerName,
  cityName,
  format,
  formatDayLong,
  formatDuration,
  propertyLabel,
  t,
} from '../texts.ts';
import { Badge, Card, ScreenHeader } from '../ui/components.tsx';

function itemLabel(state: GameState, item: AgendaItem): string {
  const items = t.agenda.items;
  switch (item.kind) {
    case 'visit': {
      const listing = state.listings.find((l) => l.id === item.listingId);
      return format(items.visit, { label: listing ? propertyLabel(listing.property) : '' });
    }
    case 'bankMeeting':
      return format(items.bankMeeting, { banker: bankerName(item.bankId) });
    case 'selfRepair': {
      const owned = state.properties.find((o) => o.property.id === item.propertyId);
      return format(items.selfRepair, { label: owned ? propertyLabel(owned.property) : '' });
    }
  }
}

/** « Agenda » (docs/03-systemes/01): the week, the free time of each day, the planned actions. */
export function AgendaScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const week = engine.agendaWeek(state, 14);
  return (
    <div className="screen">
      <ScreenHeader title={t.agenda.heading} onBack={nav.pop} />
      <p className="small muted">{t.agenda.intro}</p>
      <div className="stack">
        {week.map((day) => (
          <Card
            key={day.day}
            title={formatDayLong(day.day)}
            aside={
              <Badge tone={day.kind === 'work' ? undefined : 'accent'}>
                {day.holiday && day.kind === 'schoolHoliday'
                  ? day.holiday
                  : t.agenda.kinds[day.kind]}
              </Badge>
            }
            testId={`agenda-${day.day}`}
          >
            <p className="small">
              {format(t.agenda.free, { duration: formatDuration(day.freeMinutes) })}
            </p>
            {day.trips.map((trip) => (
              <p key={trip.cityId} className="small muted">
                {format(t.agenda.trip, {
                  city: cityName(trip.cityId),
                  duration: formatDuration(trip.minutes),
                })}
              </p>
            ))}
            {day.planned.length === 0 ? (
              <p className="small muted">{t.agenda.nothing}</p>
            ) : (
              day.planned.map((item) => (
                <div key={item.id} className="row between wrap">
                  <span>
                    {item.cityId === state.player.baseCityId
                      ? itemLabel(state, item)
                      : format(t.agenda.inCity, {
                          label: itemLabel(state, item),
                          city: cityName(item.cityId),
                        })}{' '}
                    · {formatDuration(item.minutes)}
                  </span>
                  <span className="row">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        act(
                          { type: 'agenda/move', itemId: item.id, day: item.day + 1 },
                          t.agenda.moved,
                        )
                      }
                    >
                      {t.agenda.later}
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() =>
                        act({ type: 'agenda/cancel', itemId: item.id }, t.agenda.cancelled)
                      }
                    >
                      {t.agenda.cancel}
                    </button>
                  </span>
                </div>
              ))
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
