import type { CalendarDate } from '../calendar.ts';
import { fromDayNumber, toDayNumber } from '../calendar.ts';
import {
  type Epoch,
  findCity,
  type GameContent,
  type Moment,
  type Season,
  type SpaceKind,
  type Tier,
  type Trade,
  type Weather,
} from '../content.ts';
import { EPOCHS, MOMENTS, SEASONS, WEATHERS } from '../content-constants.ts';
import { hashFloat } from '../random.ts';
import type { AnecdoteNote, GameState, OwnedProperty, Property, PropertyKind } from '../state.ts';
import { believedView, isDwelling } from './dwelling.ts';
import { facadeOf } from './works-report.ts';
import { worksPlan } from './works-view.ts';

/*
 * The living world (docs/05, sections 5.3 and 5.4; docs/04, 4.6): what the
 * street and the cross-section show. Read-only queries: nothing here is
 * stored in the save, and nothing draws from the game's random generator.
 * Decoration comes from stable hashes of the game's seed and of ids.
 */

/** Light, season and weather of the city at the current hour. */
export interface Ambience {
  hour: number;
  moment: Moment;
  season: Season;
  /** Weather of the city; fog only shows on the quays (see StreetView.weather). */
  weather: Weather;
  christmas: boolean;
  /** The church bells ring this hour. */
  bells: boolean;
}

export type BubbleKind =
  | 'hazard'
  | 'event'
  | 'incident'
  | 'arrears'
  | 'saleOffer'
  | 'applications'
  | 'copro'
  | 'works'
  | 'sold'
  | 'forSale'
  | 'toLet'
  | 'compromis'
  | 'anecdote';

/** Bubbles by priority: the first ones are shown when there are too many. */
export const BUBBLE_PRIORITY: readonly BubbleKind[] = [
  'hazard',
  'event',
  'incident',
  'arrears',
  'saleOffer',
  'applications',
  'copro',
  'works',
  'sold',
  'forSale',
  'toLet',
  'compromis',
  'anecdote',
];

/** Which existing sheet a bubble opens. */
export type BubbleTarget =
  | { screen: 'listing'; id: string }
  | { screen: 'purchase'; id: string }
  | { screen: 'property'; id: string; tab: 'overview' | 'rooms' | 'rental' }
  /** A catalogue event waiting for an answer. */
  | { screen: 'event'; id: string }
  /** An anecdote heard lately: its text, with no stakes. */
  | { screen: 'anecdote'; anecdote: AnecdoteNote };

export interface Bubble {
  kind: BubbleKind;
  /** Works progress in percent (multiple of 5), for `works`. */
  percent?: number;
  /** Number of applications or offers. */
  count?: number;
  target: BubbleTarget;
}

/** Who a building of the street belongs to, for the player. */
export type BuildingRole = 'ordinary' | 'owned' | 'listing' | 'purchase' | 'rival';

export interface StreetBuilding {
  /** Stable id: the property's, or `${streetId}.${index}` for an ordinary building. */
  id: string;
  /**
   * The place in the street, `${streetId}.${index}`: a property takes the place of an
   * ordinary building and keeps its look, so the decoration hangs on the place.
   */
  placeId: string;
  role: BuildingRole;
  propertyId: string | null;
  /** The player lives there. */
  home: boolean;
  kind: PropertyKind;
  epoch: Epoch;
  /** Floors, ground floor included. */
  floors: number;
  /** A shop on the ground floor. */
  shop: boolean;
  /** A tree after the building. */
  tree: boolean;
  /** State of what the street sees (façade, windows, roof), 1 … 5. */
  facadeState: number;
  /** Windows renovated (state 5, or above the standard range). */
  newWindows: boolean;
  /** Works in progress: scaffolding (and a tarp on the roof when it is redone). */
  scaffolding: boolean;
  tarp: boolean;
  /** Floor of the player's (or the listed) flat in an apartment block; null otherwise. */
  highlightFloor: number | null;
  /** Stable 0 … 1 number for the decoration (colours, shutters, flowers). */
  variant: number;
  bubbles: Bubble[];
}

