import { music } from '@cle/content';
import { FORMAT_VERSION } from '@cle/engine';
import { useEffect, useState } from 'react';
import { exportJournal } from '../storage/files.ts';
import { type JournalEntry, readJournal, type SlotId } from '../storage/saves.ts';
import { QUALITIES, THEMES, type Volumes } from '../settings.ts';
import { useGame, useNav } from '../game/context.tsx';
import { BUILD } from '../build-info.ts';
import { applyUpdate, checkForUpdate, useUpdates } from '../pwa-updates.ts';
import { format, formatBuildDate, t } from '../texts.ts';
import { Card, Chip, ScreenHeader, Segmented, Switch } from '../ui/components.tsx';

const VOLUMES: readonly (keyof Volumes)[] = ['music', 'ambience', 'effects'];

/** « Réglages » (docs/04, 4.5): saves, time, tutorial, theme, street graphics and sound. */
export function SettingsScreen() {
  const { state, act, settings, setSettings, save, exportGame, slot } = useGame();
  const nav = useNav();
  const [journal, setJournal] = useState<JournalEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    readJournal(slot as SlotId)
      .then((entries) => live && setJournal(entries))
      .catch(() => live && setJournal([]));
    return () => {
      live = false;
    };
  }, [slot]);
  return (
    <div className="screen">
      <ScreenHeader title={t.settings.heading} onBack={nav.pop} />
      <Card title={t.settings.saves}>
        <p className="small">{format(t.settings.slot, { number: slot })}</p>
        <p className="small muted">{t.settings.autosave}</p>
        <button type="button" className="button primary" onClick={save}>
          {t.settings.saveNow}
        </button>
        <button type="button" className="button" onClick={exportGame}>
          {t.settings.export}
        </button>
        <p className="small muted">{t.settings.exportHint}</p>
        <button type="button" className="button" onClick={() => nav.push({ name: 'rewind' })}>
          {t.settings.rewind}
        </button>
        <p className="small muted">{t.settings.rewindHint}</p>
      </Card>
      <Card title={t.settings.time}>
        <Switch
          label={t.settings.autoPause}
          hint={t.settings.autoPauseHint}
          checked={settings.autoPause}
          onChange={(autoPause) => setSettings({ ...settings, autoPause })}
        />
        <Switch
          label={t.settings.autoSpeed}
          hint={t.settings.autoSpeedHint}
          checked={settings.autoSpeed}
          onChange={(autoSpeed) => setSettings({ ...settings, autoSpeed })}
        />
        <Switch
          label={t.settings.monthlyReview}
          hint={t.settings.monthlyReviewHint}
          checked={settings.monthlyReview}
          onChange={(monthlyReview) => setSettings({ ...settings, monthlyReview })}
        />
      </Card>
      <Card title={t.settings.tutorial}>
        <Switch
          label={t.settings.tutorialOn}
          checked={state.tutorial.enabled}
          onChange={(enabled) => act({ type: 'tutorial/set', enabled })}
        />
        <button
          type="button"
          className="button"
          onClick={() => act({ type: 'tutorial/set', enabled: true, step: 0 })}
        >
          {t.settings.tutorialRestart}
        </button>
      </Card>
      <Card title={t.settings.theme}>
        <div className="row wrap" role="group" aria-label={t.settings.theme}>
          {THEMES.map((theme) => (
            <Chip
              key={theme}
              pressed={settings.theme === theme}
              onClick={() => setSettings({ ...settings, theme })}
            >
              {t.settings.themes[theme]}
            </Chip>
          ))}
        </div>
        <p className="small muted">{t.settings.themeHint}</p>
      </Card>
      <Card title={t.settings.street}>
        <span className="strong">{t.settings.quality}</span>
        <Segmented
          label={t.settings.quality}
          options={QUALITIES.map((value) => ({ value, label: t.settings.qualities[value] }))}
          value={settings.quality}
          onChange={(quality) => setSettings({ ...settings, quality })}
        />
        <p className="small muted">{t.settings.qualityHint}</p>
        <Switch
          label={t.settings.showFps}
          hint={t.settings.showFpsHint}
          checked={settings.showFps}
          onChange={(showFps) => setSettings({ ...settings, showFps })}
        />
      </Card>
      <Card title={t.settings.sound}>
        {VOLUMES.map((key) => {
          const percent = Math.round(settings.volumes[key] * 100);
          return (
            <label key={key} className="volume">
              <span className="strong">
                {format(t.settings.volume, { label: t.settings.volumes[key], percent })}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                data-testid={`volume-${key}`}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    volumes: { ...settings.volumes, [key]: Number(event.target.value) / 100 },
                  })
                }
              />
            </label>
          );
        })}
        <p className="small muted">{t.settings.soundHint}</p>
        {Object.values(music.slots).every((tracks) => tracks.length === 0) && (
          <p className="small muted">{t.settings.noMusic}</p>
        )}
      </Card>
      <Card title={t.settings.journal}>
        <p className="small muted">{t.settings.journalHint}</p>
        <button
          type="button"
          className="button"
          disabled={!journal || journal.length === 0}
          onClick={() => journal && exportJournal(state, journal)}
        >
          {format(t.settings.exportJournal, { count: journal?.length ?? 0 })}
        </button>
      </Card>
      <VersionCard onBeforeUpdate={() => save()} />
    </div>
  );
}

/** The version of the game, and its update when the phone found a new one. */
function VersionCard({ onBeforeUpdate }: { onBeforeUpdate: () => void }) {
  const texts = t.settings;
  const { available, check } = useUpdates();
  const date = formatBuildDate(Date.parse(BUILD.date));
  return (
    <Card title={texts.versionHeading} testId="version">
      <p className="small strong">
        {BUILD.number
          ? format(texts.build, { number: BUILD.number, date })
          : format(texts.buildLocal, { date })}
      </p>
      <p className="tiny muted">
        {format(texts.buildDetails, { commit: BUILD.commit ?? '—', format: FORMAT_VERSION })}
      </p>
      {available ? (
        <>
          <p className="small">{texts.updateAvailable}</p>
          <button
            type="button"
            className="button primary block"
            onClick={() => {
              onBeforeUpdate();
              applyUpdate();
            }}
          >
            {texts.update}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="button block"
            disabled={check === 'checking'}
            onClick={() => void checkForUpdate()}
          >
            {check === 'checking' ? texts.checking : texts.checkUpdate}
          </button>
          {check === 'upToDate' && <p className="small muted">{texts.upToDate}</p>}
          {check === 'failed' && <p className="small muted">{texts.checkFailed}</p>}
        </>
      )}
    </Card>
  );
}
