import { describe, expect, it } from 'vitest';
import {
  advanceUntil,
  affordableListing,
  buyWithLoan,
  content,
  engine,
  newGame,
} from '../../test/helpers.ts';
import { retainedIncome } from './banking.ts';
import { expectedSalary } from './household.ts';
import { marketRent, netRent } from './renting.ts';

function owner() {
  const start = newGame({ seed: 99 });
  const listing = affordableListing(start);
  const { state } = buyWithLoan(start, listing.id);
  return { state, propertyId: listing.property.id };
}

describe('provisional renting', () => {
  it('prices the rent from the neighbourhood rent per m² and the condition', () => {
    const state = newGame();
    const flat = state.listings.find(
      (l) => l.property.kind === 'apartment' && l.property.condition !== 'ruin',
    );
    if (!flat) throw new Error('No flat');
    const rent = marketRent(content, state, flat.property);
    const better = marketRent(content, state, { ...flat.property, condition: 'renovated' });
    expect(rent).toBeGreaterThan(flat.property.surface * 500);
    expect(rent).toBeLessThan(flat.property.surface * 2000);
    expect(better).toBeGreaterThanOrEqual(rent);
    expect(marketRent(content, state, { ...flat.property, condition: 'ruin' })).toBe(0);
    expect(engine.marketRent(state, flat.id)).toEqual({ gross: rent, net: netRent(content, rent) });
  });

  it('finds a tenant after the vacancy, pays the net rent monthly and counts it for banks', () => {
    const { state, propertyId } = owner();
    const owned = state.properties[0];
    expect(owned?.lease).toBeNull();
    if (owned?.property.condition === 'ruin') return; // cannot be let
    const let_ = advanceUntil(state, (e) => e.type === 'propertyLet', 120);
    if (let_.event.type !== 'propertyLet') throw new Error('unreachable');
    expect(let_.event.propertyId).toBe(propertyId);
    const rent = let_.event.monthlyRent;
    expect(retainedIncome(content, let_.state)).toBe(
      Math.round(
        expectedSalary(content, let_.state.player) + content.credit.retainedRentShare * rent,
      ),
    );
    const statement = advanceUntil(let_.state, (e) => e.type === 'monthlyStatement', 40);
    if (statement.event.type !== 'monthlyStatement') throw new Error('unreachable');
    expect(statement.event.lines).toContainEqual({
      kind: 'rentalIncome',
      propertyId,
      amount: netRent(content, rent),
    });
    expect(statement.state.player.rentalHistoryMonths).toBe(1);
  });

  it('lets tenants leave, then finds a new one', () => {
    const { state } = owner();
    if (state.properties[0]?.property.condition === 'ruin') return;
    const left = advanceUntil(state, (e) => e.type === 'tenantLeft', 3650);
    expect(left.state.properties[0]?.lease).toBeNull();
    const again = advanceUntil(left.state, (e) => e.type === 'propertyLet', 120);
    expect(again.state.properties[0]?.lease).not.toBeNull();
  });
});