export interface StreetView {
  id: string;
  name: string;
  quay: boolean;
  weather: Weather;
  buildings: StreetBuilding[];
}

export interface SectionRoom {
  spaceId: string;
  kind: SpaceKind;
  surface: number;
  /** Mean state of the room's items, 1 … 5 (as the player knows them). */
  state: number;
  /** Trade of an artisan (or the player) working in the room today. */
  renovating: Trade | null;
  /** Range of the room's fittings (the mean of its items), for the floor and the furniture. */
  tier: Tier;
}

export interface SectionUnit {
  id: string;
  floor: number;
  /** Position on the floor, and number of units on that floor. */
  column: number;
  columns: number;
  role: 'player' | 'listing' | 'purchase' | 'neighbour';
  propertyId: string | null;
  /** Somebody lives there (tenant, the player, or a neighbour). */
  occupied: boolean;
  /** Who lives in the player's dwelling: the tenant (by name), the player, or nobody. */
  resident: { kind: 'tenant'; name: string } | { kind: 'player' } | null;
  /** The player's rooms; empty for the neighbours. */
  rooms: SectionRoom[];
  /** Trades working on the whole dwelling (electricity, heating…) today. */
  works: Trade[];
}

export interface SectionView {
  buildingId: string;
  role: BuildingRole;
  kind: PropertyKind;
  epoch: Epoch;
  floors: number;
  garden: boolean;
  units: SectionUnit[];
  /** Works progress in percent (multiple of 5); null without works. */
  worksPercent: number | null;
}

const PERCENT_STEP = 5;

function beforeOrSame(date: CalendarDate, [month, day]: readonly [number, number]): boolean {
  return date.month < month || (date.month === month && date.day <= day);
}

function onOrAfter(date: CalendarDate, [month, day]: readonly [number, number]): boolean {
  return date.month > month || (date.month === month && date.day >= day);
}

export function momentOf(content: GameContent, hour: number): Moment {
  const starts = content.world.momentStartHours;
  // The moment whose start is the latest before this hour (night wraps past midnight).
  let best: Moment = 'night';
  let bestStart = -1;
  for (const moment of MOMENTS) {
    const start = starts[moment];
    if (start <= hour && start > bestStart) {
      best = moment;
      bestStart = start;
    }
  }
  if (bestStart === -1) {
    // Before the earliest start: the moment that started last yesterday.
    best = MOMENTS.reduce((a, b) => (starts[b] > starts[a] ? b : a));
  }
  return best;
}

export function seasonOf(content: GameContent, date: CalendarDate): Season {
  const starts = content.world.seasonStarts;
  let best: Season | null = null;
  let bestKey = -1;
  for (const season of SEASONS) {
    const [month, day] = starts[season];
    const key = month * 100 + day;
    if (onOrAfter(date, starts[season]) && key > bestKey) {
      best = season;
      bestKey = key;
    }
  }
  // Before the first start of the year: the season that started last year.
  return best ?? SEASONS.reduce((a, b) => (key(starts[b]) > key(starts[a]) ? b : a));
}

function key([month, day]: readonly [number, number]): number {
  return month * 100 + day;
}

export function isChristmas(content: GameContent, date: CalendarDate): boolean {
  const { from, to } = content.world.christmas;
  return key(from) <= key(to)
    ? onOrAfter(date, from) && beforeOrSame(date, to)
    : onOrAfter(date, from) || beforeOrSame(date, to);
}

/**
 * Weather of a city on a day: it lasts 1 to `maxDays` days. Looking back, a
 * day starts a new weather with `changeChance` (or when the previous one has
 * lasted long enough); the weather is drawn for the season of its first day.
 */
