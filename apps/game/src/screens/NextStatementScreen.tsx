import { type GameState, type OutlookLine, type StatementOutlook, toDayNumber } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame, useNav } from '../game/context.tsx';
import { newsCategory } from '../inbox.ts';
import {
  bankName,
  describeEvent,
  format,
  formatDay,
  formatGameDate,
  formatSigned,
  propertyLabel,
  t,
  tone,
} from '../texts.ts';
import { Amount, Card, KeyValues, ScreenHeader } from '../ui/components.tsx';

type GroupId = 'household' | 'tax' | 'other' | `property:${string}`;

interface Group {
  id: GroupId;
  lines: OutlookLine[];
}

const HOUSEHOLD = new Set<OutlookLine['kind']>(['salary', 'rent', 'livingCosts']);
const TAX = new Set<OutlookLine['kind']>(['taxInstalment', 'taxRefund']);

function groupOf(line: OutlookLine): GroupId {
  if (line.propertyId) return `property:${line.propertyId}`;
  if (HOUSEHOLD.has(line.kind)) return 'household';
  if (TAX.has(line.kind)) return 'tax';
  return 'other';
}

/** You first, then each property in the statement's order, the tax, the rest. */
function groups(outlook: StatementOutlook): Group[] {
  const byId = new Map<GroupId, Group>();
  for (const line of outlook.lines) {
    const id = groupOf(line);
    const group = byId.get(id) ?? { id, lines: [] };
    group.lines.push(line);
    byId.set(id, group);
  }
  const rank = (id: GroupId) =>
    id === 'household' ? 0 : id === 'tax' ? 2 : id === 'other' ? 3 : 1;
  return [...byId.values()].sort((a, b) => rank(a.id) - rank(b.id));
}

function changed(line: OutlookLine): boolean {
  return line.last !== null && line.expected !== line.last;
}

/** A property of the statement, owned or sold since. */
function propertyOf(state: GameState, propertyId: string) {
  return (
    state.properties.find((o) => o.property.id === propertyId)?.property ??
    state.soldProperties.findLast((s) => s.property.id === propertyId)?.property ??
    null
  );
}

/**
 * « Prochain bilan » (notes of a test game): the next statement line by line, what moved
 * since the last one and the news that tell why. Every figure comes from the engine.
 */
export function NextStatementScreen() {
  const { state } = useGame();
  const nav = useNav();
  const outlook = engine.statementOutlook(state);
  const texts = t.nextStatement;
  const lastDate = outlook.lastDate;
  return (
    <div className="screen">
      <ScreenHeader title={texts.heading} onBack={nav.pop} />
      <Card testId="next-statement">
        <p className="small muted">{format(texts.intro, { date: formatGameDate(outlook.date) })}</p>
        <Amount
          label={texts.net}
          value={formatSigned(outlook.net)}
          className={tone(outlook.net)}
          testId="next-statement-net"
        />
        {lastDate === null || outlook.lastNet === null ? (
          <p className="small muted">{texts.noLast}</p>
        ) : outlook.net === outlook.lastNet ? (
          <p className="small muted">
            {format(texts.sameAsLast, { date: formatGameDate(lastDate) })}
          </p>
        ) : (
          <p className={`small ${tone(outlook.net - outlook.lastNet)}`}>
            {format(texts.vsLast, {
              amount: formatSigned(outlook.net - outlook.lastNet),
              date: formatGameDate(lastDate),
              last: formatSigned(outlook.lastNet),
            })}
          </p>
        )}
      </Card>
      {groups(outlook).map((group) => (
        <GroupCard key={group.id} group={group} outlook={outlook} />
      ))}
    </div>
  );
}

