import {
  type Condition,
  type DpeLabel,
  type Epoch,
  findCity,
  findJob,
  type GameContent,
  type Motivation,
} from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt, nextNormal, nextPoisson, nextRange, pickWeighted } from '../random.ts';
import type { GameState, Listing, Property, PropertyKind } from '../state.ts';
import type { SystemContext } from './context.ts';
import { conditionLabel, drawDwelling, freezeDwelling, freezeNested } from './dwelling.ts';
import { defectProbability, dwellingKindOf, realValue } from './valuation.ts';

const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;

function drawSurface(
  state: GameState,
  bins: readonly { min: number; max: number; share: number }[],
) {
  const index = Number(
    pickWeighted(state.rng, Object.fromEntries(bins.map((bin, i) => [String(i), bin.share]))),
  );
  const bin = bins[index] ?? bins[0];
  if (!bin) throw new RangeError('No surface bin');
  return Math.round(nextRange(state.rng, bin.min, bin.max));
}

/** Draws a property from the real distributions of a city (docs/06, section 6.5). */
export function generateProperty(ctx: SystemContext, cityId: string): Property {
  const { content, state } = ctx;
  const rules = content.market;
  const city = findCity(content, cityId);
  const neighbourhoodId = pickWeighted(
    state.rng,
    Object.fromEntries(
      city.neighbourhoods.map((n) => [n.id, n.sales.apartment.perYear + n.sales.house.perYear]),
    ),
  );
  const neighbourhood = city.neighbourhoods.find((n) => n.id === neighbourhoodId);
  if (!neighbourhood) throw new RangeError(`City ${cityId} has no neighbourhood`);
  let kind: PropertyKind;
  if (nextFloat(state.rng) < rules.flow.buildingShare) kind = 'building';
  else {
    kind = pickWeighted(state.rng, {
      apartment: neighbourhood.sales.apartment.perYear,
      house: neighbourhood.sales.house.perYear,
    });
  }
  const dwelling = dwellingKindOf(kind);
  const m2PerRoom = city.commune.m2PerRoom[dwelling];
  const roomsFor = (surface: number) => Math.max(1, Math.round(surface / m2PerRoom));

  let lots: Property['lots'] = [];
  let surface: number;
  if (kind === 'building') {
    const count = nextInt(state.rng, rules.building.lots.min, rules.building.lots.max);
    lots = Array.from({ length: count }, () => {
      const lotSurface = Math.round(
        nextRange(state.rng, rules.building.lotSurface.min, rules.building.lotSurface.max),
      );
      return { surface: lotSurface, rooms: roomsFor(lotSurface) };
    });
    surface = lots.reduce((sum, lot) => sum + lot.surface, 0);
  } else {
    surface = drawSurface(state, neighbourhood.sales[dwelling].surfaceBins);
  }
  const floor = kind === 'apartment' ? nextInt(state.rng, 0, rules.apartment.maxFloor) : null;
  const epoch = pickWeighted<Epoch>(state.rng, neighbourhood.epochShares[dwelling]);
  const dpe = pickWeighted<DpeLabel>(state.rng, city.commune.dpeByEpoch[dwelling][epoch]);
  const condition = pickWeighted<Condition>(state.rng, rules.conditionWeights[epoch]);
  const rooms =
    kind === 'building' ? lots.reduce((sum, lot) => sum + lot.rooms, 0) : roomsFor(surface);
  const structure = drawDwelling(
    content,
    state.rng,
    { kind, surface, rooms, lots, epoch, dpe },
    condition,
  );
  const defects = rules.defects
    .filter((rule) => nextFloat(state.rng) < defectProbability(rule, kind, epoch))
    .map((rule) => ({ id: rule.id, revealed: false }));
  const tax = rules.ownership.propertyTaxPerM2[kind];
  const copro = content.works.copro;
  const property: Property = {
    id: `property-${state.nextId++}`,
    cityId,
    neighbourhoodId: neighbourhood.id,
    kind,
    surface,
    rooms,
    floor,
    lots,
    epoch,
    dpe,
    ...structure,
    copro:
      kind === 'apartment'
        ? {
            lots: nextInt(state.rng, copro.lots.min, copro.lots.max),
            meetingMonth: nextInt(state.rng, 1, 12),
          }
        : null,
    postponedHazards: [],
    defects,
    annualPropertyTax: toCents(Math.round(surface * tax)),
    monthlyCharges:
      kind === 'apartment'
        ? toCents(Math.round(surface * rules.ownership.coOwnershipChargesPerM2))
        : 0,
  };
  // Lots, nuisances and the like are replaced, never mutated: shared between copies of the state.
  freezeNested(property);
  return property;
}