export function weatherOn(
  content: GameContent,
  seed: number,
  cityId: string,
  day: number,
): Weather {
  const rules = content.world.weather;
  let start = day;
  for (let back = 0; back < rules.maxDays; back++) {
    start = day - back;
    const isLast = back === rules.maxDays - 1;
    if (isLast || hashFloat(seed, `weather-change#${cityId}#${start}`) < rules.changeChance) break;
  }
  const shares = rules.bySeason[seasonOf(content, fromDayNumber(start))];
  let draw = hashFloat(seed, `weather#${cityId}#${start}`);
  for (const weather of WEATHERS) {
    draw -= shares[weather] ?? 0;
    if (draw < 0) return weather;
  }
  return 'clouds';
}

/** Fog only stays on the quays, outside the middle of the day. */
function localWeather(content: GameContent, weather: Weather, moment: Moment, quay: boolean) {
  if (weather !== 'fog') return weather;
  return quay && content.world.weather.fogMoments.includes(moment) ? 'fog' : 'clouds';
}

export function ambience(content: GameContent, state: GameState, cityId: string): Ambience {
  const { date, hour } = state.clock;
  const moment = momentOf(content, hour);
  const raw = weatherOn(content, state.seed, cityId, toDayNumber(date));
  return {
    hour,
    moment,
    season: seasonOf(content, date),
    // The city as a whole: fog shows while it lasts on the quays.
    weather: localWeather(content, raw, moment, true),
    christmas: isChristmas(content, date),
    bells: content.world.bellHours.includes(hour),
  };
}

/** A number in [min, max] from a hash. */
function pickInt(value: number, min: number, max: number): number {
  return min + Math.min(max - min, Math.floor(value * (max - min + 1)));
}

function pickEpoch(shares: Record<Epoch, number>, value: number): Epoch {
  let draw = value;
  for (const epoch of EPOCHS) {
    draw -= shares[epoch] ?? 0;
    if (draw < 0) return epoch;
  }
  return 'before1948';
}

function floorsOf(content: GameContent, kind: PropertyKind, epoch: Epoch, value: number): number {
  // A shop sits under flats; a parking space or a plot of land is drawn low, like a house.
  const facade = isDwelling(kind) ? kind : kind === 'commercial' ? 'apartment' : 'house';
  const range = content.world.floors[facade][epoch];
  return pickInt(value, range.min, range.max);
}

/** A property shown in the street, before it is laid out. */
interface Placed {
  property: Property;
  role: Exclude<BuildingRole, 'ordinary'>;
  owned: OwnedProperty | null;
  listingId: string | null;
  purchaseId: string | null;
}

function placedProperties(state: GameState, cityId: string, neighbourhoodId: string): Placed[] {
  const placed: Placed[] = [];
  const here = (property: Property) =>
    property.cityId === cityId && property.neighbourhoodId === neighbourhoodId;
  for (const owned of state.properties) {
    if (here(owned.property)) {
      placed.push({
        property: owned.property,
        role: 'owned',
        owned,
        listingId: null,
        purchaseId: null,
      });
    }
  }
  for (const purchase of state.purchases) {
    if (here(purchase.property)) {
      placed.push({
        property: purchase.property,
        role: 'purchase',
        owned: null,
        listingId: null,
        purchaseId: purchase.id,
      });
    }
  }
  for (const listing of state.listings) {
    if (here(listing.property)) {
      placed.push({
        property: listing.property,
        role: 'listing',
        owned: null,
        listingId: listing.id,
        purchaseId: null,
      });
    }
  }
  for (const rival of Object.values(state.rivals)) {
    for (const project of rival.projects) {
      if (here(project.property)) {
        placed.push({
          property: project.property,
          role: 'rival',
          owned: null,
          listingId: null,
          purchaseId: null,
        });
      }
    }
  }
  return placed;
}

