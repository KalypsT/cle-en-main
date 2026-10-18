import { gameContent } from '@cle/content';
import type { CatalogItem, Property, RateQuote, ValueBreakdown } from '@cle/engine';
import { format, formatEuros, formatPercent, itemName, spaceName, t } from '../texts.ts';
import { Badge, KeyValues, StateDots } from './components.tsx';
import { Icon } from './Icon.tsx';

function factor(value: number): string {
  return format(t.value.factor, {
    value: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(value),
  });
}

/** « D'où vient cette valeur ? »: the factors of the engine's valuation. */
export function ValueWhy({ breakdown }: { breakdown: ValueBreakdown }) {
  const rows = [
    {
      label: t.value.median,
      value: format(t.value.perM2, { amount: formatEuros(breakdown.medianPricePerM2 * 100) }),
    },
    { label: t.value.priceIndex, value: factor(breakdown.priceIndex) },
    { label: t.value.surface, value: factor(breakdown.surfaceFactor) },
    { label: t.value.epoch, value: factor(breakdown.epochFactor) },
    { label: t.value.dpe, value: factor(breakdown.dpeFactor) },
    { label: t.value.state, value: factor(breakdown.stateFactor) },
    { label: t.value.tiers, value: factor(breakdown.tierFactor) },
    { label: t.value.floor, value: factor(breakdown.floorFactor) },
    { label: t.value.defects, value: factor(breakdown.defectsFactor) },
  ];
  if (breakdown.buildingFactor !== 1) {
    rows.push({ label: t.value.building, value: factor(breakdown.buildingFactor) });
  }
  return (
    <KeyValues
      rows={[...rows, { label: t.value.result, value: formatEuros(breakdown.value), total: true }]}
    />
  );
}

const RATE_KEYS = [
  'marketPercent',
  'durationSpreadPercent',
  'insurancePercent',
  'bankMarginPercent',
  'profilePercent',
  'trustPercent',
] as const;

function signedPercent(value: number): string {
  const sign = value > 0 ? t.common.plus : value < 0 ? t.common.minus : '';
  return `${sign}${formatPercent(Math.abs(value))}`;
}

/** « D'où vient ce taux ? »: market, duration, insurance, margin, profile, trust. */
export function RateWhy({ quote }: { quote: RateQuote }) {
  return (
    <KeyValues
      rows={[
        ...RATE_KEYS.map((key, index) => ({
          label: t.financing.rateLines[key],
          value: index === 0 ? formatPercent(quote[key]) : signedPercent(quote[key]),
        })),
        {
          label: t.financing.rateLines.ratePercent,
          value: formatPercent(quote.ratePercent),
          total: true,
        },
      ]}
    />
  );
}

/** Rooms and elements of a dwelling with the state the player knows. */
export function ItemsList({
  property,
  items,
  collapsed = false,
}: {
  property: Property;
  items: CatalogItem[];
  /** Rooms folded to one line each (listing sheet). */
  collapsed?: boolean;
}) {
  const groups = new Map<string | null, CatalogItem[]>();
  for (const item of items) {
    const list = groups.get(item.spaceId) ?? [];
    list.push(item);
    groups.set(item.spaceId, list);
  }
  const states = gameContent.worksTexts.states;
  return (
    <div className="stack">
      {[...groups].map(([spaceId, list]) => (
        <details key={spaceId ?? 'dwelling'} className="items-group" open={!collapsed}>
          <summary className="row between">
            <span className="h3">
              {spaceId ? spaceName(property, spaceId) : t.property.element}
            </span>
            <span className="tiny muted">
              {format(t.listing.itemsCount, {
                known: list.filter((item) => item.state !== null).length,
                total: list.length,
              })}
            </span>
          </summary>
          {list.map((item) => (
            <div key={item.id} className="row between small">
              <span>{itemName(item.kind)}</span>
              {item.state === null ? (
                <Badge icon="lock">{t.listing.unknown}</Badge>
              ) : (
                <span className="row" style={{ gap: 8 }}>
                  <span className="muted tiny">{states[item.state - 1]}</span>
                  <StateDots state={item.state} />
                </span>
              )}
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}

/** One-line summary of the known items (« 3 sur 12 connus »). */
export function ItemsSummary({ known, total }: { known: number; total: number }) {
  return (
    <span className="small muted row" style={{ gap: 4 }}>
      <Icon name="lock" size={14} />
      {format(t.listing.itemsCount, { known, total })}
    </span>
  );
}
