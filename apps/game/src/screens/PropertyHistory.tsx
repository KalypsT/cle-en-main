import { gameContent } from '@cle/content';
import type { OwnedProperty, PropertyLogEntry } from '@cle/engine';
import { useState } from 'react';
import {
  agencyName,
  artisanName,
  format,
  formatDayLong,
  formatDayYear,
  formatEuros,
  itemName,
  spaceName,
  t,
} from '../texts.ts';
import { Card, Chip } from '../ui/components.tsx';

/** « 8 mois », « 2 ans et 3 mois » (a lease, from a number of days). */
export function formatLeaseDuration(days: number): string {
  const months = Math.max(1, Math.round(days / 30.4));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years > 0 ? format(t.property.history.years, { count: years }) : '',
    rest > 0 ? format(t.property.history.months, { count: rest }) : '',
  ].filter(Boolean);
  return parts.join(' ');
}

type Filter = keyof typeof t.property.history.filters & string;
const FILTERS: readonly Filter[] = ['all', 'works', 'tenants', 'market', 'other'];

const FAMILY: Record<PropertyLogEntry['kind'], Exclude<Filter, 'all'>> = {
  works: 'works',
  worksCompleted: 'works',
  transformation: 'works',
  incident: 'tenants',
  tenantIn: 'tenants',
  tenantOut: 'tenants',
  notice: 'tenants',
  buyout: 'tenants',
  rentMissed: 'tenants',
  reminder: 'tenants',
  procedure: 'tenants',
  rentRevised: 'tenants',
  leaseRenewed: 'tenants',
  listedForRent: 'tenants',
  rentalWithdrawn: 'tenants',
  furniture: 'tenants',
  bought: 'market',
  listedForSale: 'market',
  saleWithdrawn: 'market',
  saleAgreed: 'market',
  saleFellThrough: 'market',
  dpeWarning: 'other',
  copro: 'other',
  home: 'other',
  regime: 'other',
};

