import { FORMAT_VERSION } from '@cle/engine';
import { useGame, useNav } from '../game/context.tsx';
import { format, t } from '../texts.ts';
import { Card, ScreenHeader, Switch } from '../ui/components.tsx';

/** « Réglages » (docs/04): saves, automatic pause, tutorial, theme. */
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
        <p className="small">{t.settings.themeLight}</p>
      </Card>
      <p className="tiny muted">{format(t.settings.version, { version: FORMAT_VERSION })}</p>
    </div>
  );
}
