import { gameContent } from '@cle/content';
import type { OwnedProperty, SaleMode, SaleOffer } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  format,
  formatDayLong,
  formatDecimal,
  formatDuration,
  formatEuros,
  formatPercent,
  propertyLabel,
  rivalName,
  t,
} from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader, Segmented } from '../ui/components.tsx';

const PRICE_STEP = 500_00;
const MODES: readonly SaleMode[] = ['agency', 'self'];

const roundPrice = (amount: number) =>
  Math.max(PRICE_STEP, Math.round(amount / PRICE_STEP) * PRICE_STEP);

/**
 * « Vendre le bien » (docs/03-systemes/03, « La revente »): price, agency or oneself, what
 * would be left after the loan and the tax; then the offers to accept, refuse or counter.
 */
export function SaleScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((o) => o.property.id === id);
  return (
    <div className="screen">
      <ScreenHeader title={t.sale.heading} onBack={nav.pop} />
      {!owned ? (
        <Empty icon="info">{t.listing.gone}</Empty>
      ) : (
        <>
          <p className="small muted">{propertyLabel(owned.property)}</p>
          {owned.sale?.agreement ? (
            <Card>
              <p className="small">
                {format(t.sale.agreed, {
                  amount: formatEuros(owned.sale.agreement.price),
                  date: formatDayLong(owned.sale.agreement.deedDay),
                })}
              </p>
            </Card>
          ) : (
            <>
              <PriceCard owned={owned} />
              {owned.sale && <Offers owned={owned} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function PriceCard({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const propertyId = owned.property.id;
  const sale = owned.sale;
  const estimate = engine.estimate(state, propertyId)?.estimate ?? owned.purchasePrice;
  const [price, setPrice] = useState(() => sale?.askingPrice ?? roundPrice(estimate));
  const [mode, setMode] = useState<SaleMode>(sale?.mode ?? 'agency');
  const rules = gameContent.market.resale;
  const proceeds = engine.saleProceeds(state, propertyId, price, sale?.mode ?? mode);
  const min = roundPrice(estimate * 0.6);
  const max = roundPrice(estimate * 1.4);
  return (
    <Card title={t.sale.price}>
      <p className="small muted">{format(t.sale.estimate, { amount: formatEuros(estimate) })}</p>
      <label className="field">
        <span className="field-label">{t.sale.price}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={500}
          value={Math.round(price / 100)}
          data-testid="sale-price"
          onChange={(e) => setPrice(Math.max(0, Math.round(Number(e.target.value) * 100)))}
        />
        <input
          className="range"
          type="range"
          min={min}
          max={max}
          step={PRICE_STEP}
          value={Math.min(max, Math.max(min, price))}
          onChange={(e) => setPrice(Number(e.target.value))}
          aria-label={t.sale.price}
        />
      </label>
      <p className="small muted">
        {format(t.sale.ofEstimate, { value: formatDecimal((price / estimate) * 100) })}
      </p>
      {!sale && (
        <>
          <Segmented<SaleMode>
            label={t.sale.mode}
            options={MODES.map((value) => ({ value, label: t.sale.modes[value] }))}
            value={mode}
            onChange={setMode}
          />
          <p className="small muted">
            {format(t.sale.modeHints[mode], {
              share: formatPercent(rules.agencyFeeShare * 100),
              duration: formatDuration(rules.selfVisitMinutes),
            })}
          </p>
        </>
      )}
      {proceeds && (
        <>
          <span className="small strong">{t.sale.proceeds}</span>
          <KeyValues
            rows={[
              { label: t.sale.agencyFees, value: formatEuros(-proceeds.agencyFees) },
              { label: t.sale.loanRepaid, value: formatEuros(-proceeds.loanRepaid) },
              { label: t.sale.loanFees, value: formatEuros(-proceeds.loanFees) },
              { label: t.sale.capitalGainsTax, value: formatEuros(-proceeds.capitalGainsTax) },
              ...(proceeds.depositTransferred > 0
                ? [
                    {
                      label: t.sale.depositTransferred,
                      value: formatEuros(-proceeds.depositTransferred),
                    },
                  ]
                : []),
              { label: t.sale.net, value: formatEuros(proceeds.net), total: true },
            ]}
          />
        </>
      )}
      {owned.lease && <p className="small muted">{t.sale.tenant}</p>}
      {sale ? (
        <>
          <p className="small">
            {format(t.sale.listed, {
              date: formatDayLong(sale.listedDay),
              amount: formatEuros(sale.askingPrice),
            })}
          </p>
          <button
            type="button"
            className="button primary block"
            disabled={price === sale.askingPrice}
            onClick={() => act({ type: 'sale/update', propertyId, askingPrice: price })}
          >
            {t.sale.update}
          </button>
          <button
            type="button"
            className="button block"
            onClick={() => act({ type: 'sale/withdraw', propertyId })}
          >
            {t.sale.withdraw}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="button primary block"
          onClick={() => act({ type: 'sale/list', propertyId, askingPrice: price, mode })}
        >
          {t.sale.list}
        </button>
      )}
    </Card>
  );
}

function Offers({ owned }: { owned: OwnedProperty }) {
  const offers = owned.sale?.offers ?? [];
  return (
    <Card title={t.sale.offers} testId="sale-offers">
      {offers.length === 0 ? (
        <p className="small muted">{t.sale.noOffer}</p>
      ) : (
        <ul className="stack">
          {offers.map((offer) => (
            <OfferRow key={offer.id} propertyId={owned.property.id} offer={offer} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function OfferRow({ propertyId, offer }: { propertyId: string; offer: SaleOffer }) {
  const { act } = useGame();
  const [counter, setCounter] = useState(() => roundPrice(offer.amount * 1.03));
  return (
    <li className="stack tight">
      <span className="strong">
        {format(t.sale.offer, {
          buyer: offer.buyerId ? rivalName(offer.buyerId) : t.sale.household,
          amount: formatEuros(offer.amount),
        })}
      </span>
      <span className="tiny muted">
        {format(t.sale.offerExpires, { date: formatDayLong(offer.expiresDay) })}
      </span>
      {offer.counterAmount !== null ? (
        <p className="small muted">
          {format(t.sale.counterPending, { amount: formatEuros(offer.counterAmount) })}
        </p>
      ) : (
        <>
          <div className="row wrap">
            <button
              type="button"
              className="button primary small"
              onClick={() => act({ type: 'sale/acceptOffer', propertyId, offerId: offer.id })}
            >
              {t.sale.accept}
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => act({ type: 'sale/rejectOffer', propertyId, offerId: offer.id })}
            >
              {t.sale.reject}
            </button>
          </div>
          <label className="field">
            <span className="field-label">{t.sale.counterAmount}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={Math.round(counter / 100)}
              onChange={(e) => setCounter(Math.max(0, Math.round(Number(e.target.value) * 100)))}
            />
          </label>
          <button
            type="button"
            className="button block"
            onClick={() =>
              act({ type: 'sale/counterOffer', propertyId, offerId: offer.id, amount: counter })
            }
          >
            {t.sale.counter}
          </button>
        </>
      )}
    </li>
  );
}
