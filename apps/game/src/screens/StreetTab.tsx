import { gameContent } from '@cle/content';
import { decisionKey } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { cityName, format, formatEuros, formatSigned, jobName, t, tone } from '../texts.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { useState } from 'react';
import { Empty, SectionTitle, Tile } from '../ui/components.tsx';
import { Icon } from '../ui/Icon.tsx';
import { DecisionRow } from './DecisionsTab.tsx';
import { ListingRow } from './ListingsScreen.tsx';

/** How many items each section of the dashboard shows. */
const OPPORTUNITIES = 3;
const DECISIONS = 3;
const NEWS = 6;

/**
 * Dashboard of the « Rue » tab, in a drawer over the living street (the
 * street itself is drawn by GameShell, see src/world/StreetWorld.tsx). Closed,
 * it shows the greeting, the net worth and the month; open, the best deals,
 * the decisions and the news. On a wide screen it stays open beside the street.
 */
export function StreetTab({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = inline || open;
  const { state, snapshot } = useGame();
  const nav = useNav();
  const { player } = state;
  const cityId = gameContent.start.cityId;
  const summary = engine.portfolio(state);
  // The best deals by the player's own estimate.
  const opportunities = state.listings
    .filter((listing) => !listing.offer || listing.offer.counter)
    .map((listing) => ({ listing, view: engine.listingView(state, listing.id) }))
    .sort((a, b) => (b.view?.valueGap ?? -1) - (a.view?.valueGap ?? -1))
    .slice(0, OPPORTUNITIES);

  return (
    <section
      className={`street-drawer${expanded ? ' open' : ''}${inline ? ' inline' : ''}`}
      aria-label={t.street.dashboard}
      data-testid="street-drawer"
    >
      {!inline && (
        <button
          type="button"
          className="drawer-handle"
          aria-expanded={open}
          aria-label={open ? t.street.closeDashboard : t.street.openDashboard}
          onClick={() => setOpen(!open)}
        >
          <span className="drawer-grip" />
          <Icon name="chevron" size={16} />
        </button>
      )}
      <div className="row drawer-peek">
        <Avatar
          parts={player.avatar}
          size={40}
          label={format(t.avatar.label, { name: player.name })}
        />
        <div className="stack tight grow">
          <h1 className="h2 display">{format(t.street.hello, { name: player.name })}</h1>
          <p className="small muted">
            {format(t.street.subtitle, { job: jobName(player.jobId), city: cityName(cityId) })}
          </p>
        </div>
        {!expanded && (
          <div className="drawer-figures">
            <span className="tiny muted">{t.street.netWorth}</span>
            <strong>{formatEuros(summary.netWorth)}</strong>
            <span className={`tiny ${tone(summary.monthlyBudget)}`}>
              {formatSigned(summary.monthlyBudget)}
            </span>
          </div>
        )}
      </div>
      {expanded && (
        <div className="drawer-body stack">
          <div className="grid-2">
            <Tile
              label={t.street.netWorth}
              value={formatEuros(summary.netWorth)}
              hint={
                summary.properties.length > 0
                  ? format(t.street.properties, { count: summary.properties.length })
                  : t.street.noProperty
              }
              onClick={() => nav.goTab('assets')}
            />
            <Tile
              label={t.street.monthly}
              value={
                <span className={tone(summary.monthlyBudget)}>
                  {formatSigned(summary.monthlyBudget)}
                </span>
              }
              hint={t.street.monthlyHint}
              onClick={() => nav.goTab('assets')}
            />
          </div>

          <SectionTitle
            title={t.street.opportunities}
            action={
              <button
                type="button"
                className="link-button"
                onClick={() => nav.push({ name: 'listings' })}
              >
                {format(t.common.seeAll, { count: state.listings.length })}
              </button>
            }
          />
          <div className="list">
            {opportunities.map(({ listing, view }) => (
              <ListingRow key={listing.id} listing={listing} view={view} />
            ))}
          </div>

          <SectionTitle
            title={t.street.toHandle}
            action={
              snapshot.decisions.length > DECISIONS && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => nav.goTab('decisions')}
                >
                  {format(t.common.seeAll, { count: snapshot.decisions.length })}
                </button>
              )
            }
          />
          {snapshot.decisions.length === 0 ? (
            <p className="small muted">{t.street.nothingToHandle}</p>
          ) : (
            <div className="list">
              {snapshot.decisions.slice(0, DECISIONS).map((decision) => (
                <DecisionRow key={decisionKey(decision)} decision={decision} />
              ))}
            </div>
          )}

          <SectionTitle title={t.street.news} />
          {snapshot.feed.length === 0 ? (
            <Empty icon="street">{t.street.noNews}</Empty>
          ) : (
            <ul className="card feed" aria-live="polite">
              {snapshot.feed.slice(0, NEWS).map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
