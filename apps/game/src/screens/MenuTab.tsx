import { useGame, useNav, type Route } from '../game/context.tsx';
import { t } from '../texts.ts';
import { Badge, ListRow, ScreenHeader } from '../ui/components.tsx';
import type { IconName } from '../ui/Icon.tsx';

interface Entry {
  label: string;
  icon: IconName;
  route?: Route;
  /** Arrives with a later milestone. */
  later?: boolean;
}

/** « Menu » (docs/04, 4.4): Villes, Agenda, bilans, Progression, Statistiques, Réglages. */
export function MenuTab() {
  const { save, exportGame, quit } = useGame();
  const nav = useNav();
  const entries: Entry[] = [
    { label: t.menu.me, icon: 'person', route: { name: 'me' } },
    { label: t.menu.cities, icon: 'globe', route: { name: 'cities' } },
    { label: t.menu.bank, icon: 'euro', route: { name: 'bank' } },
    { label: t.menu.agenda, icon: 'calendar', route: { name: 'agenda' } },
    { label: t.menu.contacts, icon: 'book', route: { name: 'contacts' } },
    { label: t.menu.statement, icon: 'euro', route: { name: 'monthReview' } },
    { label: t.menu.yearReview, icon: 'book', route: { name: 'yearReview' } },
    { label: t.menu.progression, icon: 'trophy', route: { name: 'progression' } },
    { label: t.menu.statistics, icon: 'chart', route: { name: 'statistics' } },
    { label: t.menu.settings, icon: 'settings', route: { name: 'settings' } },
  ];
  return (
    <div className="screen">
      <ScreenHeader title={t.menu.heading} />
      <div className="list">
        {entries.map((entry) => (
          <ListRow
            key={entry.label}
            icon={entry.icon}
            title={entry.label}
            extra={entry.later && <Badge>{t.menu.comingLater}</Badge>}
            onClick={entry.route ? () => entry.route && nav.push(entry.route) : undefined}
          />
        ))}
      </div>
      <div className="stack">
        <button type="button" className="button primary block" onClick={save}>
          {t.menu.save}
        </button>
        <button type="button" className="button block" onClick={exportGame}>
          {t.menu.export}
        </button>
        <button type="button" className="button block" onClick={quit}>
          {t.menu.quit}
        </button>
      </div>
    </div>
  );
}
