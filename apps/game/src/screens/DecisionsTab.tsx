import { gameContent } from '@cle/content';
import {
  decisionKey,
  type GameState,
  type MailItem,
  type PendingDecision,
  type Property,
} from '@cle/engine';
import { useEffect, useState } from 'react';
import { useGame, useNav, type Route } from '../game/context.tsx';
import {
  MAIL_ICONS,
  mailText,
  NEWS_FILTERS,
  type NewsCategory,
  newsCategory,
  newsLines,
  subjectRoute,
} from '../inbox.ts';
import {
  findCatalogEvent,
  format,
  formatDayYear,
  formatEuros,
  formatPercent,
  formatWhen,
  giverName,
  propertyLabel,
  subjectLabel,
  t,
} from '../texts.ts';
import { Badge, Chip, Empty, ListRow, ScreenHeader, Segmented } from '../ui/components.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { PropertyThumb } from '../ui/Facade.tsx';

const ICONS: Record<PendingDecision['kind'], IconName> = {
  counterOffer: 'tag',
  loanNeeded: 'bank',
  loanAnswer: 'bank',
  deedFunds: 'euro',
  candidates: 'person',
  saleOffer: 'tag',
  worksHazard: 'wrench',
  coproVote: 'decisions',
  incident: 'alert',
  quoteExpiring: 'clock',
  dpeWarning: 'alert',
  vacant: 'key',
  renegotiation: 'bank',
  cashAlert: 'alert',
  catalogEvent: 'info',
  challengeOffer: 'trophy',
};

export function decisionTitle(decision: PendingDecision): string {
  const texts = t.decisions.kinds;
  switch (decision.kind) {
    case 'counterOffer':
    case 'saleOffer':
      return format(texts[decision.kind], { amount: formatEuros(decision.amount) });
    case 'deedFunds':
      return format(texts.deedFunds, { amount: formatEuros(decision.missing) });
    case 'candidates':
      return format(texts.candidates, { count: decision.count });
    case 'worksHazard':
      return format(texts.worksHazard, { amount: formatEuros(decision.cost) });
    case 'coproVote':
      return format(texts.coproVote, { count: decision.resolutions });
    case 'renegotiation':
      return format(texts.renegotiation, { rate: formatPercent(decision.marketPercent) });
    case 'cashAlert':
      return format(texts.cashAlert, { amount: formatEuros(decision.lowest) });
    case 'challengeOffer':
      return format(texts.challengeOffer, { giver: giverName(decision.challengeId) });
    case 'catalogEvent':
    case 'loanNeeded':
    case 'loanAnswer':
    case 'incident':
    case 'quoteExpiring':
    case 'dpeWarning':
    case 'vacant':
      return texts[decision.kind];
  }
}

/** The property a decision is about, if there is one (its picture goes in the row). */
function decisionProperty(decision: PendingDecision, state: GameState): Property | null {
  if (decision.kind === 'catalogEvent') {
    const instance = state.catalog.pending.find((p) => p.id === decision.instanceId);
    return state.properties.find((o) => o.property.id === instance?.propertyId)?.property ?? null;
  }
  if ('listingId' in decision) {
    return state.listings.find((l) => l.id === decision.listingId)?.property ?? null;
  }
  if ('purchaseId' in decision) {
    return state.purchases.find((p) => p.id === decision.purchaseId)?.property ?? null;
  }
  if ('propertyId' in decision) {
    return state.properties.find((o) => o.property.id === decision.propertyId)?.property ?? null;
  }
  return null;
}

/** What the decision is about: the property's label, or the event's family. */
function decisionSubject(decision: PendingDecision, state: GameState): string | null {
  if (decision.kind === 'catalogEvent') {
    const instance = state.catalog.pending.find((p) => p.id === decision.instanceId);
    const owned = state.properties.find((o) => o.property.id === instance?.propertyId);
    const family = findCatalogEvent(decision.eventId)?.family;
    return owned ? propertyLabel(owned.property) : family ? t.event.families[family] : null;
  }
  if ('listingId' in decision) {
    const listing = state.listings.find((l) => l.id === decision.listingId);
    return listing ? propertyLabel(listing.property) : null;
  }
  if ('purchaseId' in decision) {
    const purchase = state.purchases.find((p) => p.id === decision.purchaseId);
    return purchase ? propertyLabel(purchase.property) : null;
  }
  if ('propertyId' in decision) {
    const owned = state.properties.find((o) => o.property.id === decision.propertyId);
    return owned ? propertyLabel(owned.property) : null;
  }
  return null;
}

