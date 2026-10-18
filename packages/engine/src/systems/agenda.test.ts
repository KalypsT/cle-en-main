import { describe, expect, it } from 'vitest';
import { act, advanceDays, content, engine, newGame, systemContext } from '../../test/helpers.ts';
import { visitMinutes } from './agenda.ts';
import { toDayNumber } from '../calendar.ts';

describe('visits', () => {
  it('visits now when free time allows and reveals some defects', () => {
    // The default start is a Sunday morning: 6 h of free time.
    const state = newGame();
    const listing = state.listings[0];
    if (!listing) throw new Error('No listing');
    const { state: after, events } = act(state, { type: 'market/visit', listingId: listing.id });
    expect(after.player.freeTimeMinutes).toBe(
      state.player.freeTimeMinutes - visitMinutes({ content }),
    );
    expect(after.listings.find((l) => l.id === listing.id)?.visited).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'visitDone', listingId: listing.id }),
    );
    const again = engine.dispatch(after, { type: 'market/visit', listingId: listing.id });
    expect(again.ok ? null : again.reason.code).toBe('visit.alreadyDone');
  });

  it('plans the visit on the next day with enough free time', () => {
    const ctx = systemContext(newGame());
    ctx.state.player.freeTimeMinutes = 0;
    const state = ctx.state;
    const listing = state.listings[0];
    if (!listing) throw new Error('No listing');
    const planned = act(state, { type: 'market/visit', listingId: listing.id });
    const item = planned.state.agenda[0];
    expect(item?.day).toBeGreaterThan(ctx.today);
    const twice = engine.dispatch(planned.state, { type: 'market/visit', listingId: listing.id });
    expect(twice.ok ? null : twice.reason.code).toBe('visit.alreadyPlanned');
    const days = (item?.day ?? 0) - ctx.today;
    const { state: later, events } = advanceDays(planned.state, days);
    expect(later.agenda).toEqual([]);
    const done = events.find((e) => e.type === 'visitDone' || e.type === 'visitCancelled');
    expect(done?.type).toBeDefined();
    if (done?.type === 'visitDone') {
      expect(later.listings.find((l) => l.id === listing.id)?.visited).toBe(true);
    }
  });

  it('reveals defects at about their reveal chance', () => {
    const ctx = systemContext(newGame());
    let found = 0;
    let total = 0;
    for (let i = 0; i < 400; i++) {
      const listing = ctx.state.listings[0];
      if (!listing) break;
      listing.visited = false;
      listing.property.defects = [{ id: 'humidity', revealed: false }];
      ctx.state.player.freeTimeMinutes = 600;
      const result = engine.dispatch(ctx.state, { type: 'market/visit', listingId: listing.id });
      if (!result.ok) throw new Error(result.reason.code);
      ctx.state.rng = result.state.rng;
      total++;
      if (result.state.listings[0]?.property.defects[0]?.revealed) found++;
    }
    const chance =
      content.market.defects.find((d) => d.id === 'humidity')?.revealChanceOnVisit ?? 0;
    expect(found / total).toBeGreaterThan(chance - 0.08);
    expect(found / total).toBeLessThan(chance + 0.08);
  });
});

describe('agenda: move and cancel (milestone 6)', () => {
  it('moves a planned visit to another day with free time, or cancels it', () => {
    const start = newGame();
    const tired = { ...start, player: { ...start.player, freeTimeMinutes: 0 } };
    const listing = tired.listings[0];
    if (!listing) throw new Error('No listing');
    const planned = engine.dispatch(tired, { type: 'market/visit', listingId: listing.id });
    if (!planned.ok) throw new Error(planned.reason.code);
    const item = planned.state.agenda[0];
    if (!item) throw new Error('Nothing planned');
    const today = toDayNumber(start.clock.date);
    expect(
      engine.dispatch(planned.state, { type: 'agenda/move', itemId: item.id, day: today }),
    ).toMatchObject({ ok: false, reason: { code: 'agenda.invalidDay' } });
    const moved = engine.dispatch(planned.state, {
      type: 'agenda/move',
      itemId: item.id,
      day: item.day + 1,
    });
    if (!moved.ok) throw new Error(moved.reason.code);
    expect(moved.state.agenda[0]?.day).toBe(item.day + 1);
    const week = engine.agendaWeek(moved.state);
    expect(week).toHaveLength(7);
    expect(week.find((d) => d.day === item.day + 1)?.planned).toHaveLength(1);
    const cancelled = engine.dispatch(moved.state, { type: 'agenda/cancel', itemId: item.id });
    if (!cancelled.ok) throw new Error(cancelled.reason.code);
    expect(cancelled.state.agenda).toEqual([]);
    expect(cancelled.events).toEqual([{ type: 'agendaCancelled', itemId: item.id }]);
  });
});
