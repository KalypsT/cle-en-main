import { gameContent } from '@cle/content';
import {
  type LeaseType,
  type OwnedProperty,
  type RentalApplication,
  visibleReliability,
} from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  format,
  formatDayYear,
  formatDecimal,
  formatEuros,
  formatWhen,
  propertyLabel,
  t,
  texts,
} from '../texts.ts';
import {
  Badge,
  Card,
  Empty,
  KeyValues,
  ScreenHeader,
  Segmented,
  Switch,
} from '../ui/components.tsx';

/** Step of the rent slider, in cents (the engine rounds rents to this too). */
const RENT_STEP = 5_00;

/** « Location »: offer the property, then choose a tenant (docs/03-systemes/04). */
export function RentScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  if (!owned) {
    return (
      <div className="screen">
        <ScreenHeader title={t.rent.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader title={t.rent.heading} onBack={nav.pop} />
      <p className="strong">{propertyLabel(owned.property)}</p>
      {owned.rental && <Candidates owned={owned} />}
      <RentalForm owned={owned} />
    </div>
  );
}

function RentalForm({ owned }: { owned: OwnedProperty }) {
  const { state, act } = useGame();
  const nav = useNav();
  const current = owned.rental;
  const [leaseType, setLeaseType] = useState<LeaseType>(current?.leaseType ?? 'bare');
  const [agencyId, setAgencyId] = useState<string | null>(current?.agencyId ?? null);
  const [insured, setInsured] = useState(current?.insured ?? false);
  const [rent, setRent] = useState<number | null>(current?.monthlyRent ?? null);
  const quote = engine.rentQuote(state, owned.property.id, leaseType);
  if (!quote) return null;
  const chosen = Math.min(quote.max, Math.max(quote.min, rent ?? quote.market));
  const premium = gameContent.renting.unpaidRentInsurance.premiumShare;

  const publish = () => {
    const events = act(
      {
        type: 'rent/list',
        propertyId: owned.property.id,
        leaseType,
        monthlyRent: chosen,
        agencyId,
        insured,
      },
      t.rent.published,
    );
    if (events && !current) nav.pop();
  };

  if (quote.block) {
    return (
      <Card tint="brick">
        <p className="strong">{t.rent.blocked}</p>
        <p className="small">{texts.refusals[quote.block]}</p>
      </Card>
    );
  }

  return (
    <Card title={current ? t.rent.update : t.rent.heading}>
      {current && <p className="small muted">{t.rent.updateHint}</p>}
      <div className="field">
        <span className="field-label">{t.rent.leaseType}</span>
        <Segmented<LeaseType>
          label={t.rent.leaseType}
          value={leaseType}
          onChange={(value) => {
            setLeaseType(value);
            setRent(null);
          }}
          options={[
            { value: 'bare', label: t.rent.bare },
            { value: 'furnished', label: t.rent.furnished },
          ]}
        />
        {leaseType === 'furnished' && !owned.furniture && (
          <span className="small muted">
            {format(t.rent.furnitureCost, { amount: formatEuros(quote.furnitureCost) })}
          </span>
        )}
      </div>
      <label className="field">
        <span className="field-label">
          {t.rent.rent} : <span data-testid="rent-amount">{formatEuros(chosen)}</span>
        </span>
        <input
          className="range"
          type="range"
          min={quote.min}
          max={quote.max}
          step={RENT_STEP}
          value={chosen}
          onChange={(e) => setRent(Number(e.target.value))}
          aria-label={t.rent.rent}
        />
        <span className="row between small muted">
          <span>
            {format(t.rent.range, { min: formatEuros(quote.min), max: formatEuros(quote.max) })}
          </span>
          <button type="button" className="link-button small" onClick={() => setRent(quote.market)}>
            {format(t.rent.market, { amount: formatEuros(quote.market) })}
          </button>
        </span>
      </label>
      <div className="field">
        <span className="field-label">{t.rent.management}</span>
        <button
          type="button"
          className="option-card"
          aria-pressed={agencyId === null}
          onClick={() => setAgencyId(null)}
        >
          <span className="strong">{t.rent.self}</span>
          <span className="small muted">{t.rent.selfHint}</span>
        </button>
        {gameContent.renting.agencies.map((agency) => (
          <button
            key={agency.id}
            type="button"
            className="option-card"
            aria-pressed={agencyId === agency.id}
            onClick={() => setAgencyId(agency.id)}
          >
            <span className="strong">{agency.name}</span>
            <span className="small muted">
              {format(t.rent.agencyFee, { fee: formatDecimal(agency.feeShare * 100) })}
            </span>
          </button>
        ))}
      </div>
      <Switch
        label={t.rent.insurance}
        hint={format(t.rent.insuranceHint, { share: formatDecimal(premium * 100) })}
        checked={insured}
        onChange={setInsured}
      />
      <KeyValues
        rows={[
          {
            label: t.rent.ownerCosts,
            value: format(t.common.perMonth, { amount: formatEuros(quote.monthlyOwnerCosts) }),
          },
        ]}
      />
      <p className="tiny muted">{t.rent.ownerCostsHint}</p>
      <div className="stack">
        <button type="button" className="button primary block" onClick={publish}>
          {current ? t.rent.update : t.rent.publish}
        </button>
        {current && (
          <button
            type="button"
            className="button danger block"
            onClick={() => act({ type: 'rent/withdraw', propertyId: owned.property.id })}
          >
            {t.rent.withdraw}
          </button>
        )}
      </div>
    </Card>
  );
}

function Candidates({ owned }: { owned: OwnedProperty }) {
  const rental = owned.rental;
  if (!rental) return null;
  return (
    <Card
      title={t.rent.candidates}
      aside={
        <Badge tone="teal">
          {format(t.common.perMonth, { amount: formatEuros(rental.monthlyRent) })}
        </Badge>
      }
      testId="candidates"
    >
      <p className="small muted">
        {format(t.property.since, { date: formatDayYear(rental.listedDay) })}
      </p>
      {rental.agencyId && <p className="small muted">{t.rent.agencySelects}</p>}
      {rental.applications.length === 0 ? (
        <p className="small muted">{t.rent.noCandidates}</p>
      ) : (
        rental.applications.map((application) => (
          <Candidate
            key={application.id}
            owned={owned}
            application={application}
            rent={rental.monthlyRent}
          />
        ))
      )}
    </Card>
  );
}

function Candidate({
  owned,
  application,
  rent,
}: {
  owned: OwnedProperty;
  application: RentalApplication;
  rent: number;
}) {
  const { state, act } = useGame();
  const { tenant } = application;
  const texts = gameContent.tenantTexts;
  const profile = gameContent.renting.profiles.find((p) => p.id === tenant.profileId);
  const reliability = Math.max(0, Math.min(1, visibleReliability(gameContent, tenant, rent)));
  const name = `${tenant.firstName} ${tenant.lastName}`;
  return (
    <div className="card flat" data-testid="candidate">
      <div className="row between">
        <span className="strong">{name}</span>
        <Badge>{texts.profiles[tenant.profileId]}</Badge>
      </div>
      <p className="small muted">{texts.traits[tenant.traitId]}</p>
      <div className="row wrap">
        {profile && <Badge>{texts.contracts[profile.contract]}</Badge>}
        <Badge tone={tenant.guarantor ? 'green' : undefined}>
          {tenant.guarantor ? t.rent.guarantor : t.rent.noGuarantor}
        </Badge>
        <Badge>{format(t.rent.wants, { years: tenant.desiredYears })}</Badge>
      </div>
      <p className="small">
        {format(t.rent.income, {
          amount: formatEuros(tenant.monthlyIncome),
          ratio: formatDecimal(tenant.monthlyIncome / Math.max(1, rent)),
        })}
      </p>
      <div className="row between small">
        <span className="muted">{t.rent.reliability}</span>
        <span className="strong">
          {format(t.rent.reliabilityValue, { value: Math.round(reliability * 100) })}
        </span>
      </div>
      <p className="tiny muted">
        {format(t.rent.expires, { when: formatWhen(application.expiresDay, state.clock.date) })}
      </p>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() =>
            act({
              type: 'rent/reject',
              propertyId: owned.property.id,
              applicationId: application.id,
            })
          }
        >
          {t.rent.reject}
        </button>
        <button
          type="button"
          className="button primary"
          onClick={() =>
            act(
              { type: 'rent/accept', propertyId: owned.property.id, applicationId: application.id },
              format(t.rent.accepted, { name }),
            )
          }
        >
          {t.rent.accept}
        </button>
      </div>
    </div>
  );
}
