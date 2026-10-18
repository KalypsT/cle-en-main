import { music } from '@cle/content';
import { FORMAT_VERSION } from '@cle/engine';
import { QUALITIES, THEMES, type Volumes } from '../settings.ts';
import { useGame, useNav } from '../game/context.tsx';
import { format, t } from '../texts.ts';
import { Card, Chip, ScreenHeader, Segmented, Switch } from '../ui/components.tsx';

const VOLUMES: readonly (keyof Volumes)[] = ['music', 'ambience', 'effects'];

/** « Réglages » (docs/04, 4.5): saves, time, tutorial, theme, street graphics and sound. */
export function SettingsScreen() {
  const { state, act, settings, setSettings, save, exportGame, slot } = useGame();
  const nav = useNav();
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
      </Card>
      <Card title={t.settings.time}>
        <Switch
          label={t.settings.autoPause}
          hint={t.settings.autoPauseHint}
          checked={settings.autoPause}
          onChange={(autoPause) => setSettings({ ...settings, autoPause })}
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
      <p className="tiny muted">{format(t.settings.version, { version: FORMAT_VERSION })}</p>
    </div>
  );
}
