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
    // A street has a fixed number of places; ordinary buildings fill those not taken.
    const places = (rules?.streets[0]?.buildings ?? 0) * content.world.placesPerBuilding;
    expect(streets[0]?.buildings.length).toBe(places);
    const ordinary = streets[0]?.buildings.filter((b) => b.role === 'ordinary') ?? [];
    expect(ordinary.length).toBeGreaterThan(0);
    for (const building of ordinary) {
      const range =
        content.world.floors[
          building.kind === 'commercial'
            ? 'apartment'
            : building.kind === 'parking' || building.kind === 'land'
              ? 'house'
              : building.kind
        ][building.epoch];
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

  it("keeps the player's property in its place while listings come and go", () => {
    const state = withOwned(newGame(), sampleOwned(toDayNumber(newGame().clock.date)));
    const id = state.properties[0]?.property.id;
    const where = (current: GameState) =>
      engine
        .streets(current, CITY, 'centreHistorique')
        .map((street) => [
          street.buildings.length,
          street.buildings.findIndex((b) => b.propertyId === id),
        ]);
    const before = where(state);
    expect(before.some(([, index]) => (index ?? -1) >= 0)).toBe(true);
    // Every listing gone, or twice as many: the streets and the property do not move.
    expect(where({ ...state, listings: [] })).toEqual(before);
    const doubled = state.listings.map((listing) => ({
      ...listing,
      id: `${listing.id}-bis`,
      property: { ...listing.property, id: `${listing.property.id}-bis` },
    }));
    expect(where({ ...state, listings: [...state.listings, ...doubled] })).toEqual(before);
  });

  it('draws a listing with the look of the building it stands in for', () => {
    // Notes of a test game: the buildings changed as listings came and went.
    const state = newGame();
    let dwellings = 0;
    let sameStyle = 0;
    let identical = 0;
    for (const neighbourhood of content.cities[CITY]?.neighbourhoods ?? []) {
      const empty = engine.streets({ ...state, listings: [] }, CITY, neighbourhood.id);
      const streets = engine.streets(state, CITY, neighbourhood.id);
      streets.forEach((street, streetIndex) => {
        street.buildings.forEach((building, index) => {
          if (building.role !== 'listing') return;
          const before = empty[streetIndex]?.buildings[index];
          if (!before || before.role !== 'ordinary') return; // At the end of the street.
          // Same place: same colours and details, same tree.
          expect(building.placeId).toBe(before.placeId);
          expect(building.variant).toBe(before.variant);
          expect(building.tree).toBe(before.tree);
          // A shop, a parking or a plot is drawn as such: only the dwellings are compared.
          if (building.kind !== 'apartment' && building.kind !== 'house') return;
          dwellings += 1;
          if (building.kind === before.kind && building.epoch === before.epoch) sameStyle += 1;
          if (
            building.kind === before.kind &&
            building.epoch === before.epoch &&
            building.floors === before.floors &&
            building.shop === before.shop
          ) {
            identical += 1;
          }
        });
      });
    }
    expect(dwellings).toBeGreaterThan(10);
    // Nearly always the same style; usually the same height too (a flat high up may need
    // a taller building than the places left).
    expect(sameStyle / dwellings).toBeGreaterThan(0.95);
    expect(identical / dwellings).toBeGreaterThan(0.75);
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
        managed: false,
        transformation: null,
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
        before: null,
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

describe('cross-section of the dwelling of the player', () => {
  it('tells the range of each room and who lives there', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    const let_ = sampleOwned(today, { let: true });
    const premium = {
      ...let_,
      property: {
        ...let_.property,
        items: let_.property.items.map((item) =>
          item.spaceId === 'living' ? { ...item, tier: 'premium' as const } : item,
        ),
      },
    };
    const mineOf = (owned: typeof let_) =>
      engine
        .section(withOwned(state, owned), CITY, 'centreHistorique', owned.property.id)
        ?.units.find((unit) => unit.role === 'player');
    const mine = mineOf(premium);
    // The living room, fitted in the premium range; the others as they are.
    expect(mine?.rooms.find((room) => room.spaceId === 'living')?.tier).toBe('premium');
    expect(mine?.rooms.find((room) => room.spaceId === 'bedroom')?.tier).toBe(
      let_.property.items.find((item) => item.spaceId === 'bedroom')?.tier,
    );
    // The tenant of the lease lives there; an empty flat has nobody; the player's own home, them.
    expect(mine?.resident).toEqual({
      kind: 'tenant',
      name: `${let_.lease?.tenant.firstName} ${let_.lease?.tenant.lastName}`,
    });
    expect(mineOf({ ...let_, lease: null })?.resident).toBeNull();
    const home = { ...withOwned(state, { ...let_, lease: null }) };
    home.player = { ...home.player, homePropertyId: let_.property.id };
    expect(
      engine
        .section(home, CITY, 'centreHistorique', let_.property.id)
        ?.units.find((unit) => unit.role === 'player')?.resident,
    ).toEqual({ kind: 'player' });
  });
});

describe('cross-section', () => {
  it('shows the flats of a listed apartment block, the listed one among neighbours', () => {
    const state = newGame();
    const listing = state.listings.find(
      (l) => l.property.kind === 'apartment' && l.property.cityId === CITY,
    );
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
    const listing = state.listings.find(
      (l) => l.property.kind === 'house' && l.property.cityId === CITY,
    );
    if (!listing) throw new Error('no house');
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
    const listing = state.listings.find((l) => l.property.cityId === CITY);
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