function roundPrice(content: GameContent, amount: Cents, direction: 'nearest' | 'up' = 'nearest') {
  const step = toCents(content.market.pricing.rounding);
  const units = amount / step;
  return Math.max(step, (direction === 'up' ? Math.ceil(units) : Math.round(units)) * step);
}

function motivationOf(content: GameContent, id: string): Motivation {
  const motivation = content.market.motivations.find((m) => m.id === id);
  if (!motivation) throw new RangeError(`Unknown motivation ${id}`);
  return motivation;
}

/** A new listing; `ageDays` back-dates the listings already online at game start. */
export function generateListing(ctx: SystemContext, cityId: string, ageDays = 0): Listing {
  const property = generateProperty(ctx, cityId);
  const motivationId = pickWeighted(
    ctx.state.rng,
    Object.fromEntries(ctx.content.market.motivations.map((m) => [m.id, m.weight])),
  );
  return listingFor(ctx, property, motivationId, ageDays);
}

/** Puts a property on the market for a seller with the given motivation. */
export function listingFor(
  ctx: SystemContext,
  property: Property,
  motivationId: string,
  ageDays = 0,
): Listing {
  const { content, state } = ctx;
  const rules = content.market;
  const motivation = motivationOf(content, motivationId);
  const factor = nextRange(state.rng, motivation.priceFactor.min, motivation.priceFactor.max);
  const { errorStdDev, errorMax } = rules.pricing;
  const error = Math.max(-errorMax, Math.min(errorMax, errorStdDev * nextNormal(state.rng)));
  const value = realValue(content, state, property).value;
  const askingPrice = roundPrice(content, value * factor * (1 + error));
  const condition = conditionLabel(content, property);
  const titles = content.listingTexts.titles.filter(
    (title) => !title.conditions || title.conditions.includes(condition),
  );
  const title = titles[nextInt(state.rng, 0, titles.length - 1)] ?? content.listingTexts.titles[0];
  const published = ctx.today - ageDays;
  const headStart = state.player.employed
    ? findJob(content, state.player.jobId).perkEffects?.listingHeadStart
    : undefined;
  const early = ageDays === 0 && headStart !== undefined && nextFloat(state.rng) < headStart.share;
  return {
    id: `listing-${state.nextId++}`,
    property,
    titleId: title?.id ?? '',
    motivationId,
    askingPrice,
    initialAskingPrice: askingPrice,
    publishedDay: published,
    publicDay: early ? published + headStart.days : published,
    lastPriceDropDay: published,
    visited: false,
    offersMade: 0,
    offer: null,
  };
}

/** Listings published per day in a city, from its real yearly sales. */
export function dailyListingRate(content: GameContent, cityId: string): number {
  const city = findCity(content, cityId);
  const perYear = city.neighbourhoods.reduce(
    (sum, n) => sum + n.sales.apartment.perYear + n.sales.house.perYear,
    0,
  );
  const share = content.citiesRules.listingFlowShare[cityId] ?? 1;
  return (perYear * content.market.flow.listingsPerSale * share) / DAYS_PER_YEAR;
}

