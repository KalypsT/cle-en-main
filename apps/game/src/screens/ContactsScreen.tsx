import { gameContent } from '@cle/content';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  bankName,
  cityName,
  format,
  formatDecimal,
  formatEuros,
  formatPercent,
  rivalName,
  t,
  tradeName,
} from '../texts.ts';
import { Card, ListRow, ScreenHeader, SectionTitle } from '../ui/components.tsx';

/**
 * « Carnet » (docs/04, 4.4): the artisans city by city, the agencies, the bankers, the
 * accountant and the rivals, with what the player did with each.
 */
export function ContactsScreen() {
  const { state } = useGame();
  const nav = useNav();
  const texts = t.contacts;
  const book = engine.artisanBook(state);
  const managed = (agencyId: string) =>
    state.properties.filter((owned) => (owned.lease ?? owned.rental)?.agencyId === agencyId).length;
  const fees = state.tax.lastAssessment?.accountantFees ?? 0;
  return (
    <div className="screen" data-testid="contacts">
      <ScreenHeader title={texts.heading} onBack={nav.pop} />

      <SectionTitle title={texts.artisans} />
      {book.map((city) => (
        <Card
          key={city.cityId}
          title={format(texts.artisansIn, { city: cityName(city.cityId), count: city.worksDone })}
          testId={`contacts-artisans-${city.cityId}`}
        >
          {city.artisans.length === 0 && <p className="small muted">{texts.noArtisan}</p>}
          <ul className="stack">
            {city.artisans.map(({ artisan, jobs, discount }) => (
              <li key={artisan.id} className="stack tight">
                <span className="strong small">{artisan.name}</span>
                <span className="tiny muted">
                  {format(texts.artisanLine, {
                    trade: tradeName(artisan.trade),
                    factor: formatDecimal(artisan.priceFactor),
                    reliability: formatPercent(artisan.reliability * 100),
                    jobs,
                  })}
                </span>
                <span className="tiny muted">{artisan.personality}</span>
                {discount > 0 && (
                  <span className="tiny">
                    {format(texts.discount, { discount: formatPercent(discount * 100) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="tiny muted">
            {city.worksToNext === null
              ? texts.allArtisans
              : format(texts.nextArtisans, { count: city.worksToNext })}
          </p>
        </Card>
      ))}

      <SectionTitle title={texts.agencies} />
      <Card testId="contacts-agencies">
        <ul className="stack">
          {gameContent.renting.agencies.map((agency) => (
            <li key={agency.id} className="stack tight">
              <span className="strong small">{agency.name}</span>
              <span className="tiny muted">{agency.character}</span>
              <span className="tiny">
                {format(texts.agencyLine, {
                  fee: formatPercent(agency.feeShare * 100),
                  count: managed(agency.id),
                })}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <SectionTitle title={texts.bankers} />
      <div className="list">
        {gameContent.banks.map((bank) => (
          <ListRow
            key={bank.id}
            icon="bank"
            title={bank.banker.name}
            subtitle={format(texts.bankerLine, {
              bank: bankName(bank.id),
              trust: Math.round(state.banks[bank.id]?.trust ?? 0),
            })}
            onClick={() => nav.push({ name: 'banker', id: bank.id })}
          />
        ))}
      </div>

      <SectionTitle title={texts.accountant} />
      <Card>
        <p className="small">{texts.accountantLine}</p>
        <p className="tiny muted">
          {fees > 0
            ? format(texts.accountantFees, { amount: formatEuros(fees) })
            : texts.accountantNone}
        </p>
      </Card>

      <SectionTitle title={texts.rivals} />
      <Card testId="contacts-rivals">
        <ul className="stack">
          {engine.rivalSheets(state).map((sheet) => {
            const rival = gameContent.rivals.find((candidate) => candidate.id === sheet.rivalId);
            return (
              <li key={sheet.rivalId} className="stack tight">
                <span className="strong small">{rivalName(sheet.rivalId)}</span>
                {rival && <span className="tiny muted">{rival.strategy}</span>}
                {rival && <span className="tiny muted">{rival.personality}</span>}
                <span className="tiny">
                  {format(texts.rivalLine, { purchases: sheet.purchases, beaten: sheet.beaten })}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
