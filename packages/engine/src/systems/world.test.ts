import { describe, expect, it } from 'vitest';
import { content, engine, newGame, sampleOwned } from '../../test/helpers.ts';
import { fromDayNumber, toDayNumber } from '../calendar.ts';
import { serializeGame } from '../serialization.ts';
import type { GameState } from '../state.ts';
import { isChristmas, momentOf, seasonOf, weatherOn } from './world.ts';

const CITY = 'dole';

function at(state: GameState, date: GameState['clock']['date'], hour: number): GameState {
  return { ...state, clock: { ...state.clock, date, hour } };
}

function withOwned(state: GameState, owned: GameState['properties'][number]): GameState {
  return { ...state, properties: [...state.properties, owned] };
}

describe('moments, seasons and Christmas', () => {
  it('follows the hours of content/monde.json', () => {
    const starts = content.world.momentStartHours;
    expect(momentOf(content, starts.morning)).toBe('morning');
    expect(momentOf(content, starts.day)).toBe('day');
    expect(momentOf(content, starts.evening)).toBe('evening');
    expect(momentOf(content, starts.night)).toBe('night');
    // After midnight, still the night.
    expect(momentOf(content, 2)).toBe('night');
    expect(momentOf(content, starts.morning - 1)).toBe('night');
  });

  it('wraps the seasons around the new year', () => {
    expect(seasonOf(content, { year: 2027, month: 1, day: 15 })).toBe('winter');
    expect(seasonOf(content, { year: 2027, month: 4, day: 1 })).toBe('spring');
    expect(seasonOf(content, { year: 2027, month: 7, day: 14 })).toBe('summer');
    expect(seasonOf(content, { year: 2026, month: 10, day: 18 })).toBe('autumn');
    expect(seasonOf(content, { year: 2026, month: 12, day: 25 })).toBe('winter');
  });

  it('puts up the Christmas decorations across the new year', () => {
    expect(isChristmas(content, { year: 2026, month: 12, day: 24 })).toBe(true);
    expect(isChristmas(content, { year: 2027, month: 1, day: 3 })).toBe(true);
    expect(isChristmas(content, { year: 2027, month: 2, day: 1 })).toBe(false);
  });
});

describe('weather', () => {
  it('is the same for the same seed and day, without touching the game', () => {
    const state = newGame();
    const before = serializeGame(state);
    const day = toDayNumber(state.clock.date);
    expect(weatherOn(content, state.seed, CITY, day)).toBe(
      weatherOn(content, state.seed, CITY, day),
    );
    engine.ambience(state, CITY);
    engine.streets(state, CITY, 'centreHistorique');
    expect(serializeGame(state)).toBe(before);
  });

  it('lasts at most maxDays and follows the seasons', () => {
    const start = toDayNumber({ year: 2027, month: 1, day: 1 });
    const year = Array.from({ length: 3 * 365 }, (_, i) => weatherOn(content, 7, CITY, start + i));
    // A new weather at least every maxDays days: it changes often over a year.
    const changes = year.filter((weather, i) => i > 0 && weather !== year[i - 1]).length;
    expect(changes / 3).toBeGreaterThan(365 / (content.world.weather.maxDays * 3));
    expect(new Set(year).size).toBeGreaterThanOrEqual(4);
    // No snow in summer.
    const summer = year.filter((_, i) => seasonOf(content, fromDayNumber(start + i)) === 'summer');
    expect(summer).not.toContain('snow');
  });

  it('shows fog only on the quays, and not in the middle of the day', () => {
    const state = newGame();
    // Find a foggy day.
    const first = toDayNumber(state.clock.date);
    let day = first;
    while (weatherOn(content, state.seed, CITY, day) !== 'fog') day++;
    const date = fromDayNumber(day);
    const morning = at(state, date, content.world.momentStartHours.morning);
    const streets = engine.streets(morning, CITY, 'centreHistorique');
    expect(streets.find((street) => street.quay)?.weather).toBe('fog');
    expect(streets.find((street) => !street.quay)?.weather).toBe('clouds');
    const noon = at(state, date, content.world.momentStartHours.day);
    expect(engine.streets(noon, CITY, 'centreHistorique').every((s) => s.weather !== 'fog')).toBe(
      true,
    );
  });
});