/** Works progress of an owned property, in percent (multiple of 5). */
function worksPercent(content: GameContent, state: GameState, owned: OwnedProperty): number | null {
  if (!owned.works) return null;
  const plan = worksPlan(content, state, owned);
  if (plan.length === 0) return 0;
  const start = Math.min(...plan.map((task) => task.startDay), owned.works.startDay);
  const end = Math.max(...plan.map((task) => task.endDay));
  const today = toDayNumber(state.clock.date);
  const share = end > start ? (today - start) / (end - start) : 0;
  const percent = Math.round((Math.min(1, Math.max(0, share)) * 100) / PERCENT_STEP) * PERCENT_STEP;
  // Never « 100 % » while the works go on.
  return Math.min(100 - PERCENT_STEP, percent);
}

function ownedBubbles(content: GameContent, state: GameState, owned: OwnedProperty): Bubble[] {
  const id = owned.property.id;
  const bubbles: Bubble[] = [];
  const property = (tab: 'overview' | 'rooms' | 'rental'): BubbleTarget => ({
    screen: 'property',
    id,
    tab,
  });
  if (owned.works?.hazard) bubbles.push({ kind: 'hazard', target: property('rooms') });
  for (const instance of state.catalog.pending) {
    if (instance.propertyId === id)
      bubbles.push({ kind: 'event', target: { screen: 'event', id: instance.id } });
  }
  if (owned.lease?.incident) bubbles.push({ kind: 'incident', target: property('rental') });
  if (owned.lease?.arrears) bubbles.push({ kind: 'arrears', target: property('rental') });
  if (owned.sale && !owned.sale.agreement && owned.sale.offers.length > 0) {
    bubbles.push({
      kind: 'saleOffer',
      count: owned.sale.offers.length,
      target: property('overview'),
    });
  }
  if (owned.rental && owned.rental.applications.length > 0) {
    bubbles.push({
      kind: 'applications',
      count: owned.rental.applications.length,
      target: property('rental'),
    });
  }
  if (owned.coproMeeting) bubbles.push({ kind: 'copro', target: property('overview') });
  if (owned.works) {
    bubbles.push({
      kind: 'works',
      percent: worksPercent(content, state, owned) ?? 0,
      target: property('rooms'),
    });
  }
  if (owned.sale?.agreement) bubbles.push({ kind: 'sold', target: property('overview') });
  else if (owned.sale) bubbles.push({ kind: 'forSale', target: property('overview') });
  if (owned.rental && owned.rental.applications.length === 0) {
    bubbles.push({ kind: 'toLet', target: property('rental') });
  }
  const today = toDayNumber(state.clock.date);
  const recent = [...state.catalog.anecdotes]
    .reverse()
    .find(
      (note) =>
        note.propertyId === id && today - note.day < content.rhythm.events.anecdoteBubbleDays,
    );
  if (recent) bubbles.push({ kind: 'anecdote', target: { screen: 'anecdote', anecdote: recent } });
  return bubbles;
}

function sortBubbles(content: GameContent, bubbles: Bubble[]): Bubble[] {
  return [...bubbles]
    .sort((a, b) => BUBBLE_PRIORITY.indexOf(a.kind) - BUBBLE_PRIORITY.indexOf(b.kind))
    .slice(0, content.world.maxBubbles);
}

/** Running works tasks of an owned property, by item id. */
function runningTrades(owned: OwnedProperty | null): Map<string, Trade> {
  const trades = new Map<string, Trade>();
  if (!owned?.works || owned.works.hazard) return trades;
  for (const task of owned.works.tasks) {
    if (task.status !== 'running') continue;
    for (const line of task.items) trades.set(line.itemId, task.trade);
  }
  return trades;
}

/** Floors a property needs: an apartment's own floor at least. */
function minFloorsOf(property: Property): number {
  return property.kind === 'apartment' ? (property.floor ?? 0) + 1 : 1;
}

/** How a property is drawn: a block of flats (a shop too) or a low building. */
function facadeKind(kind: PropertyKind): 'apartment' | 'house' {
  return kind === 'apartment' || kind === 'building' || kind === 'commercial'
    ? 'apartment'
    : 'house';
}

