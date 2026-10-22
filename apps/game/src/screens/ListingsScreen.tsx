import { gameContent } from '@cle/content';
import type { DealKind, Listing, ListingView, PropertyKind } from '@cle/engine';
import { useMemo } from 'react';
import { engine } from '../engine.ts';
import {
  type ListingFilters,
  type ListingSort,
  type Route,
  useGame,
  useNav,
} from '../game/context.tsx';
import { sellerReply } from '../inbox.ts';
import {
  cityName,
  format,
  formatDecimal,
  formatEuros,
  formatSigned,
  propertyLabel,
  t,
} from '../texts.ts';
import { outlookTone } from '../ui/CashFlowOutlook.tsx';
import { Badge, Chip, Empty, ListRow, ScreenHeader, Segmented } from '../ui/components.tsx';
import { FacadeThumb } from '../ui/Facade.tsx';
import { Icon } from '../ui/Icon.tsx';

type Sort = ListingSort;
const KINDS: PropertyKind[] = ['apartment', 'house', 'building', 'commercial', 'parking', 'land'];
/** Budget filters, in euros (presentation steps, not gameplay values). */
const BUDGETS = [60_000, 90_000, 120_000, 180_000];

const VERDICT_TONES: Record<DealKind, 'green' | 'brick' | undefined> = {
  bargain: 'green',
  fair: undefined,
  expensive: 'brick',
};

/** « Bonne affaire », « Au prix », « Trop cher », and whether the flat would pay for itself. */
export function VerdictBadges({ listingId }: { listingId: string }) {
  const { state } = useGame();
  const verdict = engine.dealVerdict(state, listingId);
  const outlook = engine.cashFlowOutlook(state, listingId);
  return (
    <>
      {verdict && (
        <Badge tone={VERDICT_TONES[verdict.kind]} testId={`verdict-${verdict.kind}`}>
          {t.listings.verdict[verdict.kind]}
        </Badge>
      )}
      {outlook?.tone === 'positive' && (
        <Badge tone="green" icon="check" testId="pays-for-itself">
          {t.listings.paysForItself}
        </Badge>
      )}
    </>
  );
}

export function ListingRow({ listing, view }: { listing: Listing; view: ListingView | null }) {
  const { state } = useGame();
  const nav = useNav();
  const { property } = listing;
  // Its building in the street, read once: the picture does not change with the hours.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const place = useMemo(() => engine.building(state, property.id), [property]);
  const planned = state.agenda.some(
    (item) => item.kind === 'visit' && item.listingId === listing.id,
  );
  const favorite = state.favorites.includes(listing.id);
  const reply = sellerReply(state, listing.id);
  const outlook = engine.cashFlowOutlook(state, listing.id);
  return (
    <ListRow
      thumb={<FacadeThumb property={property} place={place} />}
      testId={`listing-${listing.id}`}
      title={propertyLabel(property)}
      subtitle={
        view &&
        format(t.listings.line, {
          surface: property.surface,
          pricePerM2: format(t.common.perM2, { amount: formatEuros(view.pricePerM2) }),
          dpe: property.dpe,
        })
      }
      extra={
        <>
          <VerdictBadges listingId={listing.id} />
          {listing.offer?.counter ? (
            <Badge tone="amber">{t.listings.counter}</Badge>
          ) : listing.offer ? (
            <Badge tone="accent">{t.listings.offerPending}</Badge>
          ) : reply ? (
            <Badge tone="brick">
              {
                {
                  refused: t.listings.offerRefused,
                  counterExpired: t.listings.counterExpired,
                  counterDeclined: t.listings.counterDeclined,
                }[reply.outcome]
              }
            </Badge>
          ) : null}
          {listing.visited ? (
            <Badge tone="green" icon="check">
              {t.listings.visited}
            </Badge>
          ) : planned ? (
            <Badge icon="clock">{t.listings.visitPlanned}</Badge>
          ) : null}
          {view?.isNew && <Badge tone="accent">{t.listings.new}</Badge>}
          {favorite && (
            <Badge tone="amber" icon="star">
              {t.listings.favorite}
            </Badge>
          )}
        </>
      }
      side={
        <span className="stack tight">
          <span className="strong">{formatEuros(listing.askingPrice)}</span>
          {view && (
            <span className="small positive">
              {format(t.listings.grossYield, { value: formatDecimal(view.grossYieldPercent) })}
            </span>
          )}
          {outlook && (
            <span className={`small ${outlookTone(outlook)}`} data-testid="listing-outlook">
              {format(t.outlook.badge, { amount: formatSigned(outlook.monthly) })}
            </span>
          )}
        </span>
      }
      onClick={() => nav.push({ name: 'listing', id: listing.id })}
    />
  );
}