/** The market as the player finds it on the first day. */
export function seedListings(ctx: SystemContext, cityId: string): void {
  const rules = ctx.content.market.flow;
  const count = Math.round(dailyListingRate(ctx.content, cityId) * rules.initialStockDays);
  for (let i = 0; i < count; i++) {
    const age = nextInt(ctx.state.rng, 0, Math.max(0, Math.round(rules.initialStockDays) - 1));
    ctx.state.listings.push(generateListing(ctx, cityId, age));
  }
  ctx.state.listings.sort((a, b) => a.publishedDay - b.publishedDay);
}

/** Lowest price the seller accepts today (docs/03-systemes/03, « Offre »). */
export function sellerFloor(ctx: SystemContext, listing: Listing): Cents {
  const { content, state } = ctx;
  const rules = content.market.negotiation;
  const motivation = motivationOf(content, listing.motivationId);
  const months = Math.max(0, ctx.today - listing.publishedDay) / DAYS_PER_MONTH;
  const bonus = state.player.employed
    ? (findJob(content, state.player.jobId).perkEffects?.negotiationBonusShare ?? 0)
    : 0;
  const bargain = realValue(content, state, listing.property).value / listing.askingPrice - 1;
  const discount = Math.max(
    0,
    Math.min(
      rules.maxDiscount,
      motivation.flexibility +
        months * rules.discountPerMonthOnline +
        bonus -
        rules.competitionPenalty * Math.max(0, bargain),
    ),
  );
  return Math.round(listing.askingPrice * (1 - discount));
}

export type SellerAnswer =
  | { answer: 'accepted'; price: Cents }
  | { answer: 'counterOffer'; amount: Cents }
  | { answer: 'refused' };

export function sellerAnswer(ctx: SystemContext, listing: Listing, amount: Cents): SellerAnswer {
  const floor = sellerFloor(ctx, listing);
  if (amount >= floor) return { answer: 'accepted', price: amount };
  const band = ctx.content.market.negotiation.counterBand;
  if (amount >= floor * (1 - band)) {
    const counter = Math.min(
      listing.askingPrice,
      roundPrice(ctx.content, Math.max(floor, (amount + listing.askingPrice) / 2), 'up'),
    );
    return { answer: 'counterOffer', amount: counter };
  }
  return { answer: 'refused' };
}

/** Daily chance that another buyer takes the listing (good deals go fast). */
export function otherBuyerProbability(ctx: SystemContext, listing: Listing): number {
  const rules = ctx.content.market.otherBuyers;
  const bargain =
    realValue(ctx.content, ctx.state, listing.property).value / listing.askingPrice - 1;
  const demand = ctx.content.citiesRules.demand[listing.property.cityId]?.buyers ?? 1;
  return Math.min(
    rules.maxDailyProbability,
    rules.baseDailyProbability * demand * Math.exp(rules.dealSensitivity * bargain),
  );
}

function removeListing(ctx: SystemContext, listingId: string): void {
  ctx.state.listings = ctx.state.listings.filter((l) => l.id !== listingId);
  if (ctx.state.favorites.includes(listingId)) {
    ctx.state.favorites = ctx.state.favorites.filter((id) => id !== listingId);
  }
  const isVisit = (item: GameState['agenda'][number]) =>
    item.kind === 'visit' && item.listingId === listingId;
  const planned = ctx.state.agenda.filter(isVisit);
  if (planned.length === 0) return;
  ctx.state.agenda = ctx.state.agenda.filter((item) => !isVisit(item));
  for (const item of planned) ctx.events.push({ type: 'visitCancelled', listingId, day: item.day });
}

/**
 * Daily life of the market: seller answers, expired counter-offers, other
 * buyers, price drops, withdrawals and new listings. `onAccepted` turns an
 * accepted offer into a compromis.
 */