/** A line of the history: what happened, and its details. */
function describe(property: OwnedProperty['property'], entry: PropertyLogEntry) {
  const texts = t.property.history;
  switch (entry.kind) {
    case 'works':
      return {
        title: format(texts.works, {
          item: entry.spaceId
            ? `${spaceName(property, entry.spaceId)} : ${itemName(entry.itemKind)}`
            : itemName(entry.itemKind),
          tier: gameContent.worksTexts.tiers[entry.tier].toLowerCase(),
        }),
        details: [
          format(texts.worksBy, {
            who: entry.artisanId ? artisanName(entry.artisanId) : texts.byYou,
            cost: formatEuros(entry.cost),
          }),
        ],
      };
    case 'tenantIn':
      return {
        title: format(texts.tenantIn, {
          name: entry.tenantName,
          rent: formatEuros(entry.monthlyRent),
        }),
        details: [],
      };
    case 'tenantOut':
      return {
        title: format(texts.tenantOut, {
          name: entry.tenantName,
          reason: texts.tenantReasons[entry.reason],
        }),
        details: [
          format(texts.tenantOutDetails, {
            duration: formatLeaseDuration(entry.day - entry.startDay),
            rent: formatEuros(entry.monthlyRent),
          }),
          ...(entry.depositReturned + entry.damages > 0
            ? [
                format(texts.tenantOutMoney, {
                  returned: formatEuros(entry.depositReturned),
                  damages: formatEuros(entry.damages),
                }),
              ]
            : []),
        ],
      };
    case 'incident':
      return {
        title: format(texts.incident, {
          text: gameContent.tenantTexts.incidents[entry.kindId] ?? entry.kindId,
          cost: formatEuros(entry.cost),
        }),
        details: [],
      };
    case 'bought':
      return { title: format(texts.bought, { price: formatEuros(entry.price) }), details: [] };
    case 'listedForSale':
      return {
        title: format(texts.listedForSale, {
          price: formatEuros(entry.askingPrice),
          mode: texts.saleModes[entry.mode],
        }),
        details: [],
      };
    case 'saleWithdrawn':
      return { title: texts.saleWithdrawn, details: [] };
    case 'saleAgreed':
      return { title: format(texts.saleAgreed, { price: formatEuros(entry.price) }), details: [] };
    case 'saleFellThrough':
      return { title: texts.saleFellThrough, details: [] };
    case 'listedForRent':
      return {
        title: format(texts.listedForRent, {
          lease: t.property.leaseType[entry.leaseType],
          rent: formatEuros(entry.monthlyRent),
        }),
        details: [
          format(texts.rentHow, {
            management: entry.agencyId ? agencyName(entry.agencyId) : texts.selfManaged,
            insurance: entry.insured ? texts.insured : texts.notInsured,
          }),
        ],
      };
    case 'rentalWithdrawn':
      return { title: texts.rentalWithdrawn, details: [] };
    case 'furniture':
      return { title: format(texts.furniture, { cost: formatEuros(entry.cost) }), details: [] };
    case 'notice':
      return {
        title: format(texts.notice, { date: formatDayLong(entry.leaveDay) }),
        details: [texts.noticeReasons[entry.reason]],
      };
    case 'buyout':
      return {
        title: format(entry.accepted ? texts.buyoutAccepted : texts.buyoutRefused, {
          amount: formatEuros(entry.amount),
        }),
        details: [],
      };
    case 'rentMissed':
      return {
        title: format(entry.insured ? texts.rentMissedInsured : texts.rentMissed, {
          amount: formatEuros(entry.amount),
        }),
        details: [],
      };
    case 'reminder':
      return {
        title: entry.settled ? texts.reminderSettled : texts.reminderFailed,
        details: [],
      };
    case 'procedure':
      return {
        title: format(texts.procedure, {
          cost: formatEuros(entry.cost),
          date: formatDayLong(entry.evictionDay),
        }),
        details: [],
      };
    case 'rentRevised':
      return {
        title: format(texts.rentRevised, { rent: formatEuros(entry.monthlyRent) }),
        details: [],
      };
    case 'leaseRenewed':
      return {
        title: format(texts.leaseRenewed, { date: formatDayLong(entry.termDay) }),
        details: [],
      };
    case 'dpeWarning':
      return {
        title: format(texts.dpeWarning, { date: formatDayLong(entry.banDay) }),
        details: [],
      };
    case 'worksCompleted':
      return {
        title: format(texts.worksCompleted, { cost: formatEuros(entry.cost) }),
        details: [format(texts.dpeChange, { before: entry.dpeBefore, after: entry.dpeAfter })],
      };
    case 'copro': {
      const works = gameContent.worksTexts;
      return {
        title: format(texts.copro, {
          passed: entry.results.filter((result) => result.passed).length,
          count: entry.results.length,
        }),
        details: entry.results.map((result) =>
          format(t.decisions.mail.coproLine, {
            resolution: works.resolutions[result.id] ?? result.id,
            verdict:
              (result.passed ? works.meetingPassed : works.meetingRejected)[result.textIndex] ?? '',
          }),
        ),
      };
    }
    case 'transformation':
      return {
        title: format(texts.transformation, {
          kind: t.transformation.kinds[entry.transformation],
          cost: formatEuros(entry.cost),
        }),
        details: [],
      };
    case 'home':
      return { title: entry.movedIn ? texts.movedIn : texts.movedOut, details: [] };
    case 'regime':
      return {
        title: format(texts.regime, { regime: t.property.regimes[entry.regime] }),
        details: [],
      };
  }
}

/** What happened to the property, most recent first, by family. */
export function History({
  property,
  log,
}: {
  property: OwnedProperty['property'];
  log: OwnedProperty['log'];
}) {
  const texts = t.property.history;
  const [filter, setFilter] = useState<Filter>('all');
  const entries = log
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => filter === 'all' || FAMILY[entry.kind] === filter)
    .reverse();
  const spent = log.reduce((sum, entry) => sum + (entry.kind === 'works' ? entry.cost : 0), 0);
  return (
    <Card title={texts.heading} testId="property-history">
      {log.length > 0 && (
        <div className="chips" role="group" aria-label={texts.heading}>
          {FILTERS.map((id) => (
            <Chip key={id} pressed={filter === id} onClick={() => setFilter(id)}>
              {texts.filters[id]}
            </Chip>
          ))}
        </div>
      )}
      {entries.length === 0 && <p className="small muted">{texts.empty}</p>}
      <ul className="stack">
        {entries.map(({ entry, index }) => {
          const { title, details } = describe(property, entry);
          return (
            <li key={index} className="stack tight" data-kind={entry.kind}>
              <span className="row between small">
                <span className="strong">{title}</span>
                <span className="tiny muted">{formatDayYear(entry.day)}</span>
              </span>
              {details.map((line) => (
                <span key={line} className="tiny muted">
                  {line}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      {spent > 0 && <p className="small">{format(texts.total, { amount: formatEuros(spent) })}</p>}
    </Card>
  );
}