/**
 * How well an ordinary building's place suits a property, best first: same kind, epoch and
 * enough floors, and its shop if any (nothing but the façade's state changes when it comes
 * or goes); then same kind and epoch, a little taller if need be (same colours and style);
 * then same kind; then any place.
 */
const FITS: readonly ((slot: StreetBuilding, property: Property) => boolean)[] = [
  (slot, property) =>
    slot.kind === facadeKind(property.kind) &&
    slot.epoch === property.epoch &&
    slot.floors >= minFloorsOf(property) &&
    // A flat on the ground floor leaves no room for the shop.
    !(slot.shop && property.kind === 'apartment' && (property.floor ?? 0) === 0),
  (slot, property) => slot.kind === facadeKind(property.kind) && slot.epoch === property.epoch,
  (slot, property) => slot.kind === facadeKind(property.kind),
  () => true,
];

function placedBuilding(
  content: GameContent,
  state: GameState,
  placed: Placed,
  place: { slot: StreetBuilding | null; placeId: string; shop: boolean; tree: boolean },
): StreetBuilding {
  const { property, owned } = placed;
  const { slot } = place;
  const seen = placed.role === 'listing' ? believedView(content, property) : property;
  const { facadeState, newWindows } = facadeOf(content, seen);
  const running = runningTrades(owned);
  const roofWorks = [...running.keys()].some((itemId) => itemId === 'roof');
  // In the place of an ordinary building, the property takes its look: its colours and
  // details (the variant), its height, its shop and its tree.
  const variant = slot?.variant ?? hashFloat(state.seed, `variant#${property.id}`);
  const minFloors = minFloorsOf(property);
  const floors = Math.max(
    minFloors,
    slot?.floors ??
      floorsOf(
        content,
        property.kind,
        property.epoch,
        hashFloat(state.seed, `floors#${property.id}`),
      ),
  );
  const shop = slot?.shop ?? place.shop;
  const tree = slot?.tree ?? place.tree;
  let bubbles: Bubble[] = [];
  if (owned) bubbles = ownedBubbles(content, state, owned);
  else if (placed.listingId) {
    bubbles = [{ kind: 'forSale', target: { screen: 'listing', id: placed.listingId } }];
  } else if (placed.purchaseId) {
    bubbles = [{ kind: 'compromis', target: { screen: 'purchase', id: placed.purchaseId } }];
  }
  return {
    id: property.id,
    placeId: place.placeId,
    role: placed.role,
    propertyId: property.id,
    home: state.player.homePropertyId === property.id,
    kind: property.kind,
    epoch: property.epoch,
    floors,
    // A shop only under flats, and never where the flat itself is on the ground floor.
    shop: shop && property.kind === 'apartment' && (property.floor ?? 0) > 0,
    tree,
    facadeState,
    newWindows,
    scaffolding: Boolean(owned?.works) || placed.role === 'rival',
    tarp: roofWorks,
    highlightFloor: property.kind === 'apartment' ? (property.floor ?? 0) : null,
    variant,
    bubbles: sortBubbles(content, bubbles),
  };
}

function ordinaryBuilding(
  content: GameContent,
  state: GameState,
  cityId: string,
  neighbourhoodId: string,
  id: string,
  shopShare: number,
  treeShare: number,
): StreetBuilding {
  const neighbourhood = findCity(content, cityId).neighbourhoods.find(
    (n) => n.id === neighbourhoodId,
  );
  const hash = (salt: string) => hashFloat(state.seed, `${salt}#${cityId}#${id}`);
  const apartments = neighbourhood?.sales.apartment.count ?? 1;
  const houses = neighbourhood?.sales.house.count ?? 0;
  const kind: PropertyKind = hash('kind') * (apartments + houses) < houses ? 'house' : 'apartment';
  const epoch = neighbourhood
    ? pickEpoch(neighbourhood.epochShares[kind], hash('epoch'))
    : 'before1948';
  return {
    id,
    placeId: id,
    role: 'ordinary',
    propertyId: null,
    home: false,
    kind,
    epoch,
    floors: floorsOf(content, kind, epoch, hash('floors')),
    shop: kind === 'apartment' && hash('shop') < shopShare,
    tree: hash('tree') < treeShare,
    // Ordinary buildings are kept up: state 3 to 4.5.
    facadeState: Math.round((3 + hash('state') * 1.5) * 10) / 10,
    newWindows: false,
    scaffolding: false,
    tarp: false,
    highlightFloor: null,
    variant: hash('variant'),
    bubbles: [],
  };
}