export function runDailyListings(
  ctx: SystemContext,
  onAccepted: (listing: Listing, price: Cents) => void,
): void {
  const { content, state } = ctx;
  const rules = content.market;
  for (const frozen of [...state.listings]) {
    // Only a listing with an offer to answer or a price drop due is changed (and thawed).
    let listing = frozen;
    const offer = listing.offer;
    if (offer && offer.counter === null && offer.responseDay <= ctx.today) {
      listing = editableListing(ctx, frozen);
      const answer = sellerAnswer(ctx, listing, offer.amount);
      ctx.events.push({ type: 'offerAnswered', listingId: listing.id, ...answer });
      if (answer.answer === 'accepted') {
        listing.offer = null;
        onAccepted(listing, answer.price);
        continue;
      }
      listing.offer =
        answer.answer === 'counterOffer'
          ? {
              ...offer,
              counter: {
                amount: answer.amount,
                expiresDay: ctx.today + rules.negotiation.counterValidityDays,
              },
            }
          : null;
      continue;
    }
    if (offer?.counter && offer.counter.expiresDay <= ctx.today) {
      listing = editableListing(ctx, frozen);
      listing.offer = null;
      ctx.events.push({ type: 'counterOfferExpired', listingId: listing.id });
    }
    if (listing.offer) continue; // the seller waits for the player
    if (
      ctx.today >= listing.publicDay &&
      nextFloat(state.rng) < otherBuyerProbability(ctx, listing)
    ) {
      removeListing(ctx, listing.id);
      ctx.events.push({ type: 'listingSold', listingId: listing.id, buyer: 'other' });
      continue;
    }
    if (ctx.today - listing.publishedDay >= rules.lifetime.maxDays) {
      removeListing(ctx, listing.id);
      ctx.events.push({ type: 'listingWithdrawn', listingId: listing.id });
      continue;
    }
    const age = ctx.today - listing.publishedDay;
    const sinceDrop = ctx.today - listing.lastPriceDropDay;
    const due =
      age >= rules.lifetime.firstPriceDropDays &&
      (listing.lastPriceDropDay === listing.publishedDay ||
        sinceDrop >= rules.lifetime.priceDropEveryDays);
    if (due) {
      const value = realValue(content, state, listing.property).value;
      if (listing.askingPrice >= value * rules.lifetime.overpricedRatio) {
        const share = nextRange(
          state.rng,
          rules.lifetime.priceDropShare.min,
          rules.lifetime.priceDropShare.max,
        );
        listing = editableListing(ctx, frozen);
        listing.askingPrice = roundPrice(content, listing.askingPrice * (1 - share));
        listing.lastPriceDropDay = ctx.today;
        ctx.events.push({
          type: 'listingPriceDropped',
          listingId: listing.id,
          askingPrice: listing.askingPrice,
        });
      }
    }
  }
  for (const cityId of Object.keys(state.market.cities)) {
    const count = nextPoisson(state.rng, dailyListingRate(content, cityId));
    for (let i = 0; i < count; i++) {
      const listing = generateListing(ctx, cityId);
      state.listings.push(listing);
      ctx.events.push({ type: 'listingPublished', listingId: listing.id });
    }
  }
}

/**
 * Listings are frozen between two steps of the engine, so that the copies of the state share
 * them (see clone.ts): the market holds hundreds of them and almost none changes in a day.
 */
export function freezeListings(state: GameState): void {
  for (const listing of state.listings) {
    if (Object.isFrozen(listing)) continue;
    if (listing.offer) {
      if (listing.offer.counter) Object.freeze(listing.offer.counter);
      Object.freeze(listing.offer);
    }
    freezeDwelling(listing.property);
    Object.freeze(listing.property);
    Object.freeze(listing);
  }
}

/**
 * The listing as a draft one may change: copies a frozen listing (its property and offer too)
 * into the state's list, or returns the listing itself if it is already a draft.
 */
export function editableListing(ctx: Pick<SystemContext, 'state'>, listing: Listing): Listing {
  if (!Object.isFrozen(listing)) return listing;
  const copy: Listing = {
    ...listing,
    property: { ...listing.property },
    offer: listing.offer && { ...listing.offer },
  };
  const { listings } = ctx.state;
  const index = listings.indexOf(listing);
  if (index >= 0) listings[index] = copy;
  return copy;
}

export function findListing(state: GameState, listingId: string): Listing | undefined {
  return state.listings.find((listing) => listing.id === listingId);
}

export { removeListing };
