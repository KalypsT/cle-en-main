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

/** « Menu » (docs/04, 4.4): Villes, Banque, Agenda, Carnet, Progression, Statistiques, Réglages. */
export function MenuTab() {
  const { save, exportGame, quit } = useGame();
  const nav = useNav();
  const entries: Entry[] = [
    { label: t.menu.bank, icon: 'bank', route: { name: 'bank' } },
    { label: t.menu.statement, icon: 'euro', route: { name: 'statement' } },
    { label: t.menu.taxes, icon: 'book', route: { name: 'taxes' } },
    { label: t.menu.agenda, icon: 'calendar', route: { name: 'agenda' } },
    { label: t.menu.contacts, icon: 'person', route: { name: 'contacts' } },
    { label: t.menu.cities, icon: 'globe', later: true },
    { label: t.menu.progression, icon: 'trophy', later: true },
    { label: t.menu.statistics, icon: 'chart', later: true },
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