function GroupCard({ group, outlook }: { group: Group; outlook: StatementOutlook }) {
  const { state } = useGame();
  const nav = useNav();
  const texts = t.nextStatement;
  const propertyId = group.id.startsWith('property:') ? group.id.slice('property:'.length) : null;
  const property = propertyId ? propertyOf(state, propertyId) : null;
  const owned = propertyId !== null && state.properties.some((o) => o.property.id === propertyId);
  const title = propertyId
    ? property
      ? propertyLabel(property)
      : propertyId
    : texts.groups[group.id as 'household' | 'tax' | 'other'];
  const notes = [...new Set(group.lines.map((line) => line.note).filter((note) => note !== null))];
  const why =
    outlook.lastDate !== null && group.lines.some(changed)
      ? newsSince(state, toDayNumber(outlook.lastDate), propertyId)
      : [];
  return (
    <Card
      title={title}
      testId={propertyId ? `next-statement-${propertyId}` : `next-statement-${group.id}`}
      aside={
        owned && propertyId ? (
          <button
            type="button"
            className="link-button"
            onClick={() => nav.push({ name: 'property', id: propertyId })}
          >
            {texts.open}
          </button>
        ) : undefined
      }
    >
      <KeyValues
        rows={group.lines.map((line) => ({
          label: lineLabel(state, line),
          value: <LineValue line={line} />,
        }))}
      />
      {notes.map((note) => (
        <p key={note} className="small muted">
          {texts.notes[note]}
        </p>
      ))}
      {why.length > 0 && (
        <div className="stack tight" data-testid="next-statement-why">
          <span className="small strong">{texts.why}</span>
          <ul className="small plain-list">
            {why.map((line) => (
              <li key={line.id}>
                {formatDay(line.day)} · {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function lineLabel(state: GameState, line: OutlookLine): string {
  const label = t.nextStatement.kinds[line.kind];
  if (line.kind !== 'loanPayment' || !line.loanId) return label;
  const bankId =
    state.loans.find((loan) => loan.id === line.loanId)?.bankId ??
    state.closedLoans.find((loan) => loan.id === line.loanId)?.bankId;
  return bankId ? format(t.nextStatement.loanOf, { bank: bankName(bankId) }) : label;
}

/** The amount expected, and how far it is from the last statement. */
function LineValue({ line }: { line: OutlookLine }) {
  const texts = t.nextStatement;
  if (!changed(line) || line.last === null) {
    return <span className={tone(line.expected)}>{formatSigned(line.expected)}</span>;
  }
  if (line.expected === 0 && line.note !== 'unpaid') {
    return (
      <span className="stack tight">
        <span>—</span>
        <span className="tiny muted">
          {format(texts.gone, { amount: formatSigned(line.last) })}
        </span>
      </span>
    );
  }
  const delta = line.expected - line.last;
  return (
    <span className="stack tight">
      <span className={tone(line.expected)}>{formatSigned(line.expected)}</span>
      <span className={`tiny ${tone(delta)}`}>
        {line.last === 0 ? texts.new : format(texts.delta, { amount: formatSigned(delta) })}
      </span>
    </span>
  );
}

/**
 * The news since the last statement that may explain a change: those of the property,
 * or, for the household and the tax, the money and life news that name no property.
 */
function newsSince(state: GameState, fromDay: number, propertyId: string | null) {
  const lines: { id: number; day: number; text: string }[] = [];
  for (const item of state.inbox.news) {
    if (item.day < fromDay || item.event.type === 'monthlyStatement') continue;
    if (propertyId) {
      if (item.subject?.propertyId !== propertyId) continue;
    } else {
      const category = newsCategory(item);
      if (item.subject !== null || (category !== 'money' && category !== 'life')) continue;
    }
    const text = describeEvent(item.event, state, item.subject);
    if (text) lines.push({ id: item.id, day: item.day, text });
  }
  return lines;
}

/** Hint of the « Prochain bilan » tiles: how far it moved since the last statement. */
export function nextStatementHint(state: GameState): string {
  const outlook = engine.statementOutlook(state);
  if (outlook.lastNet === null || outlook.lastNet === outlook.net) return t.street.monthlyHint;
  return format(t.nextStatement.tileChange, {
    amount: formatSigned(outlook.net - outlook.lastNet),
  });
}