describe('streets', () => {
  it('lists the streets of content/monde.json with stable ordinary buildings', () => {
    const state = newGame();
    const streets = engine.streets(state, CITY, 'centreHistorique');
    const rules = content.world.cities[CITY]?.centreHistorique;
    expect(streets.map((street) => street.name)).toEqual(rules?.streets.map((s) => s.name));
    const ordinary = streets[0]?.buildings.filter((b) => b.role === 'ordinary') ?? [];
    expect(ordinary).toHaveLength(rules?.streets[0]?.buildings ?? 0);
    for (const building of ordinary) {
      const range = content.world.floors[building.kind][building.epoch];
      expect(building.floors).toBeGreaterThanOrEqual(range.min);
      expect(building.floors).toBeLessThanOrEqual(range.max);
    }
    // An hour later, the same street.
    const later = engine.tick(state).state;
    expect(
      engine
        .streets(later, CITY, 'centreHistorique')[0]
        ?.buildings.filter((b) => b.role === 'ordinary'),
    ).toEqual(ordinary);
  });

  it('places every listing of the neighbourhood once, with an « À vendre » bubble', () => {
    const state = newGame();
    for (const neighbourhood of content.cities[CITY]?.neighbourhoods ?? []) {
      const buildings = engine.streets(state, CITY, neighbourhood.id).flatMap((s) => s.buildings);
      const listings = state.listings.filter(
        (l) => l.property.cityId === CITY && l.property.neighbourhoodId === neighbourhood.id,
      );
      for (const listing of listings) {
        const found = buildings.filter((b) => b.propertyId === listing.property.id);
        expect(found).toHaveLength(1);
        expect(found[0]?.role).toBe('listing');
        expect(found[0]?.bubbles).toEqual([
          { kind: 'forSale', target: { screen: 'listing', id: listing.id } },
        ]);
      }
    }
  });

  it("marks the player's property and its bubbles, the most urgent first", () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const owned = sampleOwned(today);
    const lease = owned.lease;
    if (!lease) throw new Error('let');
    const troubled = withOwned(state, {
      ...owned,
      lease: {
        ...lease,
        incident: {
          id: 'i1',
          kindId: content.renting.incidents[0]?.id ?? '',
          day: today,
          repair: null,
        },
        arrears: {
          amount: 520_00,
          months: 1,
          sinceDay: today,
          reminderFailed: false,
          procedureEndDay: null,
        },
      },
      sale: { askingPrice: 90_000_00, mode: 'self', listedDay: today, offers: [], agreement: null },
    });
    const building = engine
      .streets(troubled, CITY, 'centreHistorique')
      .flatMap((s) => s.buildings)
      .find((b) => b.propertyId === owned.property.id);
    expect(building?.role).toBe('owned');
    expect(building?.highlightFloor).toBe(1);
    expect(building?.bubbles.map((b) => b.kind)).toEqual(['incident', 'arrears']);
    expect(building?.bubbles[0]?.target).toEqual({
      screen: 'property',
      id: owned.property.id,
      tab: 'rental',
    });
    expect(building?.bubbles.length).toBeLessThanOrEqual(content.world.maxBubbles);
  });

  it('shows works with scaffolding and a percentage', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const owned = sampleOwned(today, { let: false });
    const itemId = 'living.walls';
    const busy = withOwned(state, {
      ...owned,
      works: {
        id: 'w1',
        startDay: today - 5,
        tasks: [
          {
            id: 't1',
            artisanId: null,
            trade: 'painter',
            phase: 0,
            items: [{ itemId, tier: 'standard', price: 0 }],
            status: 'running',
            availableDay: today - 5,
            days: 10,
            startDay: today - 5,
            endDay: today + 5,
            overrun: 0,
            deposit: 0,
            minutesNeeded: 600,
            minutesDone: 300,
          },
        ],
        hazard: null,
        dpeBefore: 'D',
        paid: 0,
      },
    });
    const building = engine
      .streets(busy, CITY, 'centreHistorique')
      .flatMap((s) => s.buildings)
      .find((b) => b.propertyId === owned.property.id);
    expect(building?.scaffolding).toBe(true);
    const works = building?.bubbles.find((b) => b.kind === 'works');
    expect(works?.percent).toBeGreaterThan(0);
    expect((works?.percent ?? 0) % 5).toBe(0);
    expect(works?.target).toEqual({ screen: 'property', id: owned.property.id, tab: 'rooms' });

    const section = engine.section(busy, CITY, 'centreHistorique', owned.property.id);
    const mine = section?.units.find((unit) => unit.role === 'player');
    expect(mine?.floor).toBe(1);
    expect(mine?.occupied).toBe(false);
    expect(mine?.rooms.find((room) => room.spaceId === 'living')?.renovating).toBe('painter');
    expect(section?.worksPercent).toBe(works?.percent);
  });
});

describe('cross-section', () => {
  it('shows the flats of a listed apartment block, the listed one among neighbours', () => {
    const state = newGame();
    const listing = state.listings.find((l) => l.property.kind === 'apartment');
    if (!listing) throw new Error('no apartment listed');
    const { neighbourhoodId } = listing.property;
    const section = engine.section(state, CITY, neighbourhoodId, listing.property.id);
    expect(section?.kind).toBe('apartment');
    const listed = section?.units.filter((unit) => unit.role === 'listing') ?? [];
    expect(listed).toHaveLength(1);
    expect(listed[0]?.floor).toBe(listing.property.floor);
    expect(listed[0]?.rooms.length).toBeGreaterThan(0);
    expect(section?.units.some((unit) => unit.role === 'neighbour')).toBe(true);
  });

  it('spreads the rooms of a house over its floors', () => {
    const state = newGame();
    const listing = state.listings.find((l) => l.property.kind === 'house');
    if (!listing) return;
    const section = engine.section(
      state,
      CITY,
      listing.property.neighbourhoodId,
      listing.property.id,
    );
    const rooms = section?.units.flatMap((unit) => unit.rooms) ?? [];
    expect(rooms.length).toBe(listing.property.spaces.filter((s) => s.kind !== 'garden').length);
    expect(section?.garden).toBe(true);
  });

  it('finds the building of a listing in its street', () => {
    const state = newGame();
    const listing = state.listings[0];
    if (!listing) throw new Error('no listing');
    const place = engine.building(state, listing.property.id);
    expect(place?.neighbourhoodId).toBe(listing.property.neighbourhoodId);
    expect(place?.building.propertyId).toBe(listing.property.id);
    const street = engine
      .streets(state, CITY, listing.property.neighbourhoodId)
      .find((candidate) => candidate.id === place?.streetId);
    expect(street?.buildings).toContainEqual(place?.building);
    expect(engine.building(state, 'nowhere')).toBeNull();
  });

  it('opens an ordinary building with neighbours only', () => {
    const state = newGame();
    const street = engine.streets(state, CITY, 'paters')[0];
    const ordinary = street?.buildings.find((b) => b.role === 'ordinary');
    if (!ordinary) throw new Error('no ordinary building');
    const section = engine.section(state, CITY, 'paters', ordinary.id);
    expect(section?.units.every((unit) => unit.role === 'neighbour')).toBe(true);
    expect(engine.section(state, CITY, 'paters', 'nowhere')).toBeNull();
  });
});
