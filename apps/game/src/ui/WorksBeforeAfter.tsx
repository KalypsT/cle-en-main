import { gameContent } from '@cle/content';
import { fromDayNumber, type OwnedProperty } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import { useGame } from '../game/context.tsx';
import {
  format,
  formatDecimal,
  formatEuros,
  formatGameDate,
  formatSigned,
  itemName,
  spaceName,
  t,
} from '../texts.ts';
import { Card, DpeLetter } from './components.tsx';
import { Facade } from './Facade.tsx';
import { Icon } from './Icon.tsx';

/** The slider starts in the middle, so that both states show. */
const START_SHARE = 50;

/**
 * The façade before and after some works, one over the other: a handle slides
 * the « avant » away to show the « après » (game feel, lot 4). A range input
 * carries it, so that a keyboard or a screen reader can move it too.
 */
function Slider({ owned, look }: { owned: OwnedProperty; look: BeforeAfterLook }) {
  const [share, setShare] = useState(START_SHARE);
  const texts = t.worksReport;
  return (
    <div className="before-after" data-testid="before-after">
      <div className="before-after-view">
        <Facade property={owned.property} owned look={look.after} height={170} />
        <div className="before-after-top" style={{ clipPath: `inset(0 ${100 - share}% 0 0)` }}>
          <Facade property={owned.property} owned look={look.before} height={170} />
        </div>
        <span className="before-after-line" style={{ left: `${share}%` }} aria-hidden="true">
          <span className="before-after-knob">
            <Icon name="chevron" size={14} />
          </span>
        </span>
        <span className="before-after-tag before">{texts.before}</span>
        <span className="before-after-tag after">{texts.after}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={share}
          aria-label={texts.compare}
          onChange={(event) => setShare(Number(event.target.value))}
        />
      </div>
      <p className="small muted center">{texts.compare}</p>
    </div>
  );
}

interface BeforeAfterLook {
  before: { facadeState: number; newWindows: boolean };
  after: { facadeState: number; newWindows: boolean };
}

function Figure({
  label,
  before,
  after,
  gain,
}: {
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
  gain?: string | undefined;
}) {
  return (
    <div className="ba-figure">
      <span className="ba-figure-label">{label}</span>
      <span className="ba-figure-values">
        <span className="ba-from">{before}</span>
        <Icon name="chevron" size={16} />
        <span className="ba-to">{after}</span>
      </span>
      {gain && <span className="small positive strong">{gain}</span>}
    </div>
  );
}

/** A room's mean state as a bar, before in grey and after in colour. */
function RoomBar({ before, after }: { before: number; after: number }) {
  return (
    <span
      className="room-bar"
      role="img"
      aria-label={format(t.worksReport.stateFromTo, {
        from: formatDecimal(before),
        to: formatDecimal(after),
      })}
    >
      <span className="room-bar-before" style={{ width: `${(before / 5) * 100}%` }} />
      <span className="room-bar-after" style={{ width: `${(after / 5) * 100}%` }} />
    </span>
  );
}

/**
 * What the works of a property changed: the façade before and after, the energy
 * class, the value and the rent, the items worked on and the state of the rooms.
 * Every figure comes from `engine.worksBeforeAfter`.
 */
export function WorksBeforeAfterView({ propertyId }: { propertyId: string }) {
  const { state } = useGame();
  const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
  const report = owned ? engine.worksBeforeAfter(state, propertyId) : null;
  const texts = t.worksReport;
  if (!owned || !report) return null;
  const { property } = owned;
  const look: BeforeAfterLook = {
    before: {
      facadeState: report.facade.before.state,
      newWindows: report.facade.before.newWindows,
    },
    after: { facadeState: report.facade.after.state, newWindows: report.facade.after.newWindows },
  };
  const facadeChanged =
    look.before.facadeState !== look.after.facadeState ||
    look.before.newWindows !== look.after.newWindows;
  const rentGain = report.rent.after - report.rent.before;
  const rentText =
    report.rent.before === 0 && report.rent.after > 0
      ? texts.rentNowPossible
      : rentGain > 0
        ? formatSigned(rentGain)
        : undefined;
  return (
    <div className="stack" data-testid="works-report">
      {facadeChanged ? (
        <Slider owned={owned} look={look} />
      ) : (
        // Works inside: the façade is the same, a slider would compare nothing.
        <Facade property={property} owned look={look.after} height={150} />
      )}
      <div className="ba-figures">
        <Figure
          label={texts.dpe}
          before={<DpeLetter dpe={report.dpe.before} />}
          after={<DpeLetter dpe={report.dpe.after} />}
        />
        <Figure
          label={texts.value}
          before={formatEuros(report.value.before)}
          after={formatEuros(report.value.after)}
          gain={
            report.value.after > report.value.before
              ? formatSigned(report.value.after - report.value.before)
              : undefined
          }
        />
        <Figure
          label={texts.rent}
          before={report.rent.before > 0 ? formatEuros(report.rent.before) : texts.rentNone}
          after={report.rent.after > 0 ? formatEuros(report.rent.after) : texts.rentNone}
          gain={rentText}
        />
        <p className="small muted center">
          {format(texts.cost, { cost: formatEuros(report.cost) })}
        </p>
      </div>
      {report.changes.length > 0 && (
        <Card title={texts.changes}>
          <ul className="ba-changes">
            {report.changes.map((change) => (
              <li key={change.itemId}>
                <span className="grow stack tight">
                  <span>
                    {change.spaceId
                      ? format(texts.item, {
                          item: itemName(change.kind),
                          space: spaceName(property, change.spaceId),
                        })
                      : itemName(change.kind)}
                  </span>
                  <span className="small muted">{gameContent.worksTexts.tiers[change.tierTo]}</span>
                </span>
                <span className="strong">
                  {format(texts.stateFromTo, { from: change.stateFrom, to: change.stateTo })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {report.rooms.some((room) => room.after !== room.before) && (
        <Card title={texts.rooms}>
          <ul className="ba-rooms">
            {report.rooms
              .filter((room) => room.after !== room.before)
              .map((room) => (
                <li key={room.spaceId}>
                  <span className="grow">{spaceName(property, room.spaceId)}</span>
                  <RoomBar before={room.before} after={room.after} />
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** « Dernier chantier » of a property sheet: the date, the cost and the way in. */
export function LastWorksCard({ owned, onOpen }: { owned: OwnedProperty; onOpen: () => void }) {
  const report = owned.lastWorks;
  if (!report) return null;
  const texts = t.worksReport;
  return (
    <Card title={texts.card} testId="last-works">
      <p className="small">
        {format(texts.cardHint, {
          date: formatGameDate(fromDayNumber(report.day)),
          cost: formatEuros(report.cost),
          before: report.before.dpe,
          after: report.after.dpe,
        })}
      </p>
      <button type="button" className="button block" onClick={onOpen}>
        {texts.open}
      </button>
    </Card>
  );
}
