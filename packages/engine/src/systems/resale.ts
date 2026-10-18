import type { Cents } from '../money.ts';
import { toCents } from '../money.ts';
import { nextFloat, nextRange } from '../random.ts';
import type { OwnedProperty, SaleMode } from '../state.ts';
import { refinancingFees } from './banking.ts';
import type { SystemContext } from './context.ts';
import { realValue } from './valuation.ts';

export type SaleRefusal =
  | 'property.unknown'
  | 'sale.alreadyListed'
  | 'sale.notListed'
  | 'sale.agreed'
  | 'sale.invalidPrice'
  | 'sale.unknownOffer'
  | 'sale.counterPending'
  | 'sale.invalidCounter';

function findOwned(ctx: SystemContext, propertyId: string): OwnedProperty | undefined {
  return ctx.state.properties.find((owned) => owned.property.id === propertyId);
}

function validPrice(amount: Cents): boolean {
  return Number.isInteger(amount) && amount > 0;
}

export function listForSale(
  ctx: SystemContext,
  propertyId: string,
  askingPrice: Cents,
  mode: SaleMode,
): SaleRefusal | null {
  const owned = findOwned(ctx, propertyId);
  if (!owned) return 'property.unknown';
  if (owned.sale) return 'sale.alreadyListed';
  if (!validPrice(askingPrice)) return 'sale.invalidPrice';
  owned.sale = { askingPrice, mode, listedDay: ctx.today, offers: [], agreement: null };
  ctx.events.push({ type: 'saleListed', propertyId, askingPrice, mode });
  return null;
}

/** Changes the asking price or takes the property off the market (`null`). */
export function updateSale(
  ctx: SystemContext,
  propertyId: string,
  askingPrice: Cents | null,
): SaleRefusal | null {
  const owned = findOwned(ctx, propertyId);
  if (!owned) return 'property.unknown';
  if (!owned.sale) return 'sale.notListed';
  if (owned.sale.agreement) return 'sale.agreed';
  if (askingPrice === null) {
    owned.sale = null;
    ctx.events.push({ type: 'saleWithdrawn', propertyId });
    return null;
  }
  if (!validPrice(askingPrice)) return 'sale.invalidPrice';
  owned.sale.askingPrice = askingPrice;
  return null;
}

export function answerSaleOffer(
  ctx: SystemContext,
  propertyId: string,
  offerId: string,
  answer: { type: 'accept' } | { type: 'reject' } | { type: 'counter'; amount: Cents },
): SaleRefusal | null {
  const owned = findOwned(ctx, propertyId);
  if (!owned) return 'property.unknown';
  const sale = owned.sale;
  if (!sale) return 'sale.notListed';
  if (sale.agreement) return 'sale.agreed';
  const offer = sale.offers.find((o) => o.id === offerId);
  if (!offer) return 'sale.unknownOffer';
  if (offer.counterAmount !== null) return 'sale.counterPending';
  if (answer.type === 'reject') {
    sale.offers = sale.offers.filter((o) => o.id !== offerId);
    return null;
  }
  if (answer.type === 'counter') {
    if (!validPrice(answer.amount) || answer.amount <= offer.amount) return 'sale.invalidCounter';
    offer.counterAmount = answer.amount;
    return null;
  }
  agree(ctx, propertyId, owned, offer.amount);
  return null;
}

function agree(ctx: SystemContext, propertyId: string, owned: OwnedProperty, price: Cents) {
  const sale = owned.sale;
  if (!sale) return;
  sale.offers = [];
  sale.agreement = { price, deedDay: ctx.today + ctx.content.market.resale.deedDelayDays };
  ctx.events.push({ type: 'saleAgreed', propertyId, price, deedDay: sale.agreement.deedDay });
}

/** Net proceeds of a sale: agency fees and the property's loans (with their fees) deducted. */
export function saleProceeds(ctx: SystemContext, owned: OwnedProperty, price: Cents) {
  const agencyFees =
    owned.sale?.mode === 'agency'
      ? Math.round(price * ctx.content.market.resale.agencyFeeShare)
      : 0;
  const loans = ctx.state.loans.filter((loan) => loan.propertyId === owned.property.id);
  const loanRepaid = loans.reduce((sum, loan) => sum + loan.remaining, 0);
  const loanFees = loans.reduce((sum, loan) => sum + refinancingFees(ctx.content, loan), 0);
  return { agencyFees, loanRepaid, loanFees, net: price - agencyFees - loanRepaid - loanFees };
}

