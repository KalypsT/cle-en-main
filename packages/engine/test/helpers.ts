import { type GameContent, gameContent } from '@cle/content';
import type { GameAction } from '../src/actions.ts';
import { toDayNumber } from '../src/calendar.ts';
import { deepClone } from '../src/clone.ts';
import type { GameEvent } from '../src/events.ts';
import { createEngine, type CreateGameOptions } from '../src/index.ts';
import type { GameState, OwnedProperty, Property } from '../src/state.ts';
import { blankItems, calibrateEnergy, layoutSpaces } from '../src/systems/dwelling.ts';
import type { SystemContext } from '../src/systems/context.ts';

export const content = gameContent;
export const engine = createEngine(content);

export const defaultOptions: CreateGameOptions = {
  seed: 1234,
  // A Sunday, as in the milestone 0 tests.
  startDate: { year: 2026, month: 10, day: 18 },
  startHour: 8,
};

export function newGame(overrides: Partial<CreateGameOptions> = {}) {
  return engine.createGame({ ...defaultOptions, ...overrides });
}

/** Advances to 00:00 on the first day of the next month and returns that tick's events. */
export function advanceToNextMonth(state: ReturnType<typeof newGame>) {
  let current = state;
  for (;;) {
    const result = engine.tick(current);
    current = result.state;
    if (result.events.some((event) => event.type === 'monthStarted')) {
      return { state: current, events: result.events };
    }
  }
}

/** Listings of a city (Dole by default: the tests of the first milestones play there). */
export function cityListings(state: GameState, cityId = 'dole') {
  return state.listings.filter((l) => l.property.cityId === cityId);
}

/** First flat or house for sale in a city (shops, parking spaces and land aside). */
export function homeListing(state: GameState, cityId = 'dole') {
  return cityListings(state, cityId).find(
    (l) => l.property.kind === 'apartment' || l.property.kind === 'house',
  );
}

/** A system context on a copy of `state`, to call systems directly. */
export function systemContext(state: GameState): SystemContext {
  return { content, state: deepClone(state), events: [], today: toDayNumber(state.clock.date) };
}

