import { gameContent, type Job } from '@cle/content';
import type { Avatar as AvatarParts } from '@cle/engine';
import { useState } from 'react';
import { cityName, format, formatDuration, formatEuros, t, texts } from '../texts.ts';
import { Avatar, AVATAR_CONTROLS, AVATAR_KEYS } from '../ui/Avatar.tsx';
import { Card, Stepper, Switch } from '../ui/components.tsx';

export interface NewGameChoices {
  name: string;
  avatar: AvatarParts;
  jobId: string;
  tutorial: boolean;
  modeId: string;
}

function freeTimeText(job: Job): string {
  const { freeTime } = job;
  return freeTime.kind === 'regular'
    ? format(t.creation.freeTimeRegular, {
        weekday: formatDuration(freeTime.weekdayMinutes),
        weekend: formatDuration(freeTime.weekendMinutes),
      })
    : format(t.creation.freeTimeShifts, {
        work: formatDuration(freeTime.workDayMinutes),
        rest: formatDuration(freeTime.restDayMinutes),
      });
}

/** « Création de partie » (docs/02, 2.1): name, avatar, job, mode. */
export function CreateGameScreen({
  onStart,
  onBack,
}: {
  onStart: (choices: NewGameChoices) => void;
  onBack: () => void;
}) {
  const { start } = gameContent;
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarParts>({ face: 0, hair: 0, skin: 0, outfit: 0 });
  const [jobId, setJobId] = useState(start.defaultJobId);
  const [tutorial, setTutorial] = useState(true);
  const [modeId, setModeId] = useState(gameContent.modes.defaultModeId);

  const shift = (part: (typeof AVATAR_KEYS)[number], delta: number) =>
    setAvatar((current) => {
      const { count, get, set } = AVATAR_CONTROLS[part];
      return set(current, (get(current) + delta + count) % count);
    });

  return (
    <main className="screen">
      <h1 className="screen-heading display">{t.creation.heading}</h1>
      <p className="muted">
        {format(t.creation.intro, {
          city: cityName(start.cityId),
          savings: formatEuros(start.savings * 100),
        })}
      </p>
      <Card>
        <label className="field">
          <span className="field-label">{t.creation.name}</span>
          <input
            className="input"
            value={name}
            maxLength={start.maxPlayerNameLength}
            placeholder={start.defaultPlayerName}
            autoComplete="off"
            data-testid="player-name"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </Card>
      <Card title={t.creation.avatar}>
        <div className="avatar-editor">
          <Avatar
            parts={avatar}
            size={112}
            label={format(t.avatar.label, { name: name || start.defaultPlayerName })}
          />
          <div className="stack tight">
            {AVATAR_KEYS.map((part) => (
              <Stepper
                key={part}
                label={t.creation[part]}
                value={format(t.creation.partValue, {
                  index: AVATAR_CONTROLS[part].get(avatar) + 1,
                  count: AVATAR_CONTROLS[part].count,
                })}
                previousLabel={format(t.creation.previous, { part: t.creation[part] })}
                nextLabel={format(t.creation.next, { part: t.creation[part] })}
                onPrevious={() => shift(part, -1)}
                onNext={() => shift(part, 1)}
              />
            ))}
          </div>
        </div>
      </Card>
      <Card title={t.creation.job}>
        <div className="stack">
          {gameContent.jobs.map((job) => (
            <button
              key={job.id}
              type="button"
              className="option-card"
              aria-pressed={job.id === jobId}
              data-testid={`job-${job.id}`}
              onClick={() => setJobId(job.id)}
            >
              <span className="strong">{job.name}</span>
              <span className="small">
                {job.averageMonthlyTotal
                  ? format(t.creation.salaryVariable, {
                      amount: formatEuros(job.averageMonthlyTotal * 100),
                    })
                  : format(t.creation.salary, { amount: formatEuros(job.netMonthlySalary * 100) })}
              </span>
              <span className="small muted">{freeTimeText(job)}</span>
              <span className="small muted">{job.perk}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card title={t.creation.mode}>
        <div className="stack">
          {gameContent.modes.modes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className="option-card"
              aria-pressed={mode.id === modeId}
              data-testid={`mode-${mode.id}`}
              onClick={() => setModeId(mode.id)}
            >
              <span className="strong">{mode.name}</span>
              <span className="small muted">{mode.description}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card>
        <Switch
          label={t.creation.tutorial}
          hint={t.creation.tutorialHint}
          checked={tutorial}
          onChange={setTutorial}
        />
      </Card>
      <button
        type="button"
        className="button primary block"
        onClick={() => onStart({ name, avatar, jobId, tutorial, modeId })}
      >
        {t.creation.start}
      </button>
      <button type="button" className="button block" onClick={onBack}>
        {texts.slots.back}
      </button>
    </main>
  );
}
