import { describe, expect, it } from 'vitest';
import {
  affordableListing,
  buyWithLoan,
  content,
  newGame,
  quietContent,
  sampleOwned,
  systemContext,
} from '../../test/helpers.ts';
import { toDayNumber } from '../calendar.ts';
import { createEngine } from '../engine.ts';
import type { GameState } from '../state.ts';
import { checkMilestones, recordProgress, runYearlyProgress, statValue } from './progress.ts';
import { changeReputation, progressMarginPercent } from './reputation.ts';

describe('progression (docs/02, sections 2.8 to 2.10)', () => {
  it('starts as a Locataire ambitieux, with a chronicle', () => {
    const state = newGame();
    expect(state.progress.titles.map((t) => t.id)).toEqual(['ambitiousTenant']);
    expect(state.chronicle).toEqual([
      { day: toDayNumber(state.clock.date), kind: 'start', ref: null, amount: null },
    ]);
  });

  it('suggests the title to go for next, the closest to done first', () => {
    const engine = createEngine(content);
    // At the start: only the first step is within reach, with no progress.
    const start = newGame({ seed: 99 });
    const [first, ...others] = engine.nextGoals(start);
    expect(first).toMatchObject({ titleId: 'firstInvestor', share: 0 });
    expect(first?.conditions).toEqual([
      { stat: 'purchases', key: null, current: 0, target: 1, share: 0 },
    ]);
    expect(others).toEqual([]);

    // After a purchase: the two branches, Bailleur and Rénovateur, both at zero.
    const { state } = buyWithLoan(start, affordableListing(start).id);
    const goals = engine.nextGoals(state);
    expect(goals.map((goal) => goal.titleId).sort()).toEqual(['landlord', 'renovator']);
    // A title already held is never suggested again.
    expect(goals.some((goal) => goal.titleId === 'firstInvestor')).toBe(false);

    // Progress on one branch puts it first: one counted work out of the three asked.
    const worked: GameState = {
      ...state,
      progress: {
        ...state.progress,
        counters: { ...state.progress.counters, bigWorksDone: 1 },
      },
    };
    const [leader] = engine.nextGoals(worked);
    expect(leader?.titleId).toBe('renovator');
    expect(leader?.share).toBeCloseTo(1 / 3, 5);
    expect(leader?.conditions[0]).toMatchObject({ current: 1, target: 3 });
  });

  it('earns Primo-investisseur, an achievement and reputation with the first deed', () => {
    const start = newGame({ seed: 99 });
    const { state, event } = buyWithLoan(start, affordableListing(start).id);
    expect(event.type).toBe('deedSigned');
    expect(state.progress.counters.purchases).toBe(1);
    expect(state.progress.titles.map((t) => t.id)).toContain('firstInvestor');
    expect(state.progress.achievements.map((a) => a.id)).toContain('firstStone');
    expect(state.player.reputation).toBeGreaterThanOrEqual(
      start.player.reputation + content.progression.reputation.purchase,
    );
    const kinds = state.chronicle.map((entry) => entry.kind);
    expect(kinds).toEqual(expect.arrayContaining(['firstPurchase', 'title', 'achievement']));
    // The title lowers every bank's margin.
    expect(progressMarginPercent(content, state)).toBeLessThan(0);
  });

  it('needs the previous step for a title: Bailleur after Primo-investisseur', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    state.properties = [0, 1, 2].map((i) => {
      const owned = sampleOwned(today);
      return { ...owned, property: { ...owned.property, id: `p${i}` } };
    });
    const ctx = systemContext(state);
    checkMilestones(ctx);
    // No deed recorded, so no Primo-investisseur, so no Bailleur.
    expect(ctx.state.progress.titles.map((t) => t.id)).toEqual(['ambitiousTenant']);
    ctx.state.progress.counters.purchases = 3;
    checkMilestones(ctx);
    // Three debt-free flats in Dole are worth 250 k€ net, but Investisseur aguerri
    // also asks for properties in two cities.
    expect(ctx.state.progress.titles.map((t) => t.id)).toEqual([
      'ambitiousTenant',
      'firstInvestor',
      'landlord',
    ]);
    expect(ctx.events.filter((e) => e.type === 'titleEarned')).toHaveLength(2);
    const dijon = ctx.state.properties[2];
    if (!dijon) throw new Error('No third property');
    dijon.property = { ...dijon.property, cityId: 'dijon' };
    checkMilestones(ctx);
    expect(ctx.state.progress.titles.map((t) => t.id)).toContain('seasonedInvestor');
    expect(ctx.state.progress.achievements.map((a) => a.id)).toContain('thousandAMonth');
    // Magnat follows Investisseur aguerri too: no transformation needed (milestone 8).
    expect(ctx.state.progress.titles.map((t) => t.id)).not.toContain('magnate');
    ctx.state.player.balance += 1_000_000_00;
    checkMilestones(ctx);
    expect(ctx.state.progress.titles.map((t) => t.id)).toContain('magnate');
    expect(ctx.state.progress.titles.map((t) => t.id)).not.toContain('developer');
  });

  it('counts works, DPE classes, rivals beaten and sales with a gain', () => {
    const state = newGame();
    const ctx = systemContext(state);
    recordProgress(ctx, [
      { type: 'worksCompleted', propertyId: 'x', cost: 12_000_00, dpeBefore: 'G', dpeAfter: 'B' },
      {
        type: 'propertySold',
        propertyId: 'x',
        cityId: 'dole',
        price: 100_000_00,
        agencyFees: 0,
        loanRepaid: 0,
        loanFees: 0,
        capitalGainsTax: 0,
        depositTransferred: 0,
        net: 100_000_00,
        gain: 8_000_00,
      },
    ]);
    const counters = ctx.state.progress.counters;
    expect(counters).toMatchObject({
      worksDone: 1,
      bigWorksDone: 1,
      dpeClassesGained: 5,
      dpeGToB: 1,
      passoiresFixed: 1,
      sales: 1,
      salesWithGain: 1,
    });
    expect(ctx.state.progress.records).toMatchObject({
      bestCapitalGain: 8_000_00,
      biggestWorks: 12_000_00,
    });
    const gains = content.progression.reputation;
    expect(ctx.state.player.reputation).toBe(
      state.player.reputation + gains.worksDone + 5 * gains.dpeClassGained + gains.saleWithGain,
    );
  });

  it('makes the last reputation points hard to earn and lets a high reputation erode', () => {
    const rules = content.progression.reputation;
    const ctx = systemContext(newGame());
    ctx.state.player.reputation = 50;
    changeReputation(ctx, 3);
    expect(ctx.state.player.reputation).toBe(53);
    // At 85, a gain of 3 is worth (100 − 85) / 30 of it.
    ctx.state.player.reputation = 85;
    changeReputation(ctx, 3);
    expect(ctx.state.player.reputation).toBe(
      85 + Math.round(((3 * 15) / rules.diminishingSpan) * 10) / 10,
    );
    // Losses are never scaled.
    changeReputation(ctx, -4);
    expect(ctx.state.player.reputation).toBeCloseTo(82.5, 5);
    // Yearly: above 80, a little fame fades, never below 80.
    ctx.state.player.reputation = 95;
    runYearlyProgress(ctx);
    expect(ctx.state.player.reputation).toBe(95 - rules.erosionPerYear);
    ctx.state.player.reputation = 81;
    runYearlyProgress(ctx);
    expect(ctx.state.player.reputation).toBe(rules.erosionAbove);
  });

  it('rewards a quiet year and punishes indecent lets at the yearly review', () => {
    const state = newGame();
    const today = toDayNumber(state.clock.date);
    state.properties = [sampleOwned(today)];
    const ctx = systemContext(state);
    runYearlyProgress(ctx);
    const gains = content.progression.reputation;
    expect(ctx.state.progress.counters.quietYears).toBe(1);
    expect(ctx.state.player.reputation).toBe(
      state.player.reputation + gains.happyTenant + gains.quietYear,
    );
    const broken = sampleOwned(today);
    broken.property.items = broken.property.items.map((item) =>
      item.kind === 'electricity' ? { ...item, state: 1 } : item,
    );
    const bad = systemContext({ ...state, properties: [broken] });
    runYearlyProgress(bad);
    expect(bad.state.progress.counters.quietYears).toBeUndefined();
    expect(bad.state.player.reputation).toBe(state.player.reputation + gains.indecentLet);
  });

  it('reads stats from the state', () => {
    const state: GameState = newGame();
    expect(statValue(content, state, 'netWorth')).toBe(content.start.savings);
    expect(statValue(content, state, 'bankTrust', 'tirelire')).toBe(state.banks.tirelire?.trust);
    expect(statValue(content, state, 'yearsPlayed')).toBe(0);
  });

  it('builds the yearly review with Yvon on the 1st of January', () => {
    const engine = createEngine(quietContent());
    const start = engine.createGame({
      seed: 4,
      startDate: { year: 2026, month: 12, day: 30 },
      startHour: 8,
    });
    const { state } = engine.advanceHours(start, 48);
    const review = state.lastYearReview;
    expect(review?.year).toBe(2026);
    expect(review?.advice.map((a) => a.kind)).toEqual(expect.arrayContaining(['noProperty']));
    expect(review?.advice.length).toBeLessThanOrEqual(content.yvon.maxAdvice);
    const monthly = engine.monthlyReview(state);
    expect(monthly?.groups.length).toBeGreaterThan(0);
    expect(monthly?.net).toBe(monthly?.groups.reduce((sum, group) => sum + group.amount, 0));
  });

  it('names the let property that costs money each month at the yearly review', () => {
    const engine = createEngine(quietContent());
    const start = engine.createGame({
      seed: 4,
      startDate: { year: 2026, month: 12, day: 30 },
      startHour: 8,
    });
    // A property tax of 12 000 € a year: about 1 000 € a month against a rent of 520 €.
    const owned = sampleOwned(0, { property: { annualPropertyTax: 12_000_00 } });
    const net = engine.cashFlow({ ...start, properties: [owned] }, owned.property.id)?.net ?? 0;
    expect(net).toBeLessThan(-content.yvon.thresholds.cashFlowEuros * 100);
    const { state } = engine.advanceHours(
      { ...start, properties: [owned], player: { ...start.player, balance: 50_000_00 } },
      48,
    );
    const advice = state.lastYearReview?.advice.find((a) => a.kind === 'negativeCashFlow');
    expect(advice).toEqual({
      kind: 'negativeCashFlow',
      propertyId: owned.property.id,
      amount: expect.any(Number),
    });
    expect(advice?.amount).toBeGreaterThan(0);
  });
});
