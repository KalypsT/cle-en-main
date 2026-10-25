import { gameContent } from '@cle/content';
import { expectedSalary, livingCosts } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import {
  cityName,
  format,
  formatDayYear,
  formatDuration,
  formatEuros,
  formatPercent,
  jobName,
  propertyLabel,
  t,
  titleName,
} from '../texts.ts';
import { Card, KeyValues, ScreenHeader } from '../ui/components.tsx';
import { Avatar } from '../ui/Avatar.tsx';

/**
 * « Moi » (docs/03-systemes/01, « la fiche du personnage »): the job and its salary, the free
 * time, the home, the reputation; resigning, and looking for one's job again.
 */
export function MeScreen() {
  const { state, act } = useGame();
  const nav = useNav();
  const { player } = state;
  const texts = t.me;
  const home = state.properties.find((owned) => owned.property.id === player.homePropertyId);
  const title = engine.progression(state).currentTitleId;
  const credit = gameContent.credit;
  const resign = () => {
    if (window.confirm(format(texts.resignConfirm, { days: gameContent.jobSearchDays }))) {
      act({ type: 'job/resign' });
    }
  };
  return (
    <div className="screen" data-testid="me">
      <ScreenHeader title={texts.heading} onBack={nav.pop} />
      <div className="row" style={{ gap: 12 }}>
        <Avatar parts={player.avatar} size={64} label={player.name} />
        <h2 className="h1">{player.name}</h2>
      </div>
      <Card>
        <KeyValues
          rows={[
            {
              label: texts.job,
              value: player.employed
                ? jobName(player.jobId)
                : player.jobSearchEndDay !== null
                  ? format(texts.searching, { date: formatDayYear(player.jobSearchEndDay) })
                  : texts.noJob,
            },
            { label: texts.salary, value: formatEuros(expectedSalary(gameContent, player)) },
            { label: texts.livingCosts, value: formatEuros(livingCosts(gameContent, player)) },
            { label: texts.freeTime, value: formatDuration(player.freeTimeMinutes) },
            {
              label: texts.home,
              value: home
                ? format(texts.owner, { property: propertyLabel(home.property) })
                : format(texts.renting, { rent: formatEuros(player.monthlyRent) }),
            },
            { label: texts.base, value: cityName(player.baseCityId) },
            { label: texts.reputation, value: String(Math.round(player.reputation)) },
            ...(title ? [{ label: texts.title, value: titleName(title) }] : []),
          ]}
        />
      </Card>
      <Card title={texts.work} testId="me-work">
        {player.employed ? (
          <>
            <p className="small muted">
              {format(texts.resignHint, {
                hours: formatDuration(gameContent.unemployedFreeTimeMinutes),
                share: formatPercent(credit.retainedRentShare * 100),
                months: credit.minRentalHistoryMonthsWithoutSalary,
              })}
            </p>
            <button type="button" className="button danger block" onClick={resign}>
              {texts.resign}
            </button>
          </>
        ) : player.jobSearchEndDay === null ? (
          <>
            <p className="small muted">
              {format(texts.seekHint, { days: gameContent.jobSearchDays })}
            </p>
            <button
              type="button"
              className="button primary block"
              onClick={() => act({ type: 'job/seek' })}
            >
              {texts.seek}
            </button>
          </>
        ) : (
          <p className="small">
            {format(texts.searching, { date: formatDayYear(player.jobSearchEndDay) })}
          </p>
        )}
      </Card>
    </div>
  );
}
