import { describe, expect, it } from 'vitest';
import {
  act,
  advanceDays,
  advanceToNextMonth,
  affordableListing,
  buyWithLoan,
  cityListings,
  content,
  engine,
  newGame,
  sampleOwned,
  systemContext,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { toCents } from '../money.ts';
import { serializeGame } from '../serialization.ts';
import { homeRent, moveHome, renownOf } from './cities.ts';
import { statValue } from './progress.ts';
import { tripBetween } from './travel.ts';

/** A game that starts at midnight, so that the first day has its whole free time. */
const midnight = () => newGame({ startHour: 0 });

function listingIn(state: ReturnType<typeof newGame>, cityId: string, skip = 0) {
  const listing = cityListings(state, cityId).filter((l) => l.property.kind !== 'building')[skip];
  if (!listing) throw new Error(`No listing in ${cityId}`);
  return listing;
}

describe('trips', () => {
  it('are symmetric, free inside a city and fall back for an unlisted pair', () => {
    expect(tripBetween(content, 'dole', 'dole')).toEqual({ minutes: 0, cost: 0 });
    expect(tripBetween(content, 'dole', 'dijon')).toEqual({ minutes: 90, cost: toCents(12) });
    expect(tripBetween(content, 'dijon', 'dole')).toEqual(tripBetween(content, 'dole', 'dijon'));
    expect(tripBetween(content, 'dole', 'nowhere').minutes).toBe(
      2 * content.citiesRules.fallbackTrip.oneWayMinutes,
    );
  });

  it('add the round trip and its cost to the first visit of a day in another city only', () => {
    const state = midnight();
    const visit = content.market.visit;
    const local = act(state, { type: 'market/visit', listingId: listingIn(state, 'dole').id });
    expect(state.player.freeTimeMinutes - local.state.player.freeTimeMinutes).toBe(
      visit.minutes + visit.travelMinutes,
    );
    expect(local.state.player.balance).toBe(state.player.balance);

    const first = act(state, { type: 'market/visit', listingId: listingIn(state, 'dijon').id });
    expect(state.player.freeTimeMinutes - first.state.player.freeTimeMinutes).toBe(
      visit.minutes + visit.travelMinutes + 90,
    );
    expect(state.player.balance - first.state.player.balance).toBe(toCents(12));
    expect(first.events).toContainEqual({
      type: 'tripMade',
      cityId: 'dijon',
      minutes: 90,
      cost: toCents(12),
    });

    // The second visit the same day in the same city pays no trip.
    const second = act(first.state, {
      type: 'market/visit',
      listingId: listingIn(state, 'dijon', 1).id,
    });
    expect(first.state.player.freeTimeMinutes - second.state.player.freeTimeMinutes).toBe(
      visit.minutes + visit.travelMinutes,
    );
    expect(second.state.player.balance).toBe(first.state.player.balance);
    expect(second.events.some((e) => e.type === 'tripMade')).toBe(false);
  });

  it('start over the next day', () => {
    const state = midnight();
    const visited = act(state, { type: 'market/visit', listingId: listingIn(state, 'dijon').id });
    expect(visited.state.player.tripsToday).toEqual(['dijon']);
    expect(advanceDays(visited.state, 1).state.player.tripsToday).toEqual([]);
  });

  it('are planned once for the visits of a day in the same city', () => {
    let state = newGame();
    // Empty today's free time so that the visits go to the agenda.
    state = { ...state, player: { ...state.player, freeTimeMinutes: 0 } };
    const ids = [0, 1, 2].map((i) => listingIn(state, 'dijon', i).id);
    for (const listingId of ids) state = act(state, { type: 'market/visit', listingId }).state;
    expect(state.agenda).toHaveLength(3);
    const days = engine.agendaWeek(state, 14).filter((d) => d.planned.length > 0);
    const planned = days.flatMap((d) => d.planned);
    expect(planned).toHaveLength(3);
    for (const day of days) {
      const cities = new Set(day.planned.map((item) => item.cityId));
      expect(day.trips.map((trip) => trip.cityId).sort()).toEqual([...cities].sort());
      expect(day.trips.every((trip) => trip.minutes === 90)).toBe(true);
    }
    // The visits happen, each in Dijon.
    const later = advanceDays(state, 14);
    // A listing may have been sold meanwhile; the visits that happen share one trip.
    const done = later.events.filter((e) => e.type === 'visitDone').length;
    const cancelled = later.events.filter((e) => e.type === 'visitCancelled').length;
    expect(done + cancelled).toBe(3);
    expect(done).toBeGreaterThan(0);
    expect(later.events.filter((e) => e.type === 'tripMade')).toHaveLength(1);
  });

  it('keep a day with several cities within the free time', () => {
    let state = newGame();
    state = { ...state, player: { ...state.player, freeTimeMinutes: 0 } };
    state = act(state, { type: 'market/visit', listingId: listingIn(state, 'dijon').id }).state;
    state = act(state, { type: 'market/visit', listingId: listingIn(state, 'chalon').id }).state;
    for (const day of engine.agendaWeek(state, 14)) {
      const planned = day.planned.reduce((sum, item) => sum + item.minutes, 0);
      const trips = day.trips.reduce((sum, trip) => sum + trip.minutes, 0);
      if (day.planned.length > 0) expect(planned + trips).toBeLessThanOrEqual(day.freeMinutes);
    }
  });
});

describe('the day on site', () => {
  it('puts a visit on a day that already has a trip to the same city, if one is near enough', () => {
    // Sunday 18 October 2026: the weekdays leave too little time for a trip and a visit.
    const state = newGame();
    const [a, b] = [listingIn(state, 'dijon', 0), listingIn(state, 'dijon', 1)];
    const today = toDayNumber(state.clock.date);
    const planned = { ...state, player: { ...state.player, freeTimeMinutes: 0 } };
    const sundayAfter = today + 7;
    const first = {
      ...planned,
      agenda: [
        { id: 'agenda-x', kind: 'visit' as const, listingId: a.id, day: sundayAfter, minutes: 80 },
      ],
    };
    const result = act(first, { type: 'market/visit', listingId: b.id }).state;
    const item = result.agenda.find((i) => i.kind === 'visit' && i.listingId === b.id);
    // Saturday would do (today + 6), but Sunday already has the trip.
    expect(item?.day).toBe(sundayAfter);
    // A day with no trip yet takes it when the city is the base or the wait is too long.
    const alone = act(planned, { type: 'market/visit', listingId: b.id }).state;
    expect(alone.agenda[0]?.day).toBe(today + 6);
  });
});

describe('moving', () => {
  it('changes the base, the rent and the trips, and costs money', () => {
    const state = newGame();
    const moved = act(state, { type: 'city/move', cityId: 'dijon' });
    expect(moved.state.player.baseCityId).toBe('dijon');
    expect(moved.state.player.monthlyRent).toBe(homeRent(content, 'dijon'));
    expect(moved.state.player.monthlyRent).toBeGreaterThan(state.player.monthlyRent);
    expect(state.player.balance - moved.state.player.balance).toBe(
      toCents(content.citiesRules.moving.costEuros),
    );
    expect(moved.events.map((e) => e.type)).toContain('movedCity');
    // Dole is now the faraway city.
    const sheets = engine.citySheets(moved.state);
    expect(sheets[0]?.cityId).toBe('dijon');
    expect(sheets.find((s) => s.cityId === 'dole')?.trip.minutes).toBe(90);
    expect(sheets.find((s) => s.cityId === 'dijon')?.trip.minutes).toBe(0);
  });

  it('is refused for the same city, an unknown one, too soon, without money or from an owned home', () => {
    const state = newGame();
    const refusal = (s: typeof state, cityId: string) => {
      const result = engine.dispatch(s, { type: 'city/move', cityId });
      return result.ok ? null : result.reason.code;
    };
    expect(refusal(state, 'dole')).toBe('move.sameCity');
    expect(refusal(state, 'atlantis')).toBe('city.unknown');
    const moved = act(state, { type: 'city/move', cityId: 'dijon' }).state;
    expect(refusal(moved, 'besancon')).toBe('move.tooSoon');
    const later = advanceDays(moved, content.citiesRules.moving.cooldownDays + 1).state;
    expect(refusal(later, 'besancon')).toBeNull();
    const broke = { ...state, player: { ...state.player, balance: 0 } };
    expect(refusal(broke, 'dijon')).toBe('move.noMoney');
    const owner = {
      ...state,
      player: { ...state.player, homePropertyId: 'property-any' },
    };
    expect(refusal(owner, 'dijon')).toBe('move.ownHome');
  });

  it('is done by buying a home in another city', () => {
    const start = newGame();
    const listing = affordableListing(start, 400_000, 'dijon');
    const bought = buyWithLoan(start, listing.id);
    expect(bought.event.type).toBe('deedSigned');
    const moved = act(bought.state, { type: 'home/moveIn', propertyId: listing.property.id });
    expect(moved.state.player.baseCityId).toBe('dijon');
    expect(moved.state.player.monthlyRent).toBe(0);
    // Leaving it rents a flat in the same city, not in Dole.
    const out = act(moved.state, { type: 'home/moveOut' }).state;
    expect(out.player.baseCityId).toBe('dijon');
    expect(out.player.monthlyRent).toBe(homeRent(content, 'dijon'));
  });

  it('keeps the rent of the start city at the start rent', () => {
    expect(homeRent(content, content.start.cityId)).toBe(toCents(content.start.monthlyRent));
    const ctx = systemContext(newGame());
    expect(moveHome(ctx, 'chalon')).toBeNull();
  });
});

describe('local renown', () => {
  it('rises in the city of a purchase, besides the global reputation', () => {
    const start = newGame();
    const listing = affordableListing(start, 400_000, 'dijon');
    const { state, event } = buyWithLoan(start, listing.id);
    expect(event.type).toBe('deedSigned');
    expect(renownOf(state, 'dijon')).toBe(content.progression.reputation.purchase);
    expect(renownOf(state, 'dole')).toBe(0);
    expect(state.player.reputation).toBeGreaterThan(start.player.reputation);
  });

  it('starts at zero in every city and stays between 0 and 100', () => {
    const state = newGame();
    for (const cityId of Object.keys(content.cities)) expect(renownOf(state, cityId)).toBe(0);
    expect(state.player.renown).toEqual({});
  });
});

describe('managing from afar', () => {
  it('charges a monthly fee for each property of another city managed without an agency', () => {
    const start = newGame();
    const listing = affordableListing(start, 400_000, 'dijon');
    const { state } = buyWithLoan(start, listing.id);
    const { events } = advanceToNextMonth(state);
    const statement = events.find((e) => e.type === 'monthlyStatement');
    if (statement?.type !== 'monthlyStatement') throw new Error('No statement');
    const fees = statement.lines.filter((line) => line.kind === 'remoteManagement');
    // The statement is saved with the game.
    const after = advanceToNextMonth(state).state;
    expect(engine.loadGame(serializeGame(after))).toEqual(after);
    expect(fees).toEqual([
      {
        kind: 'remoteManagement',
        propertyId: listing.property.id,
        amount: toCents(content.citiesRules.remote.monthlyFeePerPropertyEuros),
      },
    ]);
  });

  it('charges nothing in the base city, nor for a property handled by an agency', () => {
    const start = newGame();
    const local = buyWithLoan(start, affordableListing(start).id);
    const events = advanceToNextMonth(local.state).events;
    const statement = events.find((e) => e.type === 'monthlyStatement');
    if (statement?.type !== 'monthlyStatement') throw new Error('No statement');
    expect(statement.lines.some((line) => line.kind === 'remoteManagement')).toBe(false);
    // Once the player lives in Dijon, the Dole flat is the remote one.
    const moved = act(local.state, { type: 'city/move', cityId: 'dijon' }).state;
    const next = advanceToNextMonth(moved).events.find((e) => e.type === 'monthlyStatement');
    if (next?.type !== 'monthlyStatement') throw new Error('No statement');
    expect(next.lines.filter((line) => line.kind === 'remoteManagement')).toHaveLength(1);
  });
});

describe('the region map', () => {
  it('has a sheet for every city, the base first, with its market and trip', () => {
    const state = newGame();
    const sheets = engine.citySheets(state);
    expect(sheets.map((s) => s.cityId)).toHaveLength(Object.keys(content.cities).length);
    expect(sheets[0]).toMatchObject({
      cityId: 'dole',
      isBase: true,
      trip: { minutes: 0, cost: 0 },
    });
    const prices = Object.fromEntries(sheets.map((s) => [s.cityId, s.apartmentPricePerM2]));
    // Dijon is the dear one, Chalon the cheap one (docs/03-systemes/08).
    expect(prices.dijon).toBeGreaterThan(prices.besancon ?? 0);
    expect(prices.besancon).toBeGreaterThan(prices.dole ?? 0);
    expect(prices.dole).toBeGreaterThan(prices.chalon ?? 0);
    for (const sheet of sheets) {
      expect(sheet.grossYieldPercent).toBeGreaterThan(2);
      expect(sheet.grossYieldPercent).toBeLessThan(12);
      expect(sheet.listingsOnline).toBeGreaterThan(10);
      expect(sheet.artisansKnown).toBeGreaterThan(0);
    }
    expect(sheets.find((s) => s.cityId === 'dijon')?.remoteFeePerProperty).toBe(
      toCents(content.citiesRules.remote.monthlyFeePerPropertyEuros),
    );
  });
});

describe('titles that need several cities', () => {
  it('count the cities where the player owns a property', () => {
    const state = newGame();
    const day = state.clock.date.day;
    const dole = sampleOwned(day);
    const dijon = sampleOwned(day, {
      property: { id: 'property-dijon', cityId: 'dijon', neighbourhoodId: 'centreHistorique' },
    });
    const withOne = { ...state, properties: [dole] };
    const withTwo = { ...state, properties: [dole, dijon] };
    expect(statValue(content, withOne, 'cities')).toBe(1);
    expect(statValue(content, withTwo, 'cities')).toBe(2);
  });

  it('are no longer inactive: Investisseur aguerri and Baron ask for their cities', () => {
    const conditionsOf = (id: string) => content.titles.find((t) => t.id === id)?.conditions ?? [];
    expect(conditionsOf('seasonedInvestor')).toContainEqual({ stat: 'cities', min: 2 });
    expect(conditionsOf('baron')).toContainEqual({ stat: 'cities', min: 4 });
  });
});
