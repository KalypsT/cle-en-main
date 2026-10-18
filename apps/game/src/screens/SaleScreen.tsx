import { gameContent } from '@cle/content';
import type { OwnedProperty, SaleMode, SaleOffer } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  format,
  formatDayYear,
  formatEuros,
  formatPercent,
  formatSigned,
  formatWhen,
  propertyLabel,
  rivalName,
  t,
  tone,
} from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader, Segmented } from '../ui/components.tsx';

/** Step of price inputs, in euros (presentation only). */
const PRICE_STEP = 500;

/** « Revente » (docs/03-systemes/03, « Revendre »). */
export function SaleScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  if (!owned) {
    return (
      <div className="screen">
        <ScreenHeader title={t.sale.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader title={t.sale.heading} onBack={nav.pop} />
      <p className="strong">{propertyLabel(owned.property)}</p>
      {owned.sale?.agreement ? (
        <Card tint="teal">
          <p className="strong">
            {format(t.sale.agreed, {
              price: formatEuros(owned.sale.agreement.price),
              date: formatDayYear(owned.sale.agreement.deedDay),
            })}
          </p>
        </Card>
      ) : (
        <>
          {owned.sale && <Offers owned={owned} />}
          <SaleForm owned={owned} />
        </>
      )}
    </div>
  );
}

function SaleForm({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const estimate = engine.estimate(state, owned.property.id);
  const sale = owned.sale;
  const [mode, setMode] = useState<SaleMode>(sale?.mode ?? 'agency');
  const [price, setPrice] = useState(
    sale?.askingPrice ?? estimate?.estimate ?? owned.purchasePrice,
  );
  const proceeds = engine.saleEstimate(state, owned.property.id, price, mode);
  const share = gameContent.market.resale.agencyFeeShare;
  return (
    <Card title={sale ? t.sale.update : t.sale.list}>
      {estimate && (
        <p className="small muted">
          {format(t.sale.estimate, { amount: formatEuros(estimate.estimate) })}
        </p>
      )}
      {owned.lease && <p className="small warning">{t.sale.letHint}</p>}
      <label className="field">
        <span className="field-label">{t.sale.askingPrice}</span>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          min={0}
          step={PRICE_STEP}
          value={Math.round(price / 100)}
          onChange={(e) => setPrice(Math.max(0, Math.round(Number(e.target.value) * 100)))}
        />
      </label>
      {!sale && (
        <div className="field">
          <span className="field-label">{t.sale.mode}</span>
          <Segmented<SaleMode>
            label={t.sale.mode}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'agency', label: t.sale.agency },
              { value: 'self', label: t.sale.self },
            ]}
          />
          <span className="small muted">
            {mode === 'agency'
              ? format(t.sale.agencyHint, { share: formatPercent(share * 100) })
              : t.sale.selfHint}
          </span>
        </div>
      )}
      {proceeds && (
        <KeyValues
          rows={[
            { label: t.sale.agencyFees, value: formatSigned(-proceeds.agencyFees) },
            { label: t.sale.loanRepaid, value: formatSigned(-proceeds.loanRepaid) },
            { label: t.sale.loanFees, value: formatSigned(-proceeds.loanFees) },
            { label: t.sale.capitalGainsTax, value: formatSigned(-proceeds.capitalGainsTax) },
            { label: t.sale.deposit, value: formatSigned(-proceeds.depositTransferred) },
            {
              label: t.sale.net,
              value: formatEuros(proceeds.net),
              className: tone(proceeds.net),
              total: true,
            },
          ]}
        />
      )}
      <div className="stack">
        {sale ? (
          <>
            <button
              type="button"
              className="button primary block"
              onClick={() =>
                act({ type: 'sale/update', propertyId: owned.property.id, askingPrice: price })
              }
            >
              {t.sale.update}
            </button>
            <button
              type="button"
              className="button danger block"
              onClick={() => act({ type: 'sale/withdraw', propertyId: owned.property.id })}
            >
              {t.sale.withdraw}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button primary block"
            onClick={() =>
              act(
                { type: 'sale/list', propertyId: owned.property.id, askingPrice: price, mode },
                t.sale.listed,
              )
            }
          >
            {t.sale.list}
          </button>
        )}
      </div>
    </Card>
  );
}

function Offers({ owned }: { owned: OwnedProperty }) {
  const sale = owned.sale;
  if (!sale) return null;
  return (
    <Card title={t.sale.offers} testId="sale-offers">
      <p className="small muted">
        {format(t.sale.onSale, {
          date: formatDayYear(sale.listedDay),
          price: formatEuros(sale.askingPrice),
        })}
      </p>
      {sale.offers.length === 0 && <p className="small muted">{t.sale.noOffers}</p>}
      {sale.offers.map((offer) => (
        <OfferRow key={offer.id} owned={owned} offer={offer} />
      ))}
    </Card>
  );
}

function OfferRow({ owned, offer }: { owned: OwnedProperty; offer: SaleOffer }) {
  const { state, act } = useGame();
  const [counter, setCounter] = useState(
    Math.round((offer.amount + (owned.sale?.askingPrice ?? offer.amount)) / 2),
  );
  const propertyId = owned.property.id;
  return (
    <div className="card flat">
      <p className="strong">
        {format(t.sale.offerFrom, {
          buyer: offer.buyerId ? rivalName(offer.buyerId) : t.sale.anonymous,
          amount: formatEuros(offer.amount),
        })}
      </p>
      {offer.counterAmount !== null ? (
        <p className="small muted">
          {format(t.sale.counterPending, { amount: formatEuros(offer.counterAmount) })}
        </p>
      ) : (
        <>
          <p className="tiny muted">
            {format(t.sale.offerExpires, { when: formatWhen(offer.expiresDay, state.clock.date) })}
          </p>
          <div className="actions">
            <button
              type="button"
              className="button"
              onClick={() => act({ type: 'sale/rejectOffer', propertyId, offerId: offer.id })}
            >
              {t.sale.reject}
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => act({ type: 'sale/acceptOffer', propertyId, offerId: offer.id })}
            >
              {t.sale.accept}
            </button>
          </div>
          <label className="field">
            <span className="field-label">{t.sale.counterAmount}</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              step={PRICE_STEP}
              value={Math.round(counter / 100)}
              onChange={(e) => setCounter(Math.max(0, Math.round(Number(e.target.value) * 100)))}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() =>
              act({ type: 'sale/counterOffer', propertyId, offerId: offer.id, amount: counter })
            }
          >
            {t.sale.counter}
          </button>
        </>
      )}
    </div>
  );
}
