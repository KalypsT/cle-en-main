import type { Cents } from '../money.ts';
import type { SystemContext } from './context.ts';
import { findListing } from './listings.ts';
import { signCompromis } from './purchases.ts';

export type OfferRefusal =
  | 'listing.unknown'
  | 'offer.invalidAmount'
  | 'offer.pending'
  | 'offer.tooMany'
  | 'offer.noCounter'
  | 'account.insufficientFunds';

/** One offer at a time; the seller answers after a delay (docs/03-systemes/03, « Offre »). */
export function makeOffer(
  ctx: SystemContext,
  listingId: string,
  amount: Cents,
): OfferRefusal | null {
  const { content, state } = ctx;
  const listing = findListing(state, listingId);
  if (!listing) return 'listing.unknown';
  if (!Number.isInteger(amount) || amount <= 0) return 'offer.invalidAmount';
  if (listing.offer) return 'offer.pending';
  const rules = content.market.negotiation;
  if (listing.offersMade >= rules.maxOffersPerListing) return 'offer.tooMany';
  // The deposit of the compromis must be at hand.
  if (state.player.balance < Math.round(amount * content.market.purchase.depositShare)) {
    return 'account.insufficientFunds';
  }
  listing.offersMade += 1;
  listing.offer = { amount, responseDay: ctx.today + rules.responseDelayDays, counter: null };
  ctx.events.push({
    type: 'offerMade',
    listingId,
    amount,
    responseDay: listing.offer.responseDay,
  });
  return null;
}

/** The single negotiation step: the player takes or leaves the seller's counter-offer. */
export function answerCounter(
  ctx: SystemContext,
  listingId: string,
  accept: boolean,
): OfferRefusal | null {
  const listing = findListing(ctx.state, listingId);
  if (!listing) return 'listing.unknown';
  const counter = listing.offer?.counter;
  if (!counter) return 'offer.noCounter';
  listing.offer = null;
  if (accept) signCompromis(ctx, listing, counter.amount);
  else ctx.events.push({ type: 'counterOfferDeclined', listingId });
  return null;
}
