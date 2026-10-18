import { gameContent } from '@cle/content';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { cityName, format, formatPercent, t, tradeName } from '../texts.ts';
import { Badge, Card, ScreenHeader } from '../ui/components.tsx';

/** « Carnet » (docs/04): artisans, agencies, bankers, accountant, rivals. */
export function ContactsScreen() {
  const { state } = useGame();
  const nav = useNav();
  const cityId = gameContent.start.cityId;
  const artisans = engine.artisans(state, cityId);
  const locked = gameContent.artisans.filter(
    (artisan) =>
      artisan.cities.includes(cityId) && !artisans.some((entry) => entry.artisan.id === artisan.id),
  ).length;
  const priceText = (factor: number) =>
    factor < 0.97
      ? t.contacts.priceCheap
      : factor > 1.03
        ? t.contacts.priceExpensive
        : t.contacts.priceAverage;

  return (
    <div className="screen">
      <ScreenHeader title={t.contacts.heading} onBack={nav.pop} />
      <Card title={t.contacts.artisans}>
        {artisans.map(({ artisan, jobs, discount }) => (
          <div key={artisan.id} className="stack tight works-item">
            <div className="row between">
              <span className="strong">{artisan.name}</span>
              <Badge>{tradeName(artisan.trade)}</Badge>
            </div>
            <span className="small muted">{artisan.personality}</span>
            <span className="tiny">
              {priceText(artisan.priceFactor)}
              {jobs > 0 &&
                ` · ${format(t.works.loyalty, { jobs, discount: formatPercent(discount * 100) })}`}
            </span>
          </div>
        ))}
        {locked > 0 && (
          <p className="small muted">
            {format(t.contacts.lockedArtisans, { count: locked, city: cityName(cityId) })}
          </p>
        )}
      </Card>
      <Card title={t.contacts.agencies}>
        {gameContent.renting.agencies.map((agency) => (
          <div key={agency.id} className="stack tight works-item">
            <span className="strong">{agency.name}</span>
            <span className="small muted">
              {format(t.contacts.agencyFee, {
                fee: formatPercent(agency.feeShare * 100),
                days: agency.selectionDays,
              })}
            </span>
          </div>
        ))}
      </Card>
      <Card title={t.contacts.bankers}>
        {gameContent.banks.map((bank) => (
          <div key={bank.id} className="stack tight works-item">
            <span className="strong">
              {bank.banker.name} · {bank.name}
            </span>
            <span className="small muted">{bank.banker.description}</span>
            <span className="tiny">
              {format(t.bank.trust, { trust: Math.round(state.banks[bank.id]?.trust ?? 0) })}
            </span>
          </div>
        ))}
      </Card>
      <Card title={t.contacts.accountant}>
        <p className="small">{t.contacts.accountantText}</p>
      </Card>
      <Card title={t.contacts.rivals}>
        {gameContent.rivals.map((rival) => (
          <div key={rival.id} className="stack tight works-item">
            <div className="row between">
              <span className="strong">{rival.name}</span>
              {!rival.active && <Badge>{t.contacts.inactive}</Badge>}
            </div>
            <span className="small muted">{rival.personality}</span>
            <span className="small">{rival.strategy}</span>
            {rival.active && (
              <span className="tiny">
                {format(t.contacts.rivalPurchases, {
                  count: state.rivals[rival.id]?.purchases ?? 0,
                })}
              </span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
