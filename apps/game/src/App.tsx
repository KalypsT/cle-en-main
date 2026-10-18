import { timeSettings } from '@cle/content';
import { createGame, type GameEvent, type GameState } from '@cle/engine';
import { useCallback, useEffect, useState } from 'react';
import { PwaStatus } from './PwaStatus.tsx';
import { GameScreen } from './screens/GameScreen.tsx';
import { SlotsScreen } from './screens/SlotsScreen.tsx';
import { TitleScreen } from './screens/TitleScreen.tsx';
import { GameSession } from './session/game-session.ts';
import { loadFromSlot, saveToSlot, type SlotId } from './storage/saves.ts';
import { texts } from './texts.ts';

type Screen =
  | { name: 'title' }
  | { name: 'slots'; mode: 'new' | 'continue' }
  | { name: 'game'; slot: SlotId; session: GameSession };

const NOTICE_DURATION_MS = 3000;

/** Today's date on the device: a new game starts on the real current day (docs/02, 2.1). */
function today() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** A fresh uint32 seed for a new game; only the interface may use system randomness. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [notice, setNotice] = useState<string | null>(null);

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
        if (!silent) notify(texts.game.saved);
      } catch {
        notify(texts.errors.saveFailed);
      }
    },
    [notify],
  );

  const play = useCallback(
    (slot: SlotId, state: GameState) => {
      // Automatic save on the first day of each month (docs/02, section 2.7).
      const onEvents = (events: GameEvent[], current: GameState) => {
        if (events.some((event) => event.type === 'monthStarted')) void save(slot, current, true);
      };
      setScreen({ name: 'game', slot, session: new GameSession(state, onEvents) });
    },
    [save],
  );

  const startNewGame = async (slot: SlotId) => {
    const state = createGame({
      seed: randomSeed(),
      startDate: today(),
      startHour: timeSettings.startHour,
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
          onNewGame={(slot) => void startNewGame(slot)}
          onLoad={(slot) => void loadGame(slot)}
          onImport={(slot, state) => void importGame(slot, state)}
          onBack={() => setScreen({ name: 'title' })}
          notify={notify}
        />
      )}
      {screen.name === 'game' && (
        <GameScreen
          session={screen.session}
          onSave={() => void save(screen.slot, screen.session.getSnapshot().state)}
          onMenu={() => setScreen({ name: 'title' })}
          notify={notify}
        />
      )}
      <div className="notice" role="status" aria-live="polite">
        {notice}
      </div>
      <PwaStatus />
    </div>
  );
}
