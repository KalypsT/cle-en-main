import { describe, expect, it } from 'vitest';
import { act, content, engine, newGame, sampleOwned } from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import type { GameState, Lease } from '../state.ts';
import { buyoutAskMonths, occupiedDiscount } from './buyout.ts';

const ID = 'property-sample';

/** A new game with the sample flat let bare since today, and the given lease changes. */
function letGame(lease: Partial<Lease> = {}): GameState {
  const state = newGame();
  const owned = sampleOwned(toDayNumber(state.clock.date));
  if (owned.lease) owned.lease = { ...owned.lease, ...lease };
  return { ...state, properties: [owned] };
}

function askOf(state: GameState): number {
  const owned = state.properties[0];
  if (!owned?.lease) throw new Error('let');
  const months = buyoutAskMonths(content, state, owned, owned.lease);
  if (months === null) throw new Error('no buyout');
  return Math.round(months * owned.lease.monthlyRent);
}

describe('negotiated departure', () => {
  it('asks for 2 to 6 months of a bare rent, less when unhappy, more for a family', () => {
    const state = letGame();
    const owned = state.properties[0];
    const lease = owned?.lease;
    if (!owned || !lease) throw new Error('let');
    const months = buyoutAskMonths(content, state, owned, lease) ?? 0;
    expect(months).toBeGreaterThanOrEqual(2);
    expect(months).toBeLessThanOrEqual(6);
    const rules = content.renting.buyout;
    expect(buyoutAskMonths(content, state, owned, { ...lease, satisfaction: 20 })).toBeCloseTo(
      months * rules.unhappyFactor,
    );
    const family = { ...lease, tenant: { ...lease.tenant, profileId: 'family' } };
    expect(buyoutAskMonths(content, state, owned, family)).toBeCloseTo(
      months * rules.attachedFactor,
    );
  });

  it('pays the tenant, costs a little reputation and frees the flat a month later', () => {
    const state = letGame();
    const ask = askOf(state);
    const { state: after, events } = act(state, {
      type: 'rent/buyout',
      propertyId: ID,
      amount: ask,
    });
    expect(events).toContainEqual({
      type: 'buyoutAnswered',
      propertyId: ID,
      amount: ask,
      accepted: true,
    });
    expect(after.player.balance).toBe(state.player.balance - ask);
    expect(after.player.reputation).toBe(
      Math.max(0, state.player.reputation - content.renting.buyout.reputationPenalty),
    );
    const today = toDayNumber(state.clock.date);
    expect(after.properties[0]?.lease?.noticeEndDay).toBe(today + 30);
    // Already leaving: no second offer.
    expect(
      engine.dispatch(after, { type: 'rent/buyout', propertyId: ID, amount: ask }),
    ).toMatchObject({ ok: false, reason: { code: 'rent.alreadyLeaving' } });
  });

  it('is refused below what the tenant hides, who then waits before listening again', () => {
    const state = letGame();
    const low = askOf(state) - 1_00;
    const { state: after, events } = act(state, {
      type: 'rent/buyout',
      propertyId: ID,
      amount: low,
    });
    expect(events.some((e) => e.type === 'buyoutAnswered' && !e.accepted)).toBe(true);
    expect(after.player.balance).toBe(state.player.balance);
    const lease = after.properties[0]?.lease;
    expect(lease?.noticeEndDay).toBeNull();
    expect(lease?.satisfaction).toBe(
      (state.properties[0]?.lease?.satisfaction ?? 0) - content.renting.buyout.refusalSatisfaction,
    );
    expect(
      engine.dispatch(after, { type: 'rent/buyout', propertyId: ID, amount: low * 2 }),
    ).toMatchObject({ ok: false, reason: { code: 'rent.buyoutTooSoon' } });
  });

  it('does not apply to a short-term let', () => {
    const state = letGame({ leaseType: 'shortTerm' });
    expect(
      engine.dispatch(state, { type: 'rent/buyout', propertyId: ID, amount: 1_000_00 }),
    ).toMatchObject({ ok: false, reason: { code: 'rent.noBuyout' } });
  });
});

describe('occupied sale', () => {
  it('takes 15 %, 10 % or 5 % off a bare let by the months left, nothing when vacant', () => {
    const state = letGame();
    const today = toDayNumber(state.clock.date);
    const owned = state.properties[0];
    const lease = owned?.lease;
    if (!owned || !lease) throw new Error('let');
    const withTerm = (days: number) => ({ ...owned, lease: { ...lease, termDay: today + days } });
    expect(occupiedDiscount(content, withTerm(3 * 365), today)).toBe(0.15);
    expect(occupiedDiscount(content, withTerm(500), today)).toBe(0.1);
    expect(occupiedDiscount(content, withTerm(100), today)).toBe(0.05);
    expect(occupiedDiscount(content, { ...owned, lease: null }, today)).toBe(0);
    expect(
      occupiedDiscount(content, { ...owned, lease: { ...lease, noticeEndDay: today + 30 } }, today),
    ).toBe(0);
    const furnished = { ...owned, lease: { ...lease, leaseType: 'furnished' as const } };
    expect(occupiedDiscount(content, furnished, today)).toBe(0.05);
    expect(engine.occupiedDiscount(state, ID)).toBe(0.15);
  });
});
