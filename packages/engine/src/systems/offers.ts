import type { Cents } from '../money.ts';
import type { SystemContext } from './context.ts';
import { editableListing, findListing } from './listings.ts';
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
  const found = findListing(state, listingId);
  if (!found) return 'listing.unknown';
  if (!Number.isInteger(amount) || amount <= 0) return 'offer.invalidAmount';
  if (found.offer) return 'offer.pending';
  const rules = content.market.negotiation;
  if (found.offersMade >= rules.maxOffersPerListing) return 'offer.tooMany';
  // The deposit of the compromis must be at hand.
  if (state.player.balance < Math.round(amount * content.market.purchase.depositShare)) {
    return 'account.insufficientFunds';
  }
  const listing = editableListing(ctx, found);
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
  const found = findListing(ctx.state, listingId);
  if (!found) return 'listing.unknown';
  const counter = found.offer?.counter;
  if (!counter) return 'offer.noCounter';
  const listing = editableListing(ctx, found);
  listing.offer = null;
  if (accept) signCompromis(ctx, listing, counter.amount);
  else ctx.events.push({ type: 'counterOfferDeclined', listingId });
  return null;
}