/** Screen that answers a decision. */
export function decisionRoute(decision: PendingDecision): Route | null {
  switch (decision.kind) {
    case 'counterOffer':
      return { name: 'listing', id: decision.listingId };
    case 'loanNeeded':
    case 'loanAnswer':
    case 'deedFunds':
      return { name: 'purchase', id: decision.purchaseId };
    case 'candidates':
      return { name: 'rent', id: decision.propertyId };
    case 'incident':
      return { name: 'property', id: decision.propertyId, tab: 'rental' };
    case 'saleOffer':
      return { name: 'sale', id: decision.propertyId };
    case 'worksHazard':
    case 'quoteExpiring':
      return { name: 'works', id: decision.propertyId };
    case 'coproVote':
    case 'dpeWarning':
    case 'vacant':
      return { name: 'property', id: decision.propertyId };
    case 'catalogEvent':
      return { name: 'event', id: decision.instanceId };
    case 'challengeOffer':
      return { name: 'challenge' };
    case 'renegotiation':
    case 'cashAlert':
      return { name: 'bank' };
  }
}

export function DecisionRow({ decision }: { decision: PendingDecision }) {
  const { state } = useGame();
  const nav = useNav();
  const route = decisionRoute(decision);
  const subject = decisionSubject(decision, state);
  const property = decisionProperty(decision, state);
  const owned = property !== null && state.properties.some((o) => o.property.id === property.id);
  const urgent =
    decision.deadlineDay !== null && formatWhen(decision.deadlineDay, state.clock.date);
  return (
    <ListRow
      icon={property ? undefined : ICONS[decision.kind]}
      thumb={
        property ? (
          // The building, and the kind of decision as a small mark over its corner.
          <span className="thumb-marked">
            <PropertyThumb property={property} owned={owned} />
            <span className="thumb-mark">
              <Icon name={ICONS[decision.kind]} size={13} />
            </span>
          </span>
        ) : undefined
      }
      title={decisionTitle(decision)}
      subtitle={subject ?? undefined}
      testId={`decision-${decision.kind}`}
      extra={
        <>
          {decision.deadlineDay !== null ? (
            <Badge
              tone={decision.autoPause || decision.kind === 'cashAlert' ? 'amber' : undefined}
              icon="clock"
            >
              {format(t.decisions.deadline, { when: urgent || '' })}
            </Badge>
          ) : null}
          {decision.autoPause && <Badge>{t.decisions.pauses}</Badge>}
        </>
      }
      onClick={() => (route ? nav.push(route) : nav.goTab('assets'))}
    />
  );
}

/** A letter of the mail: an answer received or a decision settled, until it is closed. */
function MailRow({ item }: { item: MailItem }) {
  const { state, act } = useGame();
  const nav = useNav();
  const route = subjectRoute(state, item.subject);
  const { title, details } = mailText(state, item);
  return (
    <ListRow
      icon={MAIL_ICONS[item.kind]}
      title={title}
      subtitle={
        <>
          {item.subject && <span className="block">{subjectLabel(item.subject)}</span>}
          {details.map((line, index) => (
            <span key={index} className="block small">
              {line}
            </span>
          ))}
        </>
      }
      testId={`mail-${item.kind}`}
      extra={
        <>
          <Badge icon="clock">{formatDayYear(item.day)}</Badge>
          {item.kind === 'catalogEvent' && item.auto && (
            <Badge tone="amber">{t.decisions.auto}</Badge>
          )}
        </>
      }
      side={
        <button
          type="button"
          className="link-button"
          onClick={(event) => {
            event.stopPropagation();
            act({ type: 'inbox/dismissMail', mailId: item.id });
          }}
        >
          {t.decisions.closeNotice}
        </button>
      }
      onClick={route ? () => nav.push(route) : undefined}
    />
  );
}

