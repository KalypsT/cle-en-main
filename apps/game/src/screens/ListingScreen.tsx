import { gameContent } from '@cle/content';
import { fromDayNumber, type Listing, toDayNumber, type Trade, type VisitQuote } from '@cle/engine';
import { useEffect, useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { sellerReply } from '../inbox.ts';
import {
  format,
  formatDecimal,
  formatDuration,
  formatEuros,
  formatGameDate,
  formatMoney,
  formatPercent,
  formatWhen,
  cityName,
  listingTitle,
  propertyLabel,
  t,
  tradeName,
} from '../texts.ts';
import { Amount, Badge, BottomSheet, Card, Empty, ScreenHeader } from '../ui/components.tsx';
import { ItemsList, ItemsSummary, ValueWhy } from '../ui/explain.tsx';
import { Facade } from '../ui/Facade.tsx';
import { FinancingPanel } from '../ui/FinancingPanel.tsx';
import { Icon } from '../ui/Icon.tsx';
import { DpeCard } from '../ui/DpeCard.tsx';

/** Step of the offer slider, in cents (presentation only). */
const OFFER_STEP = 500_00;
/** The seller's last word, by outcome (« Dernière réponse du vendeur »). */
const REPLY_TEXTS = {
  refused: t.listing.refusedText,
  counterExpired: t.listing.counterExpiredText,
  counterDeclined: t.listing.counterDeclinedText,
} as const;

export function ListingScreen({ id }: { id: string }) {
  const { state, act } = useGame();
  const nav = useNav();
  const listing = state.listings.find((candidate) => candidate.id === id);

  useEffect(() => {
    nav.track('listing');
    // Once per listing opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!listing) {
    return (
      <div className="screen">
        <ScreenHeader title={t.listing.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }

  const favorite = state.favorites.includes(id);
  return (
    <div className="screen">
      <ScreenHeader
        title={t.listing.heading}
        onBack={nav.pop}
        action={
          <button
            type="button"
            className="icon-button"
            aria-pressed={favorite}
            aria-label={favorite ? t.listing.removeFavorite : t.listing.addFavorite}
            onClick={() => act({ type: 'market/favorite', listingId: id, favorite: !favorite })}
          >
            <span className={favorite ? 'warning' : undefined}>
              <Icon name="star" filled={favorite} />
            </span>
          </button>
        }
      />
      <ListingBody listing={listing} />
    </div>
  );
}

function ListingBody({ listing }: { listing: Listing }) {
  const { state, act } = useGame();
  const [offering, setOffering] = useState(false);
  const { property } = listing;
  const view = engine.listingView(state, listing.id);
  const catalog = engine.worksCatalog(state, listing.id) ?? [];
  const today = toDayNumber(state.clock.date);
  const quote = engine.visitQuote(state, listing.id);
  const visitLabel = (visit: VisitQuote | null): string => {
    if (!visit) return '';
    const duration = formatDuration(visit.minutes);
    if (visit.tripMinutes > 0) {
      return format(t.listing.visitTrip, {
        duration,
        trip: formatDuration(visit.tripMinutes),
        cost: formatMoney(visit.tripCost),
      });
    }
    return visit.cityId === state.player.baseCityId
      ? format(t.listing.visitDuration, { duration })
      : format(t.listing.visitTripDone, { duration, city: cityName(visit.cityId) });
  };
  const planned = state.agenda.find(
    (item) => item.kind === 'visit' && item.listingId === listing.id,
  );
  const motivation = gameContent.listingTexts.motivations[listing.motivationId];
  const noisy = property.defects.find((defect) => defect.revealed);
  const rules = gameContent.market.negotiation;
  const offersLeft = rules.maxOffersPerListing - listing.offersMade;
  const offer = listing.offer;
  const reply = sellerReply(state, listing.id);

  // How the neighbourhood's prices moved over the last year (or since the curve began).
  const trend = engine.priceChange(state, property.cityId, property.neighbourhoodId, 12);
  const details = format(t.listing.details, {
    city: cityName(property.cityId),
    surface: property.surface,
    rooms: property.rooms,
    floor:
      property.floor === null
        ? ''
        : property.floor === 0
          ? t.listing.groundFloor
          : format(t.listing.floor, { floor: property.floor }),
    epoch: t.listing.epochs[property.epoch],
  });

  let gapText = '';
  if (view) {
    const median = format(t.common.perM2, { amount: formatEuros(view.neighbourhoodPricePerM2) });
    const value = formatDecimal(Math.abs(view.priceGap) * 100);
    gapText =
      Math.abs(view.priceGap) < 0.005
        ? format(t.listing.priceGapEqual, { median })
        : format(view.priceGap < 0 ? t.listing.priceGapBelow : t.listing.priceGapAbove, {
            value,
            median,
          });
  }

  // Trades whose items are still unknown, with an artisan in the address book.
  const artisans = engine.artisans(state, property.cityId);
  const trades = [
    ...new Set(
      catalog
        .filter((item) => item.state === null && item.trade !== null)
        .map((item) => item.trade as Trade),
    ),
  ].filter((trade) => artisans.some((entry) => entry.artisan.trade === trade));

  return (
    <>
      <Facade property={property} />
      <div className="stack tight">
        <div className="row between top">
          <h2 className="h1 grow">{propertyLabel(property)}</h2>
          <span className="stack tight end">
            <span className="h1" data-testid="asking-price">
              {formatEuros(listing.askingPrice)}
            </span>
            {view && (
              <span className="small muted">
                {format(t.common.perM2, { amount: formatEuros(view.pricePerM2) })}
              </span>
            )}
          </span>
        </div>
        <p className="muted small">{details}</p>
        {trend && (
          <p className="small" data-testid="neighbourhood-trend">
            {format(t.listing.neighbourhoodTrend, {
              change: `${trend.change >= 0 ? t.common.plus : t.common.minus}${formatPercent(
                Math.round(Math.abs(trend.change) * 1000) / 10,
              )}`,
              months: trend.months,
            })}
          </p>
        )}
        <p className="strong small">{listingTitle(listing.titleId, property)}</p>
        {view && (
          <p className={`small strong ${view.priceGap < 0 ? 'positive' : 'warning'}`}>{gapText}</p>
        )}
        <div className="row wrap">
          {view && (
            <Badge>
              {format(t.listing.condition, {
                condition: gameContent.listingTexts.conditions[view.condition],
              })}
            </Badge>
          )}
          <Badge icon="clock">
            {today - listing.publishedDay <= 0
              ? t.listing.publishedToday
              : format(t.listing.published, { days: today - listing.publishedDay })}
          </Badge>
          {view && (
            <Badge tone="green">
              {format(t.listings.grossYield, { value: formatDecimal(view.grossYieldPercent) })}
            </Badge>
          )}
        </div>
      </div>

      {offer?.counter && (
        <Card title={t.listing.counterHeading} tint="amber" testId="counter-offer">
          <p>
            {format(t.listing.counterText, {
              amount: formatEuros(offer.counter.amount),
              date: formatGameDate(fromDayNumber(offer.counter.expiresDay)),
            })}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={() =>
                act({ type: 'market/answerCounter', listingId: listing.id, accept: false })
              }
            >
              {t.listing.refuseCounter}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() =>
                act({ type: 'market/answerCounter', listingId: listing.id, accept: true })
              }
            >
              {t.listing.acceptCounter}
            </button>
          </div>
        </Card>
      )}
      {!offer && reply && (
        <Card title={t.listing.lastReplyHeading} tint="amber" testId="last-reply">
          <p>
            {format(REPLY_TEXTS[reply.outcome], {
              amount: formatEuros(reply.amount),
              date: formatGameDate(fromDayNumber(reply.day)),
            })}
          </p>
        </Card>
      )}
      {offer && !offer.counter && (
        <Card tint="teal">
          <p className="strong" data-testid="offer-status">
            {format(t.listing.offerSent, {
              amount: formatEuros(offer.amount),
              when: formatWhen(offer.responseDay, state.clock.date),
            })}
          </p>
        </Card>
      )}

      {motivation && (
        <Card title={t.listing.seller}>
          <p className="small">{motivation}</p>
        </Card>
      )}

      {view && (
        <Card title={t.listing.estimate}>
          <Amount
            label={format(t.listing.estimateRange, {
              low: formatEuros(view.estimate.low),
              high: formatEuros(view.estimate.high),
            })}
            value={formatEuros(view.estimate.estimate)}
            whyTitle={t.value.heading}
            why={<ValueWhy breakdown={view.estimate.breakdown} />}
          />
          <p className="small muted">{t.listing.estimateHint}</p>
        </Card>
      )}

      <DpeCard property={property} id={listing.id} />

      <FinancingPanel listingId={listing.id} askingPrice={listing.askingPrice} />

      <Card
        title={t.listing.items}
        aside={view && <ItemsSummary known={view.knownItems} total={view.totalItems} />}
      >
        {noisy && (
          <Badge tone="amber" icon="alert">
            {gameContent.listingTexts.defects[noisy.id] ?? t.listing.noisyNeighbours}
          </Badge>
        )}
        <ItemsList property={property} items={catalog} collapsed />
      </Card>

      {trades.length > 0 && (
        <Card title={t.listing.diagnose}>
          <p className="small muted">
            {format(t.listing.diagnoseHint, {
              amount: formatEuros(gameContent.works.diagnosis.cost * 100),
            })}
          </p>
          <div className="row wrap">
            {trades.map((trade) => (
              <button
                key={trade}
                type="button"
                className="button small"
                onClick={() => act({ type: 'market/diagnose', listingId: listing.id, trade })}
              >
                <Icon name="wrench" size={18} />
                {format(t.listing.diagnoseTrade, { trade: tradeName(trade) })}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="sticky-actions">
        <button
          type="button"
          className="button"
          disabled={listing.visited || planned !== undefined}
          onClick={() => act({ type: 'market/visit', listingId: listing.id })}
        >
          {listing.visited
            ? t.listing.visitDone
            : planned
              ? format(t.listing.visitPlanned, { when: formatWhen(planned.day, state.clock.date) })
              : visitLabel(quote)}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={offer !== null || offersLeft <= 0}
          onClick={() => setOffering(true)}
        >
          {t.listing.offer}
        </button>
      </div>

      {offering && (
        <OfferSheet listing={listing} offersLeft={offersLeft} onClose={() => setOffering(false)} />
      )}
    </>
  );
}

function OfferSheet({
  listing,
  offersLeft,
  onClose,
}: {
  listing: Listing;
  offersLeft: number;
  onClose: () => void;
}) {
  const { act } = useGame();
  const asking = listing.askingPrice;
  const min = Math.round((asking * 0.7) / OFFER_STEP) * OFFER_STEP;
  const [amount, setAmount] = useState(Math.round((asking * 0.95) / OFFER_STEP) * OFFER_STEP);
  const share = gameContent.market.purchase.depositShare;

  const send = () => {
    if (act({ type: 'market/offer', listingId: listing.id, amount })) onClose();
  };

  return (
    <BottomSheet title={t.listing.offerHeading} onClose={onClose}>
      <label className="field">
        <span className="field-label">{t.listing.offerAmount}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={500}
          value={Math.round(amount / 100)}
          data-testid="offer-amount"
          onChange={(e) => setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)))}
        />
        <input
          className="range"
          type="range"
          min={min}
          max={asking}
          step={OFFER_STEP}
          value={Math.min(asking, Math.max(min, amount))}
          onChange={(e) => setAmount(Number(e.target.value))}
          aria-label={t.listing.offerAmount}
        />
      </label>
      <p className="big-number">{formatEuros(amount)}</p>
      <p className="small muted">
        {format(t.listing.offerOfAsking, { value: formatDecimal((amount / asking) * 100) })}
      </p>
      <p className="small">
        {format(t.listing.offerDeposit, { share: formatPercent(share * 100) })}
      </p>
      <p className="small muted">{format(t.listing.offersLeft, { count: offersLeft })}</p>
      <button type="button" className="button primary block" onClick={send}>
        {t.listing.send}
      </button>
    </BottomSheet>
  );
}