export function ListingsScreen({ route }: { route: Extract<Route, { name: 'listings' }> }) {
  const { state } = useGame();
  const nav = useNav();
  const cityId = nav.cityId;
  const neighbourhoods = gameContent.cities[cityId]?.neighbourhoods ?? [];
  // The filters live in the route, so opening a listing or another tab does not lose them.
  const filters: ListingFilters = route.filters ?? {
    area: route.neighbourhoodId ?? null,
    kind: null,
    budget: null,
    favorites: route.favorites ?? false,
    sort: 'recent',
  };
  const { area, kind, budget, favorites, sort } = filters;
  const bargains = filters.bargains ?? false;
  const open = route.filtersOpen ?? false;
  const active = [area !== null, kind !== null, budget !== null, favorites, bargains].filter(
    Boolean,
  ).length;
  const change = (patch: Partial<ListingFilters>) =>
    nav.replace({ ...route, filters: { ...filters, ...patch } });
  const setArea = (value: string | null) => change({ area: value });
  const setKind = (value: PropertyKind | null) => change({ kind: value });
  const setBudget = (value: number | null) => change({ budget: value });
  const setFavorites = (value: boolean) => change({ favorites: value });
  const setBargains = (value: boolean) => change({ bargains: value });
  const toggle = () => nav.replace({ ...route, filters, filtersOpen: !open });
  const setSort = (value: Sort) => change({ sort: value });

  const rows = useMemo(() => {
    const filtered = state.listings
      .filter((listing) => listing.property.cityId === cityId)
      .filter((listing) => !area || listing.property.neighbourhoodId === area)
      .filter((listing) => !kind || listing.property.kind === kind)
      .filter((listing) => budget === null || listing.askingPrice <= budget * 100)
      .filter((listing) => !favorites || state.favorites.includes(listing.id))
      .filter((listing) => !bargains || engine.dealVerdict(state, listing.id)?.kind === 'bargain')
      .map((listing) => ({ listing, view: engine.listingView(state, listing.id) }));
    const key: Record<Sort, (row: (typeof filtered)[number]) => number> = {
      recent: (row) => -row.listing.publishedDay,
      price: (row) => row.listing.askingPrice,
      pricePerM2: (row) => row.view?.pricePerM2 ?? 0,
      yield: (row) => -(row.view?.grossYieldPercent ?? 0),
    };
    return filtered.sort((a, b) => key[sort](a) - key[sort](b));
    // The list follows the listings and favourites, not every hour of the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.listings,
    state.favorites,
    state.market,
    cityId,
    area,
    kind,
    budget,
    favorites,
    bargains,
    sort,
  ]);

  return (
    <div className="screen">
      <ScreenHeader
        title={format(t.listings.heading, { city: cityName(cityId) })}
        onBack={nav.pop}
      />
      <button
        type="button"
        className={`filters-toggle${active > 0 ? ' active' : ''}`}
        aria-expanded={open}
        data-testid="filters-toggle"
        onClick={toggle}
      >
        <Icon name="settings" size={18} />
        {active > 0 ? format(t.listings.filtersCount, { count: active }) : t.listings.filters}
        <span className="filters-chevron" aria-hidden="true">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <div className="filters-panel" role="group" aria-label={t.listings.filters}>
          <div className="chips">
            <Chip pressed={area === null} onClick={() => setArea(null)}>
              {t.listings.allNeighbourhoods}
            </Chip>
            {neighbourhoods.map((n) => (
              <Chip key={n.id} pressed={area === n.id} onClick={() => setArea(n.id)}>
                {n.name}
              </Chip>
            ))}
          </div>
          <div className="chips">
            <Chip pressed={bargains} onClick={() => setBargains(!bargains)}>
              {t.listings.bargainsOnly}
            </Chip>
            <Chip pressed={favorites} onClick={() => setFavorites(!favorites)}>
              {t.listings.favoritesOnly}
            </Chip>
          </div>
          <div className="chips">
            <Chip pressed={kind === null} onClick={() => setKind(null)}>
              {t.listings.allKinds}
            </Chip>
            {KINDS.map((value) => (
              <Chip key={value} pressed={kind === value} onClick={() => setKind(value)}>
                {t.listings.kindShort[value]}
              </Chip>
            ))}
          </div>
          <div className="chips">
            <Chip pressed={budget === null} onClick={() => setBudget(null)}>
              {t.listings.anyBudget}
            </Chip>
            {BUDGETS.map((value) => (
              <Chip key={value} pressed={budget === value} onClick={() => setBudget(value)}>
                {format(t.listings.budgetMax, { amount: formatEuros(value * 100) })}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <Segmented<Sort>
        label={t.listings.sort}
        value={sort}
        onChange={setSort}
        options={[
          { value: 'recent', label: t.listings.sortRecent },
          { value: 'price', label: t.listings.sortPrice },
          { value: 'pricePerM2', label: t.listings.sortPricePerM2 },
          { value: 'yield', label: t.listings.sortYield },
        ]}
      />
      <p className="small muted">{format(t.listings.count, { count: rows.length })}</p>
      {rows.length === 0 ? (
        <Empty icon="map">{t.listings.empty}</Empty>
      ) : (
        <div className="list">
          {rows.map(({ listing, view }) => (
            <ListingRow key={listing.id} listing={listing} view={view} />
          ))}
        </div>
      )}
    </div>
  );
}
