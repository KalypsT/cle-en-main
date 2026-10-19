import { decisionKey, type GameState, type PendingDecision } from '@cle/engine';
import { useGame, useNav, type Route } from '../game/context.tsx';
import {
  findCatalogEvent,
  format,
  formatEuros,
  formatPercent,
  formatWhen,
  giverName,
  propertyLabel,
  t,
} from '../texts.ts';
import { Badge, Empty, ListRow, ScreenHeader } from '../ui/components.tsx';
import type { IconName } from '../ui/Icon.tsx';

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
    case 'worksHazard':
    case 'coproVote':
    case 'quoteExpiring':
    case 'dpeWarning':
    case 'vacant':
      return { name: 'property', id: decision.propertyId };
    case 'catalogEvent':
      return { name: 'event', id: decision.instanceId };
    case 'challengeOffer':
      return { name: 'challenge' };
    case 'renegotiation':
    case 'cashAlert':
      return null;
  }
}

export function DecisionRow({ decision }: { decision: PendingDecision }) {
  const { state } = useGame();
  const nav = useNav();
  const route = decisionRoute(decision);
  const subject = decisionSubject(decision, state);
  const urgent =
    decision.deadlineDay !== null && formatWhen(decision.deadlineDay, state.clock.date);
  return (
    <ListRow
      icon={ICONS[decision.kind]}
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

export function DecisionsTab() {
  const { snapshot } = useGame();
  const { decisions } = snapshot;
  return (
    <div className="screen">
      <ScreenHeader title={t.decisions.heading} />
      {decisions.length === 0 ? (
        <Empty icon="check">{t.decisions.empty}</Empty>
      ) : (
        <div className="list">
          {decisions.map((decision) => (
            <DecisionRow key={decisionKey(decision)} decision={decision} />
          ))}
        </div>
      )}
    </div>
  );
}
