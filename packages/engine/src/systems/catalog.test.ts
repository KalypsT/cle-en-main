import { describe, expect, it } from 'vitest';
import { EVENT_FAMILIES } from '@cle/content';
import { content as gameContent, newGame, quietContent, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { CatalogEvent, GameContent } from '../content.ts';
import { createEngine } from '../engine.ts';
import type { GameState } from '../state.ts';

/** A tenant event that fires every day (a monthly chance of 30). */
const paint: CatalogEvent = {
  id: 'testPaint',
  family: 'tenants',
  target: 'lease',
  kind: 'neutral',
  conditions: {},
  chancePerMonth: 30,
  cooldownDays: 10,
  pause: true,
  texts: ['{locataire} veut repeindre {bien}.'],
  choices: [
    {
      id: 'offer',
      label: 'Offrir la peinture ({montant})',
      effects: [
        { type: 'money', euros: { min: -200, max: -200 } },
        { type: 'satisfaction', delta: 10 },
        { type: 'item', item: 'walls', set: 5 },
        { type: 'freeTime', minutes: 30 },
      ],
    },
    { id: 'refuse', label: 'Refuser', effects: [{ type: 'satisfaction', delta: -5 }] },
  ],
  deadlineDays: 3,
  defaultChoice: 'refuse',
};

function setup(events: CatalogEvent[]): { content: GameContent; state: GameState } {
  const content = quietContent();
  content.events = events;
  const state = newGame({ seed: 5 });
  const owned = sampleOwned(toDayNumber(state.clock.date));
  state.properties = [owned];
  return { content, state };
}

describe('catalogue of events (docs/03-systemes/07)', () => {
  it('ships more than 100 events and some anecdotes, every family covered', () => {
    expect(gameContent.events.length).toBeGreaterThan(100);
    expect(gameContent.anecdotes.length).toBeGreaterThanOrEqual(50);
    const families = new Set(gameContent.events.map((event) => event.family));
    expect(families.size).toBe(EVENT_FAMILIES.length);
  });

  it('fires an event on a let property, then applies the chosen effects', () => {
    const { content, state } = setup([paint]);
    const engine = createEngine(content);
    const next = engine.advanceHours(state, 24);
    const started = next.events.find((e) => e.type === 'catalogEventStarted');
    if (started?.type !== 'catalogEventStarted') throw new Error('No event');
    expect(started.event).toMatchObject({
      eventId: 'testPaint',
      propertyId: 'property-sample',
      vars: { tenant: 'Camille', cityId: 'dole', neighbourhoodId: 'centreHistorique' },
      amounts: { offer: -200_00, refuse: 0 },
    });
    const decision = engine.pendingDecisions(next.state).find((d) => d.kind === 'catalogEvent');
    expect(decision).toMatchObject({ autoPause: true, deadlineDay: started.event.deadlineDay });
    const rested = { ...next.state, player: { ...next.state.player, freeTimeMinutes: 60 } };
    const tired = { ...rested, player: { ...rested.player, freeTimeMinutes: 0 } };
    expect(
      engine.dispatch(tired, {
        type: 'event/choose',
        eventId: started.event.id,
        choiceId: 'offer',
      }),
    ).toMatchObject({ ok: false, reason: { code: 'time.notEnoughFreeTime' } });
    const chosen = engine.dispatch(rested, {
      type: 'event/choose',
      eventId: started.event.id,
      choiceId: 'offer',
    });
    if (!chosen.ok) throw new Error(chosen.reason.code);
    const owned = chosen.state.properties[0];
    expect(chosen.state.player.balance).toBe(rested.player.balance - 200_00);
    expect(chosen.state.player.freeTimeMinutes).toBe(30);
    expect(owned?.lease?.satisfaction).toBe(85);
    expect(owned?.property.items.filter((i) => i.kind === 'walls').some((i) => i.state === 5)).toBe(
      true,
    );
    expect(chosen.state.catalog.pending).toEqual([]);
    expect(chosen.state.progress.counters.eventChoices).toBe(1);
    expect(
      engine.dispatch(chosen.state, {
        type: 'event/choose',
        eventId: started.event.id,
        choiceId: 'offer',
      }),
    ).toMatchObject({ ok: false, reason: { code: 'event.unknown' } });
  });

  it('tells the player when an event changes the rent', () => {
    const garden: CatalogEvent = {
      ...paint,
      id: 'testGarden',
      choices: [
        { id: 'accept', label: 'Accepter', effects: [{ type: 'rent', share: -0.05 }] },
        { id: 'refuse', label: 'Refuser', effects: [] },
      ],
    };
    const { content, state } = setup([garden]);
    const engine = createEngine(content);
    const next = engine.advanceHours(state, 24);
    const started = next.events.find((e) => e.type === 'catalogEventStarted');
    if (started?.type !== 'catalogEventStarted') throw new Error('No event');
    const before = next.state.properties[0]?.lease?.monthlyRent ?? 0;
    const chosen = engine.dispatch(next.state, {
      type: 'event/choose',
      eventId: started.event.id,
      choiceId: 'accept',
    });
    if (!chosen.ok) throw new Error(chosen.reason.code);
    const after = chosen.state.properties[0]?.lease?.monthlyRent ?? 0;
    expect(after).toBeLessThan(before);
    expect(chosen.events).toContainEqual({
      type: 'rentAdjusted',
      propertyId: 'property-sample',
      monthlyRent: after,
      previousRent: before,
    });
    expect(chosen.state.properties[0]?.log.at(-1)).toMatchObject({
      kind: 'rentRevised',
      monthlyRent: after,
    });
  });

  it('applies the default choice at the deadline and waits for the cooldown', () => {
    const { content, state } = setup([paint]);
    const engine = createEngine(content);
    const { events } = engine.advanceHours(state, 24 * 12);
    const resolved = events.filter((e) => e.type === 'catalogEventResolved');
    expect(resolved[0]).toMatchObject({ choiceId: 'refuse', auto: true });
    const started = events.filter((e) => e.type === 'catalogEventStarted');
    // One on the first day, the next one after the 10 days of cooldown.
    expect(started).toHaveLength(2);
  });

  it('applies the effects of an event without choices at once', () => {
    const rumour: CatalogEvent = {
      id: 'testRumour',
      family: 'market',
      target: 'owned',
      kind: 'neutral',
      conditions: {},
      chancePerMonth: 30,
      cooldownDays: 1000,
      pause: false,
      texts: ['Rumeur sur {quartier}.'],
      effects: [
        { type: 'priceIndex', scope: 'neighbourhood', percent: 10 },
        { type: 'reputation', delta: 3 },
      ],
    };
    const { content, state } = setup([rumour]);
    const engine = createEngine(content);
    const next = engine.advanceHours(state, 24);
    expect(next.events.some((e) => e.type === 'catalogEventHappened')).toBe(true);
    const before = state.market.cities.dole?.centreHistorique?.priceIndex ?? 0;
    const after = next.state.market.cities.dole?.centreHistorique?.priceIndex ?? 0;
    expect(after).toBeGreaterThan(before * 1.09);
    expect(next.state.player.reputation).toBeGreaterThanOrEqual(state.player.reputation + 3);
  });

  it('respects the conditions on the target', () => {
    const { content, state } = setup([{ ...paint, conditions: { dpe: ['G'] } }]);
    const engine = createEngine(content);
    const { events } = engine.advanceHours(state, 24 * 5);
    expect(events.some((e) => e.type === 'catalogEventStarted')).toBe(false);
  });

  it('tells anecdotes now and then, kept for the street', () => {
    const content = quietContent();
    content.rhythm.events.anecdoteChancePerDay = 1;
    const engine = createEngine(content);
    const { state, events } = engine.advanceHours(newGame({ seed: 8 }), 24 * 10);
    expect(events.filter((e) => e.type === 'anecdote').length).toBeGreaterThanOrEqual(9);
    expect(state.catalog.anecdotes).toHaveLength(content.rhythm.events.anecdotesKept);
    expect(state.progress.counters.anecdotes).toBeGreaterThanOrEqual(9);
  });

  it('runs the real catalogue for years without breaking the state', () => {
    const engine = createEngine(gameContent);
    const { state } = engine.advanceHours(newGame({ seed: 3 }), 24 * 365 * 2);
    expect(engine.loadGame(JSON.stringify(state))).toEqual(state);
  }, 60_000);
});