/** Dispatches an action that must succeed. */
export function act(
  state: GameState,
  action: GameAction,
): { state: GameState; events: GameEvent[] } {
  const result = engine.dispatch(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.reason.code}`);
  return { state: result.state, events: result.events };
}

/** Advances whole days (to the same hour) and collects the events. */
export function advanceDays(state: GameState, days: number) {
  return engine.advanceHours(state, days * 24);
}

/** Advances day by day until an event matches, within `maxDays`. */
export function advanceUntil(
  state: GameState,
  match: (event: GameEvent) => boolean,
  maxDays = 120,
): { state: GameState; events: GameEvent[]; event: GameEvent } {
  let current = state;
  const events: GameEvent[] = [];
  for (let day = 0; day < maxDays; day++) {
    const result = advanceDays(current, 1);
    current = result.state;
    events.push(...result.events);
    const event = result.events.find(match);
    if (event) return { state: current, events, event };
  }
  throw new Error('Expected event did not happen');
}

/** Cheapest flat or house whose asking price is at most `maxPrice` euros. */
export function affordableListing(state: GameState, maxPrice = 90_000, cityId = 'dole') {
  const listing = [...state.listings]
    .filter(
      (l) =>
        l.property.cityId === cityId &&
        l.askingPrice <= maxPrice * 100 &&
        (l.property.kind === 'apartment' || l.property.kind === 'house'),
    )
    .sort((a, b) => a.askingPrice - b.askingPrice)[0];
  if (!listing) throw new Error('No affordable listing');
  return listing;
}

/**
 * Buys a listing at its asking price with a Tirelire loan of the price over
 * 20 years, up to the deed. Returns the state on the deed day.
 */
export function buyWithLoan(state: GameState, listingId: string) {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error('Unknown listing');
  let current = act(state, { type: 'market/offer', listingId, amount: listing.askingPrice }).state;
  const signed = advanceUntil(current, (e) => e.type === 'compromisSigned');
  current = signed.state;
  const purchase = current.purchases[0];
  if (!purchase) throw new Error('No compromis');
  current = act(current, {
    type: 'purchase/requestLoan',
    purchaseId: purchase.id,
    bankId: 'tirelire',
    amount: purchase.price,
    durationYears: 20,
  }).state;
  const answered = advanceUntil(current, (e) => e.type === 'loanAnswered');
  current = answered.state;
  const application = current.purchases[0]?.applications[0];
  if (!application) throw new Error('No application');
  current = act(current, {
    type: 'purchase/acceptLoan',
    purchaseId: purchase.id,
    applicationId: application.id,
  }).state;
  const deed = advanceUntil(
    current,
    (e) => e.type === 'deedSigned' || e.type === 'purchaseCancelled',
  );
  return { state: deed.state, event: deed.event, purchase };
}

/** What a property is made of besides its rooms and items. */
export type PropertyBasics = Omit<
  Property,
  'spaces' | 'items' | 'energyFactor' | 'copro' | 'postponedHazards'
>;

/**
 * A property with its rooms, every item at `state` (known), and the energy
 * model calibrated on its DPE: 4 is « bon état », 1 a ruin.
 */
export function dwelling(basics: PropertyBasics, state = 4): Property {
  const spaces = layoutSpaces(content, basics.kind, basics.surface, basics.rooms, basics.lots);
  const items = blankItems(content, basics.kind, spaces).map((item) => ({ ...item, state }));
  const property: Property = {
    ...basics,
    spaces,
    items,
    energyFactor: 1,
    // No general meeting: tests ask for one explicitly.
    copro: null,
    postponedHazards: [],
  };
  return { ...property, energyFactor: calibrateEnergy(content, property) };
}

/** The same property with every item at `state`. */
export function withState(property: Property, state: number): Property {
  return { ...property, items: property.items.map((item) => ({ ...item, state })) };
}

/** A flat owned since mid-December 2026, optionally let bare to a quiet tenant from `day`. */
export function sampleOwned(
  day: number,
  overrides: { property?: Partial<OwnedProperty['property']>; let?: boolean } = {},
): OwnedProperty {
  const rent = 520_00;
  const property = dwelling({
    id: 'property-sample',
    cityId: 'dole',
    neighbourhoodId: 'centreHistorique',
    kind: 'apartment',
    surface: 45,
    rooms: 2,
    floor: 1,
    lots: [],
    epoch: 'from1948to1974',
    dpe: 'D',
    defects: [],
    annualPropertyTax: 585_00,
    monthlyCharges: 99_00,
  });
  return {
    property: { ...property, ...overrides.property },
    holder: 'player',
    purchasePrice: 80_000_00,
    acquisitionCost: 86_800_00,
    purchaseDate: { year: 2026, month: 12, day: 15 },
    sale: null,
    rental: null,
    lease:
      overrides.let === false
        ? null
        : {
            leaseType: 'bare',
            tenant: {
              firstName: 'Camille',
              lastName: 'Martin',
              profileId: 'employee',
              traitId: 'plantLover',
              monthlyIncome: 2_000_00,
              guarantor: false,
              desiredYears: 4,
              reliability: 0.9,
              mobility: 1,
            },
            monthlyRent: rent,
            startDay: day,
            termDay: day + 3 * 365,
            anniversaryDay: day + 365,
            revisionFactor: 1,
            deposit: rent,
            agencyId: null,
            insured: false,
            satisfaction: 75,
            noticeEndDay: null,
            incident: null,
            arrears: null,
            missedDays: 0,
          },
    furniture: null,
    taxRegime: 'auto',
    furnishedTax: {
      deferredDepreciation: 0,
      deficitCarry: 0,
      buildingDepreciationDeducted: 0,
      works: [],
    },
    quotes: [],
    works: null,
    worksFund: null,
    worksForCapitalGains: 0,
    coproMeeting: null,
    coproCalls: [],
  };
}

/** The content with the hazards of renting switched off (incidents, unpaid rents, departures). */
export function quietContent(): GameContent {
  const quiet = deepClone(gameContent);
  for (const incident of quiet.renting.incidents) incident.monthlyProbability = 0;
  quiet.renting.unpaid.monthlyProbability = 0;
  quiet.renting.leaseTypes.bare.monthlyDepartureProbability = 0;
  quiet.renting.leaseTypes.furnished.monthlyDepartureProbability = 0;
  quiet.renting.lifeEvents.yearlyProbability = 0;
  quiet.renting.damages.probability = 0;
  // Milestone 6: no catalogue events, anecdotes, challenges nor off-market offers.
  quiet.events = [];
  quiet.rhythm.events.anecdoteChancePerDay = 0;
  quiet.challenges.chancePerDay = 0;
  quiet.progression.effects.offMarketChancePerMonth = 0;
  for (const title of quiet.titles) title.perks = {};
  return quiet;
}