function closeSale(ctx: SystemContext, owned: OwnedProperty, price: Cents) {
  const { state } = ctx;
  const proceeds = saleProceeds(ctx, owned, price);
  state.player.balance += proceeds.net;
  state.loans = state.loans.filter((loan) => loan.propertyId !== owned.property.id);
  state.properties = state.properties.filter((p) => p.property.id !== owned.property.id);
  ctx.events.push({ type: 'propertySold', propertyId: owned.property.id, price, ...proceeds });
}

/** Visits, buyer offers and their expiry, counter-offer answers and deeds. */
export function runDailyResale(ctx: SystemContext): void {
  const { content, state } = ctx;
  const rules = content.market.resale;
  for (const owned of [...state.properties]) {
    const sale = owned.sale;
    if (!sale) continue;
    const propertyId = owned.property.id;
    if (sale.agreement) {
      if (ctx.today < sale.agreement.deedDay) continue;
      if (nextFloat(state.rng) < rules.buyerWithdrawalChance) {
        sale.agreement = null;
        ctx.events.push({ type: 'saleFellThrough', propertyId });
        continue;
      }
      closeSale(ctx, owned, sale.agreement.price);
      continue;
    }

    // Answers to the player's counter-offers, then expired offers.
    let agreed = false;
    for (const offer of [...sale.offers]) {
      if (offer.counterAmount === null) continue;
      if (offer.counterAmount <= offer.buyerMax) {
        ctx.events.push({ type: 'saleCounterAccepted', propertyId, offerId: offer.id });
        agree(ctx, propertyId, owned, offer.counterAmount);
        agreed = true;
        break;
      }
      sale.offers = sale.offers.filter((o) => o.id !== offer.id);
      ctx.events.push({ type: 'saleCounterRefused', propertyId, offerId: offer.id });
    }
    if (agreed) continue;
    const expired = sale.offers.filter((o) => o.expiresDay <= ctx.today);
    sale.offers = sale.offers.filter((o) => o.expiresDay > ctx.today);
    for (const offer of expired)
      ctx.events.push({ type: 'saleOfferExpired', propertyId, offerId: offer.id });

    // A visit: the agency handles it, otherwise it costs the player free time.
    const value = realValue(content, state, owned.property).value;
    const overpricing = Math.max(0, sale.askingPrice / value - 1);
    const chance =
      rules.dailyVisitProbability *
      (sale.mode === 'agency' ? rules.agencyVisitMultiplier : 1) *
      Math.exp(-rules.priceSensitivity * overpricing);
    if (nextFloat(state.rng) >= Math.min(1, chance)) continue;
    if (sale.mode === 'self') {
      if (state.player.freeTimeMinutes < rules.selfVisitMinutes) {
        ctx.events.push({ type: 'saleVisitMissed', propertyId });
        continue;
      }
      state.player.freeTimeMinutes -= rules.selfVisitMinutes;
    }
    ctx.events.push({ type: 'saleVisit', propertyId });
    if (nextFloat(state.rng) >= rules.offerAfterVisit) continue;
    const step = toCents(content.market.pricing.rounding) / 2;
    const raw = Math.min(
      sale.askingPrice * nextRange(state.rng, rules.offerShare.min, rules.offerShare.max),
      value * rules.maxShareOfValue,
    );
    const amount = Math.max(step, Math.floor(raw / step) * step);
    const offer = {
      id: `offer-${state.nextId++}`,
      amount,
      buyerMax: Math.min(sale.askingPrice, Math.round(amount * (1 + rules.buyerFlexibility))),
      expiresDay: ctx.today + rules.offerValidityDays,
      counterAmount: null,
    };
    sale.offers.push(offer);
    ctx.events.push({ type: 'saleOfferReceived', propertyId, offerId: offer.id, amount });
  }
}
