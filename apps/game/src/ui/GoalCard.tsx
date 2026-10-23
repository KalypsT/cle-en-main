import { gameContent } from '@cle/content';
import type { NextGoal } from '@cle/engine';
import { engine } from '../engine.ts';
import { useGame } from '../game/context.tsx';
import { format, formatDecimal, statLabel, t } from '../texts.ts';
import { Card } from './components.tsx';

/** Whole numbers in a goal: « 2 / 3 », « 150 000 / 1 000 000 ». */
function figure(value: number): string {
  return formatDecimal(Math.round(value));
}

function Meter({ share }: { share: number }) {
  return (
    <span className="goal-meter" aria-hidden="true">
      <span style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
    </span>
  );
}

function GoalConditions({ goal }: { goal: NextGoal }) {
  return (
    <ul className="goal-conditions">
      {goal.conditions.map((condition) => (
        <li key={`${condition.stat}-${condition.key}`}>
          <span className="goal-line">
            <span className="grow">{statLabel(condition.stat, condition.key)}</span>
            <span className="strong">
              {format(t.goal.progress, {
                current: figure(condition.current),
                target: figure(condition.target),
              })}
            </span>
          </span>
          <Meter share={condition.share} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The title to go for next, with what is left to do (game feel, lot 5): the
 * one the engine finds closest to done, and the name of the other branch.
 * Every figure comes from `engine.nextGoals`.
 */
export function GoalCard({ onOpen }: { onOpen?: (() => void) | undefined }) {
  const { state } = useGame();
  const [goal, ...others] = engine.nextGoals(state);
  if (!goal) return null;
  const title = gameContent.titles.find((candidate) => candidate.id === goal.titleId);
  if (!title) return null;
  const other = others
    .map((entry) => gameContent.titles.find((candidate) => candidate.id === entry.titleId)?.name)
    .filter(Boolean)
    .join(', ');
  return (
    <Card title={t.goal.heading} testId="next-goal">
      <p className="display goal-title">{title.name}</p>
      <p className="small muted">{title.description}</p>
      <GoalConditions goal={goal} />
      {title.perkText && (
        <p className="small muted">{format(t.goal.perk, { perk: title.perkText })}</p>
      )}
      {other && <p className="small muted">{format(t.goal.other, { title: other })}</p>}
      {onOpen && (
        <button type="button" className="link-button" onClick={onOpen}>
          {t.goal.see}
        </button>
      )}
    </Card>
  );
}
