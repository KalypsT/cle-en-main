import { timeSettings } from '@cle/content';
import type { GameEvent, GameState } from '@cle/engine';
import { useCallback, useEffect, useState } from 'react';
import { engine } from './engine.ts';
import { GameShell } from './game/GameShell.tsx';
import { PwaStatus } from './PwaStatus.tsx';
import { CreateGameScreen, type NewGameChoices } from './screens/CreateGameScreen.tsx';
import { SlotsScreen } from './screens/SlotsScreen.tsx';
import { TitleScreen } from './screens/TitleScreen.tsx';
import { GameSession } from './session/game-session.ts';
import { loadSettings, type Settings } from './settings.ts';
import { exportGame } from './storage/files.ts';
import { loadFromSlot, saveToSlot, type SlotId } from './storage/saves.ts';
import { t, texts } from './texts.ts';

type Screen =
  | { name: 'title' }
  | { name: 'slots'; mode: 'new' | 'continue' }
  | { name: 'create'; slot: SlotId }
  | { name: 'game'; slot: SlotId; session: GameSession };

const NOTICE_DURATION_MS = 3000;

/**
 * End-to-end tests open the game with `?e2e`: a fixed seed and start date, a
 * faster clock, and time paused on start. It changes nothing else.
 */
const E2E = new URLSearchParams(window.location.search).has('e2e');
const E2E_SEED = 20261018;
const E2E_START = { year: 2026, month: 10, day: 18 };
const E2E_SECONDS_PER_DAY = 1;

/** Today's date on the device: a new game starts on the real current day (docs/02, 2.1). */
function today() {
  if (E2E) return E2E_START;
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** A fresh uint32 seed for a new game; only the interface may use system randomness. */
function randomSeed(): number {
  if (E2E) return E2E_SEED;
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [notice, setNotice] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const notify = useCallback((message: string) => setNotice(message), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const save = useCallback(
    async (slot: SlotId, state: GameState, silent = false) => {
      try {
        await saveToSlot(slot, state);
        if (!silent) notify(t.menu.saved);
      } catch {
        notify(texts.errors.saveFailed);
      }
    },
    [notify],
  );

  // Read by the session at each new decision: the switch applies at once.
  const autoPause = useCallback(() => loadSettings().autoPause, []);

  const play = useCallback(
    (slot: SlotId, state: GameState) => {
      // Automatic save on the first day of each month (docs/02, section 2.7).
      const onEvents = (events: GameEvent[], current: GameState) => {
        if (events.some((event) => event.type === 'monthStarted')) void save(slot, current, true);
      };
      const session = new GameSession(state, onEvents, {
        autoPause,
        ...(E2E ? { realSecondsPerGameDay: E2E_SECONDS_PER_DAY, initialSpeed: 0 } : {}),
      });
      setScreen({ name: 'game', slot, session });
    },
    [save, autoPause],
  );

  const startNewGame = async (slot: SlotId, choices: NewGameChoices) => {
    const state = engine.createGame({
      seed: randomSeed(),
      startDate: today(),
      startHour: timeSettings.startHour,
      jobId: choices.jobId,
      name: choices.name,
      avatar: choices.avatar,
      tutorial: choices.tutorial,
    });
    await save(slot, state, true);
    play(slot, state);
  };

  const loadGame = async (slot: SlotId) => {
    try {
      const state = await loadFromSlot(slot);
      if (state) play(slot, state);
    } catch {
      notify(texts.errors.loadFailed);
    }
  };

  const importGame = async (slot: SlotId, state: GameState) => {
    await save(slot, state, true);
    play(slot, state);
  };

  return (
    <div className="app">
      {screen.name === 'title' && (
        <TitleScreen
          onNewGame={() => setScreen({ name: 'slots', mode: 'new' })}
          onContinue={() => setScreen({ name: 'slots', mode: 'continue' })}
        />
      )}
      {screen.name === 'slots' && (
        <SlotsScreen
          mode={screen.mode}
          onNewGame={(slot) => setScreen({ name: 'create', slot })}
          onLoad={(slot) => void loadGame(slot)}
          onImport={(slot, state) => void importGame(slot, state)}
          onBack={() => setScreen({ name: 'title' })}
          notify={notify}
        />
      )}
      {screen.name === 'create' && (
        <CreateGameScreen
          onStart={(choices) => void startNewGame(screen.slot, choices)}
          onBack={() => setScreen({ name: 'slots', mode: 'new' })}
        />
      )}
      {screen.name === 'game' && (
        <GameShell
          session={screen.session}
          slot={screen.slot}
          onSave={(silent) => void save(screen.slot, screen.session.getSnapshot().state, silent)}
          onExport={() => exportGame(screen.session.getSnapshot().state)}
          onQuit={() => setScreen({ name: 'title' })}
          notify={notify}
          settings={settings}
          onSettings={setSettings}
        />
      )}
      <div className="notice" role="status" aria-live="polite">
        {notice}
      </div>
      <PwaStatus />
    </div>
  );
}