/**
 * The streets of a neighbourhood with their buildings, left to right. The
 * ordinary buildings never move; the player's properties, the listings, the
 * purchases and the rivals' renovations take the place of an ordinary building
 * drawn from their id, so a building keeps its place while it stays in the street.
 */
export function streets(
  content: GameContent,
  state: GameState,
  cityId: string,
  neighbourhoodId: string,
): StreetView[] {
  const world = content.world.cities[cityId]?.[neighbourhoodId];
  if (!world) return [];
  const moment = momentOf(content, state.clock.hour);
  const weather = weatherOn(content, state.seed, cityId, toDayNumber(state.clock.date));
  const ordinary = world.streets.map((street) =>
    Array.from({ length: street.buildings * content.world.placesPerBuilding }, (_, index) =>
      ordinaryBuilding(
        content,
        state,
        cityId,
        neighbourhoodId,
        `${street.id}.${index}`,
        world.shopShare,
        world.treeShare,
      ),
    ),
  );
  // Every place of the neighbourhood, street after street.
  const places = ordinary.flatMap((buildings, street) =>
    buildings.map((building, index) => ({ street, index, building })),
  );
  const firstPlace = ordinary.map((_, street) =>
    ordinary.slice(0, street).reduce((sum, buildings) => sum + buildings.length, 0),
  );
  // Each placed building takes the place of an ordinary building it looks like, searched
  // from a place drawn from its id (in a street drawn from its id, then the next ones), so
  // nothing moves along when a listing comes or goes. The player's properties choose first,
  // so a listing never pushes them; the rare ones left without a place go to the end of
  // their street.
  const taken: (Placed | null)[] = places.map(() => null);
  const extra: Placed[][] = ordinary.map(() => []);
  for (const entry of placedProperties(state, cityId, neighbourhoodId)) {
    const id = entry.property.id;
    const street = Math.floor(hashFloat(0, `street#${id}`) * ordinary.length);
    const length = ordinary[street]?.length ?? 0;
    const wanted = (firstPlace[street] ?? 0) + Math.floor(hashFloat(0, `position#${id}`) * length);
    let found = -1;
    for (const fits of FITS) {
      for (let step = 0; step < places.length && found < 0; step++) {
        const candidate = (wanted + step) % places.length;
        const place = places[candidate];
        if (taken[candidate] === null && place && fits(place.building, entry.property)) {
          found = candidate;
        }
      }
      if (found >= 0) break;
    }
    if (found >= 0) taken[found] = entry;
    else extra[street]?.push(entry);
  }
  const placeOf = (entry: Placed, slot: StreetBuilding | null) => {
    const id = entry.property.id;
    return placedBuilding(content, state, entry, {
      slot,
      placeId: slot?.placeId ?? id,
      shop: hashFloat(state.seed, `shop#${id}`) < world.shopShare,
      tree: hashFloat(state.seed, `tree#${id}`) < world.treeShare,
    });
  };
  return world.streets.map((street, streetIndex) => {
    const first = firstPlace[streetIndex] ?? 0;
    const buildings: StreetBuilding[] = [
      ...(ordinary[streetIndex] ?? []).map((building, index) => {
        const entry = taken[first + index];
        return entry ? placeOf(entry, building) : building;
      }),
      ...(extra[streetIndex] ?? []).map((entry) => placeOf(entry, null)),
    ];
    return {
      id: street.id,
      name: street.name,
      quay: street.quay,
      weather: localWeather(content, weather, moment, street.quay),
      buildings,
    };
  });
}

