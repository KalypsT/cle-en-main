import { gameContent } from '@cle/content';
import type { Listing, ListingView, PropertyKind } from '@cle/engine';
import { useMemo, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { cityName, format, formatDecimal, formatEuros, propertyLabel, t } from '../texts.ts';
import { Badge, Chip, Empty, ListRow, ScreenHeader, Segmented } from '../ui/components.tsx';
import { KindThumb } from '../ui/Facade.tsx';

type Sort = 'recent' | 'price' | 'pricePerM2' | 'yield';
const KINDS: PropertyKind[] = ['apartment', 'house', 'building'];
/** Budget filters, in euros (presentation steps, not gameplay values). */
const BUDGETS = [60_000, 90_000, 120_000, 180_000];

export function ListingRow({ listing, view }: { listing: Listing; view: ListingView | null }) {
  const { state } = useGame();
  const nav = useNav();
  const { property } = listing;
  const planned = state.agenda.some((item) => item.listingId === listing.id);
  const favorite = state.favorites.includes(listing.id);
  return (
    <ListRow
      thumb={<KindThumb property={property} />}
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
          {listing.offer?.counter ? (
            <Badge tone="amber">{t.listings.counter}</Badge>
          ) : listing.offer ? (
            <Badge tone="teal">{t.listings.offerPending}</Badge>
          ) : null}
          {listing.visited ? (
            <Badge tone="green" icon="check">
              {t.listings.visited}
            </Badge>
          ) : planned ? (
            <Badge icon="clock">{t.listings.visitPlanned}</Badge>
          ) : null}
          {view?.isNew && <Badge tone="teal">{t.listings.new}</Badge>}
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
        </span>
      }
      onClick={() => nav.push({ name: 'listing', id: listing.id })}
    />
  );
}

export function ListingsScreen({
  neighbourhoodId,
  favorites: favoritesOnly = false,
}: {
  neighbourhoodId?: string | undefined;
  favorites?: boolean | undefined;
}) {
  const { state } = useGame();
  const nav = useNav();
  const cityId = gameContent.start.cityId;
  const neighbourhoods = gameContent.cities[cityId]?.neighbourhoods ?? [];
  const [area, setArea] = useState<string | null>(neighbourhoodId ?? null);
  const [kind, setKind] = useState<PropertyKind | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [favorites, setFavorites] = useState(favoritesOnly);
  const [sort, setSort] = useState<Sort>('recent');

  const rows = useMemo(() => {
    const filtered = state.listings
      .filter((listing) => listing.property.cityId === cityId)
      .filter((listing) => !area || listing.property.neighbourhoodId === area)
      .filter((listing) => !kind || listing.property.kind === kind)
      .filter((listing) => budget === null || listing.askingPrice <= budget * 100)
      .filter((listing) => !favorites || state.favorites.includes(listing.id))
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
  }, [state.listings, state.favorites, state.market, cityId, area, kind, budget, favorites, sort]);

  return (
    <div className="screen">
      <ScreenHeader
        title={format(t.listings.heading, { city: cityName(cityId) })}
        onBack={nav.pop}
      />
      <div className="chips" role="group" aria-label={t.listings.filters}>
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
        <Chip pressed={favorites} onClick={() => setFavorites(!favorites)}>
          {t.listings.favoritesOnly}
        </Chip>
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
