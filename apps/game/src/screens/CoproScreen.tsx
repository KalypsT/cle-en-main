import { gameContent } from '@cle/content';
import { useGame, useNav } from '../game/context.tsx';
import { format, formatDayYear, formatEuros, propertyLabel, t } from '../texts.ts';
import { Badge, Card, Empty, ScreenHeader } from '../ui/components.tsx';

/** « Assemblée de copropriété » (docs/03-systemes/05, « La copropriété »). */
export function CoproScreen({ id }: { id: string }) {
  const { state, act } = useGame();
  const nav = useNav();
  const owned = state.properties.find((candidate) => candidate.property.id === id);
  if (!owned) {
    return (
      <div className="screen">
        <ScreenHeader title={t.copro.heading} onBack={nav.pop} />
        <Empty icon="info">{t.listing.gone}</Empty>
      </div>
    );
  }
  const meeting = owned.coproMeeting;
  const resolutions = gameContent.worksTexts.resolutions;
  return (
    <div className="screen">
      <ScreenHeader title={t.copro.heading} onBack={nav.pop} />
      <p className="strong">{propertyLabel(owned.property)}</p>
      {owned.property.copro && (
        <p className="small muted">{format(t.copro.lots, { lots: owned.property.copro.lots })}</p>
      )}
      {!meeting ? (
        <Card>
          <p className="small muted">{t.copro.none}</p>
        </Card>
      ) : (
        <Card
          title={format(t.copro.date, { date: formatDayYear(meeting.voteDay) })}
          testId="copro-meeting"
        >
          {!meeting.attended && <p className="small muted">{t.copro.attend}</p>}
          {meeting.resolutions.map((resolution) => (
            <div key={resolution.id} className="card flat">
              <p className="strong">{resolutions[resolution.id] ?? resolution.id}</p>
              <p className="small">
                {format(t.copro.share, { amount: formatEuros(resolution.cost) })}
              </p>
              {resolution.vote && (
                <Badge tone="teal">
                  {format(t.copro.voted, {
                    vote: resolution.vote === 'for' ? t.copro.voteFor : t.copro.voteAgainst,
                  })}
                </Badge>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="button"
                  aria-pressed={resolution.vote === 'against'}
                  onClick={() =>
                    act({
                      type: 'copro/vote',
                      propertyId: id,
                      resolutionId: resolution.id,
                      vote: 'against',
                    })
                  }
                >
                  {t.copro.voteAgainst}
                </button>
                <button
                  type="button"
                  className="button primary"
                  aria-pressed={resolution.vote === 'for'}
                  onClick={() =>
                    act({
                      type: 'copro/vote',
                      propertyId: id,
                      resolutionId: resolution.id,
                      vote: 'for',
                    })
                  }
                >
                  {t.copro.voteFor}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Card title={t.copro.calls}>
        {owned.coproCalls.length === 0 ? (
          <p className="small muted">{t.copro.noCalls}</p>
        ) : (
          owned.coproCalls.map((call, index) => (
            <p key={index} className="small">
              {format(t.copro.callLine, {
                amount: formatEuros(call.monthly),
                months: call.monthsLeft,
              })}
            </p>
          ))
        )}
      </Card>
    </div>
  );
}