/** Distributes `count` units over floors, `perFloor` at most (bottom up). */
function unitsLayout(count: number, floors: number, firstFloor: number) {
  const usable = Math.max(1, floors - firstFloor);
  const perFloor = Math.ceil(count / usable);
  const layout: { floor: number; column: number; columns: number }[] = [];
  for (let i = 0; i < count; i++) {
    const floor = firstFloor + Math.floor(i / perFloor);
    const onFloor = Math.min(perFloor, count - (floor - firstFloor) * perFloor);
    layout.push({ floor, column: i % perFloor, columns: onFloor });
  }
  return layout;
}

const TIER_RANK: readonly Tier[] = ['eco', 'standard', 'premium'];

function roomsOf(property: Property, running: Map<string, Trade>, prefix: string): SectionRoom[] {
  return property.spaces
    .filter((space) => space.kind !== 'garden' && space.id.startsWith(prefix))
    .map((space) => {
      const items = property.items.filter((item) => item.spaceId === space.id);
      const state =
        items.length > 0 ? items.reduce((sum, item) => sum + item.state, 0) / items.length : 3;
      const renovating =
        items.map((item) => running.get(`${space.id}.${item.kind}`)).find((t) => t) ?? null;
      const tierMean =
        items.length > 0
          ? items.reduce((sum, item) => sum + TIER_RANK.indexOf(item.tier), 0) / items.length
          : 1;
      return {
        spaceId: space.id,
        kind: space.kind,
        surface: space.surface,
        state: Math.round(state * 10) / 10,
        renovating,
        tier: TIER_RANK[Math.round(tierMean)] ?? 'standard',
      };
    });
}

/**
 * Cross-section of a building of the street (docs/04, 4.6): its flats, or a
 * house floor by floor, with the rooms of the player's (or the listed)
 * dwelling and the artisans at work today. Null for an unknown building.
 */