function Mail() {
  const { state, act } = useGame();
  const mail = state.inbox.mail.filter((item) => !item.dismissed).reverse();
  const months = Math.round(gameContent.rhythm.inbox.mailKeptDays / 30);
  return (
    <>
      <div className="section-title">
        <p className="small muted">{format(t.decisions.mailHint, { months })}</p>
        {mail.length > 0 && (
          <button
            type="button"
            className="link-button"
            onClick={() => act({ type: 'inbox/dismissMail', mailId: null })}
          >
            {t.decisions.closeAllNotices}
          </button>
        )}
      </div>
      {mail.length === 0 ? (
        <Empty icon="check">{t.decisions.mailEmpty}</Empty>
      ) : (
        <div className="list">
          {mail.map((item) => (
            <MailRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

function News() {
  const { state, act } = useGame();
  const nav = useNav();
  const [filter, setFilter] = useState<NewsCategory>('all');
  // What was new when the section opened stays marked while it is open.
  const [seenAtOpen] = useState(state.inbox.newsSeenId);
  const latest = state.inbox.news.at(-1)?.id ?? 0;
  useEffect(() => {
    if (latest > state.inbox.newsSeenId) act({ type: 'inbox/seeNews' });
  }, [act, latest, state.inbox.newsSeenId]);
  const lines = newsLines(state).filter(
    ({ item }) => filter === 'all' || newsCategory(item) === filter,
  );
  return (
    <>
      <p className="small muted">
        {format(t.decisions.newsHint, { days: gameContent.rhythm.inbox.newsKeptDays })}
      </p>
      <div className="chips" role="group" aria-label={t.decisions.sections.news}>
        {NEWS_FILTERS.map((id) => (
          <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>
            {t.decisions.newsFilters[id]}
          </Chip>
        ))}
      </div>
      {lines.length === 0 ? (
        <Empty icon="street">{t.decisions.newsEmpty}</Empty>
      ) : (
        <ul className="card feed" data-testid="news">
          {lines.map(({ item, text }) => {
            const route = subjectRoute(state, item.subject);
            return (
              <li key={item.id} className={item.id > seenAtOpen ? 'unseen' : undefined}>
                <span className="small muted">
                  {formatDayYear(item.day)}
                  {item.subject && ` · ${subjectLabel(item.subject)}`}
                  {item.id > seenAtOpen && ` · ${t.decisions.unseen}`}
                </span>
                <span className="block">{text}</span>
                {route && (
                  <button type="button" className="link-button" onClick={() => nav.push(route)}>
                    {t.decisions.openSubject}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

type Section = 'pending' | 'mail' | 'news';
const SECTIONS: readonly Section[] = ['pending', 'mail', 'news'];
/** The section shown, kept while the game runs (like the other tabs' screens). */
let lastSection: Section = 'pending';

/** Opens the « Décisions » tab on this section next time (the street's « Tout voir »). */
export function showDecisionsSection(section: Section): void {
  lastSection = section;
}

export function DecisionsTab() {
  const { snapshot, state } = useGame();
  const { decisions } = snapshot;
  const [section, setSection] = useState<Section>(lastSection);
  const choose = (next: Section) => {
    lastSection = next;
    setSection(next);
  };
  const counts: Record<Section, number> = {
    pending: decisions.length,
    mail: state.inbox.mail.filter((item) => !item.dismissed).length,
    news: state.inbox.news.filter((item) => item.id > state.inbox.newsSeenId).length,
  };
  return (
    <div className="screen">
      <ScreenHeader title={t.decisions.heading} />
      <Segmented
        label={t.decisions.heading}
        options={SECTIONS.map((id) => ({
          value: id,
          label:
            counts[id] > 0
              ? format(t.decisions.sectionLabel, {
                  label: t.decisions.sections[id],
                  count: counts[id],
                })
              : t.decisions.sections[id],
        }))}
        value={section}
        onChange={choose}
      />
      {section === 'pending' &&
        (decisions.length === 0 ? (
          <Empty icon="check">{t.decisions.empty}</Empty>
        ) : (
          <div className="list">
            {decisions.map((decision) => (
              <DecisionRow key={decisionKey(decision)} decision={decision} />
            ))}
          </div>
        ))}
      {section === 'mail' && <Mail />}
      {section === 'news' && <News />}
    </div>
  );
}
