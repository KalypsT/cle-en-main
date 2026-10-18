import { toDayNumber } from '@cle/engine';
import { engine } from '../engine.ts';
import { type Route, useGame, useNav } from '../game/context.tsx';
import { format, formatDayLong, formatWhen, propertyLabel, t, tradeName } from '../texts.ts';
import { Empty, ListRow, ScreenHeader } from '../ui/components.tsx';
import type { IconName } from '../ui/Icon.tsx';

interface Entry {
  day: number;
  icon: IconName;
  text: string;
  route: Route;
}

/** « Agenda léger » (docs/03-systemes/01): visits, deeds, works, meetings to come. */
export function AgendaScreen() {
  const { state } = useGame();
  const nav = useNav();
  const today = toDayNumber(state.clock.date);
  const entries: Entry[] = [];

  for (const item of state.agenda) {
    const listing = state.listings.find((l) => l.id === item.listingId);
    if (!listing) continue;
    entries.push({
      day: item.day,
      icon: 'key',
      text: format(t.agenda.visit, { title: propertyLabel(listing.property) }),
      route: { name: 'listing', id: listing.id },
    });
  }
  for (const purchase of state.purchases) {
    const title = propertyLabel(purchase.property);
    const route: Route = { name: 'purchase', id: purchase.id };
    if (!purchase.acceptedApplicationId && !purchase.cash) {
      entries.push({
        day: purchase.loanDeadlineDay,
        icon: 'bank',
        text: format(t.agenda.loanDeadline, { title }),
        route,
      });
    }
    entries.push({
      day: purchase.deedDay,
      icon: 'book',
      text: format(t.agenda.deed, { title }),
      route,
    });
  }
  for (const owned of state.properties) {
    const id = owned.property.id;
    const title = propertyLabel(owned.property);
    if (owned.works) {
      for (const task of engine.worksPlan(state, id) ?? []) {
        if (task.status === 'done') continue;
        entries.push({
          day: Math.max(today, task.startDay),
          icon: 'wrench',
          text: format(t.agenda.works, { trade: tradeName(task.trade), title }),
          route: { name: 'works', id },
        });
      }
    }
    if (owned.coproMeeting) {
      entries.push({
        day: owned.coproMeeting.voteDay,
        icon: 'decisions',
        text: format(t.agenda.copro, { title }),
        route: { name: 'copro', id },
      });
    }
    if (owned.lease?.noticeEndDay != null) {
      entries.push({
        day: owned.lease.noticeEndDay,
        icon: 'person',
        text: format(t.agenda.leaseEnd, { title }),
        route: { name: 'property', id, tab: 'rental' },
      });
    }
    if (owned.sale?.agreement) {
      entries.push({
        day: owned.sale.agreement.deedDay,
        icon: 'tag',
        text: format(t.agenda.saleDeed, { title }),
        route: { name: 'sale', id },
      });
    }
    for (const quote of owned.quotes) {
      entries.push({
        day: quote.expiresDay,
        icon: 'clock',
        text: format(t.agenda.quote, { title }),
        route: { name: 'works', id },
      });
    }
  }
  entries.sort((a, b) => a.day - b.day);

  return (
    <div className="screen">
      <ScreenHeader title={t.agenda.heading} onBack={nav.pop} />
      {entries.length === 0 ? (
        <Empty icon="calendar">{t.agenda.empty}</Empty>
      ) : (
        <div className="list">
          {entries.map((entry, index) => (
            <ListRow
              key={index}
              icon={entry.icon}
              title={entry.text}
              subtitle={`${formatDayLong(entry.day)} · ${formatWhen(entry.day, state.clock.date)}`}
              onClick={() => nav.push(entry.route)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