export function section(
  content: GameContent,
  state: GameState,
  cityId: string,
  neighbourhoodId: string,
  buildingId: string,
): SectionView | null {
  const building = streets(content, state, cityId, neighbourhoodId)
    .flatMap((street) => street.buildings)
    .find((candidate) => candidate.id === buildingId);
  if (!building) return null;
  const placed = placedProperties(state, cityId, neighbourhoodId).find(
    (entry) => entry.property.id === buildingId,
  );
  const owned = placed?.owned ?? null;
  const running = runningTrades(owned);
  const property = placed
    ? placed.role === 'listing'
      ? believedView(content, placed.property)
      : placed.property
    : null;
  const role: SectionUnit['role'] =
    placed?.role === 'owned'
      ? 'player'
      : placed?.role === 'listing'
        ? 'listing'
        : placed?.role === 'purchase'
          ? 'purchase'
          : 'neighbour';
  const occupiedHash = (id: string) => hashFloat(state.seed, `occupied#${id}`) < 0.85;
  const playerOccupied = owned
    ? Boolean(owned.lease) || state.player.homePropertyId === owned.property.id
    : role !== 'neighbour';
  const residentOf = (mine: boolean): SectionUnit['resident'] => {
    if (!mine || !owned) return null;
    if (state.player.homePropertyId === owned.property.id) return { kind: 'player' };
    return owned.lease
      ? { kind: 'tenant', name: `${owned.lease.tenant.firstName} ${owned.lease.tenant.lastName}` }
      : null;
  };
  const dwellingWorks = [...running.entries()]
    .filter(([itemId]) => !itemId.includes('.'))
    .map(([, trade]) => trade);
  const units: SectionUnit[] = [];
  const firstFloor = building.shop ? 1 : 0;

  if (building.kind === 'house') {
    const floorsOfRooms = content.world.houseRoomFloors;
    const rooms = property ? roomsOf(property, running, '') : [];
    for (let floor = 0; floor < building.floors; floor++) {
      const top = floor === building.floors - 1;
      units.push({
        id: `${buildingId}.${floor}`,
        floor,
        column: 0,
        columns: 1,
        role,
        propertyId: property?.id ?? null,
        occupied: property ? playerOccupied : occupiedHash(buildingId),
        // The household lives on the ground floor.
        resident: floor === 0 ? residentOf(true) : null,
        // A single-storey house keeps every room on the ground floor.
        rooms: rooms.filter((room) => {
          const wanted = Math.min(floorsOfRooms[room.kind] ?? 0, building.floors - 1);
          return wanted === floor || (top && wanted > floor);
        }),
        works: floor === 0 ? dwellingWorks : [],
      });
    }
  } else if (building.kind === 'building' && property) {
    const layout = unitsLayout(property.lots.length, building.floors, firstFloor);
    property.lots.forEach((_, i) => {
      const place = layout[i] ?? { floor: firstFloor, column: i, columns: property.lots.length };
      const prefix = `l${i + 1}-`;
      units.push({
        id: `${buildingId}.l${i + 1}`,
        ...place,
        role,
        propertyId: property.id,
        occupied: owned ? playerOccupied || occupiedHash(`${buildingId}${prefix}`) : true,
        resident: i === 0 ? residentOf(true) : null,
        rooms: roomsOf(property, running, prefix),
        works: dwellingWorks,
      });
    });
  } else {
    const range = content.world.flatsPerFloor;
    const columns = pickInt(hashFloat(state.seed, `flats#${buildingId}`), range.min, range.max);
    const mineFloor = building.highlightFloor;
    const mineColumn = Math.floor(hashFloat(state.seed, `column#${buildingId}`) * columns);
    for (let floor = firstFloor; floor < building.floors; floor++) {
      for (let column = 0; column < columns; column++) {
        const mine = property !== null && floor === mineFloor && column === mineColumn;
        const id = `${buildingId}.${floor}.${column}`;
        units.push({
          id,
          floor,
          column,
          columns,
          role: mine ? role : 'neighbour',
          propertyId: mine ? (property?.id ?? null) : null,
          occupied: mine ? playerOccupied : occupiedHash(id),
          resident: residentOf(mine),
          rooms: mine && property ? roomsOf(property, running, '') : [],
          works: mine ? dwellingWorks : [],
        });
      }
    }
  }
  return {
    buildingId,
    role: building.role,
    kind: building.kind,
    epoch: building.epoch,
    floors: building.floors,
    garden: property
      ? property.spaces.some((space) => space.kind === 'garden')
      : building.kind === 'house',
    units,
    worksPercent: owned ? worksPercent(content, state, owned) : null,
  };
}

/** Where a building stands: its city, neighbourhood and street. */
export interface BuildingPlace {
  cityId: string;
  neighbourhoodId: string;
  streetId: string;
  building: StreetBuilding;
}

/**
 * The building of a listing, a purchase or an owned property, as drawn in its
 * street (the listing sheet shows the same façade). Null when it is unknown.
 */
export function findBuilding(
  content: GameContent,
  state: GameState,
  propertyId: string,
): BuildingPlace | null {
  const property =
    state.properties.find((owned) => owned.property.id === propertyId)?.property ??
    state.purchases.find((purchase) => purchase.property.id === propertyId)?.property ??
    state.listings.find((listing) => listing.property.id === propertyId)?.property;
  if (!property) return null;
  const { cityId, neighbourhoodId } = property;
  for (const street of streets(content, state, cityId, neighbourhoodId)) {
    const building = street.buildings.find((candidate) => candidate.propertyId === propertyId);
    if (building) return { cityId, neighbourhoodId, streetId: street.id, building };
  }
  return null;
}
