import { toDayNumber } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { loanAnswerText, subjectRoute } from '../inbox.ts';
import {
  bankName,
  describeEvent,
  format,
  formatDayYear,
  formatDecimal,
  formatEuros,
  formatShortDate,
  subjectLabel,
  t,
  texts as uiTexts,
} from '../texts.ts';
import { Card, Empty, KeyValues, ScreenHeader } from '../ui/components.tsx';
import { LineChart } from '../ui/LineChart.tsx';
import { ClosedLoanCard } from './BankScreen.tsx';

/** The history with one bank: trust month by month, meetings, answers and loans. */
export function BankerScreen({ id }: { id: string }) {
  const { state } = useGame();
  const nav = useNav();
  const bank = engine.content.banks.find((candidate) => candidate.id === id);
  const relation = state.banks[id];
  const texts = t.bank.banker;
  if (!bank || !relation) {
    return (
      <div className="screen">
        <ScreenHeader title={t.bank.heading} onBack={nav.pop} />
        <Empty icon="info">{texts.empty}</Empty>
      </div>
    );
  }
  const points = relation.trustHistory;
  const first = points[0];
  const last = points.at(-1);
  const running = state.loans.filter((loan) => loan.bankId === id);
  const closed = state.closedLoans.filter((loan) => loan.bankId === id).reverse();
  const entries = [...relation.log].reverse();
  return (
    <div className="screen" data-testid="banker">
      <ScreenHeader title={bank.banker.name} onBack={nav.pop} />
      <p className="small muted">{bank.name}</p>
      <MeetingCard bankId={id} />
      <Card title={texts.trustCurve}>
        <KeyValues rows={[{ label: texts.trust, value: formatDecimal(relation.trust) }]} />
        {first && last && points.length >= 2 ? (
          <LineChart
            title={texts.trustCurve}
            xLabels={[formatShortDate(first.date), formatShortDate(last.date)]}
            formatTick={(value) => String(Math.round(value))}
            series={[{ label: texts.trust, color: '#2b5c8a', values: points.map((p) => p.trust) }]}
          />
        ) : (
          <p className="small muted">{texts.trustSoon}</p>
        )}
      </Card>
      <Card title={texts.history} testId="bank-log">
        {entries.length === 0 && <p className="small muted">{texts.empty}</p>}
        <ul className="stack">
          {entries.map((entry, i) => {
            const answer =
              entry.kind === 'answer' ? loanAnswerText({ ...entry, bankId: id }) : null;
            const route = entry.kind === 'answer' ? subjectRoute(state, entry.subject) : null;
            return (
              <li key={`${entry.day}-${entries.length - i}`} className="stack tight">
                <span className="row between small">
                  <span className="strong">
                    {answer?.title ??
                      format(texts.meeting, {
                        trust: formatDecimal(entry.kind === 'meeting' ? entry.trust : 0),
                      })}
                  </span>
                  <span className="tiny muted">{formatDayYear(entry.day)}</span>
                </span>
                {entry.kind === 'answer' && entry.subject && (
                  <span className="tiny muted">
                    {route ? (
                      <button type="button" className="link-button" onClick={() => nav.push(route)}>
                        {subjectLabel(entry.subject)}
                      </button>
                    ) : (
                      subjectLabel(entry.subject)
                    )}
                  </span>
                )}
                {answer?.details.map((line) => (
                  <span key={line} className="tiny muted">
                    {line}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </Card>
      {running.length > 0 && (
        <Card title={format(texts.loans, { bank: bankName(id) })}>
          {running.map((loan) => (
            <p key={loan.id} className="small">
              {format(texts.running, { amount: formatEuros(loan.remaining) })} ·{' '}
              {formatDayYear(toDayNumber(loan.startDate))}
            </p>
          ))}
        </Card>
      )}
      {closed.map((loan) => (
        <ClosedLoanCard key={loan.id} loan={loan} />
      ))}
    </div>
  );
}

/** A meeting with the banker: now, or planned in the agenda when free time is short. */
function MeetingCard({ bankId }: { bankId: string }) {
  const { state, act, notify } = useGame();
  const bank = engine.content.banks.find((candidate) => candidate.id === bankId);
  const relation = state.banks[bankId];
  const texts = t.bank.banker;
  if (!bank || !relation) return null;
  if (!bank.meetings) {
    return (
      <Card title={texts.meetingHeading}>
        <p className="small muted">{uiTexts.refusals['bank.noMeetings']}</p>
      </Card>
    );
  }
  const rules = engine.content.credit.trust;
  const planned = state.agenda.find(
    (item) => item.kind === 'bankMeeting' && item.bankId === bankId,
  );
  const nextDay =
    relation.lastMeetingDay === null ? null : relation.lastMeetingDay + rules.meetingCooldownDays;
  const tooSoon = nextDay !== null && nextDay > toDayNumber(state.clock.date);
  const meet = () => {
    const events = act({ type: 'bank/meet', bankId });
    const plan = events?.find((event) => event.type === 'bankMeetingPlanned');
    if (plan) notify(describeEvent(plan, state) ?? '');
  };
  return (
    <Card title={texts.meetingHeading} testId="banker-meeting">
      <p className="small muted">{format(texts.meetingHint, { gain: rules.meeting })}</p>
      {planned ? (
        <p className="small strong">
          {format(texts.meetingPlanned, { date: formatDayYear(planned.day) })}
        </p>
      ) : (
        <>
          <button type="button" className="button primary block" disabled={tooSoon} onClick={meet}>
            {texts.meet}
          </button>
          {tooSoon && nextDay !== null && (
            <p className="small muted">
              {format(texts.meetingNext, { date: formatDayYear(nextDay) })}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
