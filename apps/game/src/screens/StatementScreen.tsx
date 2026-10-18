import { signedLine, type StatementLine } from '@cle/engine';
import { useGame, useNav } from '../game/context.tsx';
import { format, formatEuros, formatSigned, propertyLabel, t, texts, tone } from '../texts.ts';
import { Avatar, CHARACTER_AVATARS } from '../ui/Avatar.tsx';
import { Card, KeyValues, ScreenHeader } from '../ui/components.tsx';

/** « Bilan mensuel (court) » (docs/04): the last statement of the 1st of the month. */
export function StatementScreen() {
  const { state } = useGame();
  const nav = useNav();
  const statement = state.lastStatement;
  if (!statement) {
    return (
      <div className="screen">
        <ScreenHeader title={t.statement.heading} onBack={nav.pop} />
        <Card>
          <p className="muted">{t.statement.none}</p>
        </Card>
      </div>
    );
  }
  const label = (line: StatementLine) => {
    const name = t.statement.lines[line.kind];
    if (!('propertyId' in line)) return name;
    const owned = state.properties.find((o) => o.property.id === line.propertyId);
    return owned ? `${name} · ${propertyLabel(owned.property)}` : name;
  };
  const income = statement.lines.filter((line) => signedLine(line) > 0);
  const costs = statement.lines.filter((line) => signedLine(line) <= 0);
  const net = state.history.at(-1)?.cashFlow ?? 0;
  const month = texts.calendar.months[statement.date.month - 1] ?? '';
  return (
    <div className="screen">
      <ScreenHeader title={t.statement.heading} onBack={nav.pop} />
      <h2 className="h1 display">
        {format(t.statement.title, { month: `${month} ${statement.date.year}` })}
      </h2>
      <Card title={t.statement.in}>
        <KeyValues
          rows={income.map((line) => ({
            label: label(line),
            value: formatSigned(line.amount),
            className: 'positive',
          }))}
        />
      </Card>
      <Card title={t.statement.out}>
        <KeyValues
          rows={costs.map((line) => ({ label: label(line), value: formatSigned(-line.amount) }))}
        />
      </Card>
      <Card>
        <KeyValues
          rows={[
            { label: t.statement.net, value: formatSigned(net), className: tone(net) },
            { label: t.statement.balance, value: formatEuros(statement.balance), total: true },
          ]}
        />
      </Card>
      <Card tint="teal">
        <div className="row top">
          <Avatar
            parts={CHARACTER_AVATARS.yvon ?? { face: 0, hair: 0, skin: 0, outfit: 0 }}
            size={44}
          />
          <p className="small">
            <span className="strong">{t.statement.yvon} : </span>
            {net >= 0 ? t.statement.yvonPositive : t.statement.yvonNegative}
          </p>
        </div>
      </Card>
    </div>
  );
}
