import { describe, expect, it } from 'vitest';
import {
  advanceDays,
  cityListings,
  content,
  engine,
  newGame,
  systemContext,
} from '../../test/helpers.ts';
import { dailyListingRate, generateListing, otherBuyerProbability } from './listings.ts';

describe('listings', () => {
  it('stocks the market at start and follows the real sales volume', () => {
    const state = newGame();
    const rate = dailyListingRate(content, 'dole');
    // Dole: a few hundred single-dwelling sales a year in DVF.
    expect(rate * 365).toBeGreaterThan(250);
    expect(rate * 365).toBeLessThan(500);
    expect(cityListings(state).length).toBe(
      Math.round(rate * content.market.flow.initialStockDays),
    );
    let published = 0;
    for (const event of advanceDays(state, 365).events) {
      if (event.type === 'listingPublished') published++;
    }
    const total = Object.keys(content.cities).reduce(
      (sum, id) => sum + dailyListingRate(content, id),
      0,
    );
    expect(published / 365 / total).toBeGreaterThan(0.85);
    expect(published / 365 / total).toBeLessThan(1.15);
  });

  it('shows only the share of the real sales that each city lets through', () => {
    const state = newGame();
    for (const [cityId, city] of Object.entries(content.cities)) {
      const perYear = city.neighbourhoods.reduce(
        (sum, n) => sum + n.sales.apartment.perYear + n.sales.house.perYear,
        0,
      );
      const share = content.citiesRules.listingFlowShare[cityId] ?? 1;
      expect(dailyListingRate(content, cityId) * 365).toBeCloseTo(perYear * share, 6);
      expect(cityListings(state, cityId).length).toBe(
        Math.round(dailyListingRate(content, cityId) * content.market.flow.initialStockDays),
      );
    }
  });

  it('draws properties within the real distributions', () => {
    const ctx = systemContext(newGame());
    const neighbourhoods = new Set(content.cities.dole?.neighbourhoods.map((n) => n.id));
    for (let i = 0; i < 300; i++) {
      const listing = generateListing(ctx, 'dole');
      const { property } = listing;
      expect(neighbourhoods.has(property.neighbourhoodId)).toBe(true);
      expect(property.surface).toBeGreaterThan(8);
      // Shops, parking spaces and land have no rooms (milestone 8).
      const dwelling = ['apartment', 'house', 'building'].includes(property.kind);
      expect(property.rooms).toBeGreaterThanOrEqual(dwelling ? 1 : 0);
      expect(listing.askingPrice % (content.market.pricing.rounding * 100)).toBe(0);
      if (property.kind === 'apartment') expect(property.floor).not.toBeNull();
      if (property.kind === 'building') expect(property.lots.length).toBeGreaterThanOrEqual(2);
      expect(property.defects.every((d) => !d.revealed)).toBe(true);
    }
  });

  it('lets other buyers take bargains much faster than overpriced listings', () => {
    const ctx = systemContext(newGame());
    const listing = ctx.state.listings[0];
    if (!listing) throw new Error('No listing');
    const value = engine.realValue(ctx.state, listing.id)?.value ?? 0;
    const bargain = { ...listing, askingPrice: Math.round(value * 0.85) };
    const fair = { ...listing, askingPrice: value };
    const overpriced = { ...listing, askingPrice: Math.round(value * 1.15) };
    expect(otherBuyerProbability(ctx, bargain)).toBeGreaterThan(
      10 * otherBuyerProbability(ctx, fair),
    );
    expect(otherBuyerProbability(ctx, overpriced)).toBeLessThan(otherBuyerProbability(ctx, fair));
    expect(otherBuyerProbability(ctx, bargain)).toBeLessThanOrEqual(
      content.market.otherBuyers.maxDailyProbability,
    );
  });

  it('lowers the price of overpriced listings and withdraws old ones', () => {
    let state = newGame();
    const value = engine.realValue(state, state.listings[0]?.id ?? '')?.value ?? 0;
    // Make the first listing clearly overpriced and new.
    state = systemContext(state).state;
    const listing = state.listings[0];
    if (!listing) throw new Error('No listing');
    listing.askingPrice = Math.round(value * 1.4);
    listing.publishedDay = systemContext(state).today;
    listing.lastPriceDropDay = listing.publishedDay;
    const id = listing.id;
    const { firstPriceDropDays, maxDays } = content.market.lifetime;
    const { state: later, events } = advanceDays(state, firstPriceDropDays + 1);
    expect(events.some((e) => e.type === 'listingPriceDropped' && e.listingId === id)).toBe(true);
    const dropped = later.listings.find((l) => l.id === id);
    expect(dropped?.askingPrice).toBeLessThan(listing.askingPrice);
    const end = advanceDays(later, maxDays);
    expect(end.state.listings.some((l) => l.id === id)).toBe(false);
  });

  it('gives an estate agent a head start on some listings', () => {
    const agent = advanceDays(newGame({ jobId: 'realEstateAgent' }), 90).state;
    expect(agent.listings.some((l) => l.publicDay > l.publishedDay)).toBe(true);
    const civil = advanceDays(newGame(), 90).state;
    // Off-market offers (milestone 6) aside, everyone sees a listing on the same day.
    const ordinary = civil.listings.filter((l) => l.motivationId !== 'offMarket');
    expect(ordinary.every((l) => l.publicDay === l.publishedDay)).toBe(true);
  });
});
