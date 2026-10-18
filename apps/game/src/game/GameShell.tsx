import type { TutorialTrigger } from '@cle/content';
import type { GameAction, GameEvent } from '@cle/engine';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GameSession } from '../session/game-session.ts';
import { saveSettings, type Settings } from '../settings.ts';
import { t, texts } from '../texts.ts';
import { Icon, type IconName } from '../ui/Icon.tsx';
import {
  GameContext,
  type GameContextValue,
  type Navigation,
  NavigationContext,
  type Route,
  type TabId,
  type TrackedScreen,
} from './context.tsx';
import { StatusBar } from './StatusBar.tsx';
import { TutorialBubble, tutorialReaction } from './Tutorial.tsx';
import { AssetsTab } from '../screens/AssetsTab.tsx';
import { DecisionsTab } from '../screens/DecisionsTab.tsx';
import { ListingScreen } from '../screens/ListingScreen.tsx';
import { ListingsScreen } from '../screens/ListingsScreen.tsx';
import { MapTab } from '../screens/MapTab.tsx';
import { MenuTab } from '../screens/MenuTab.tsx';
import { PropertyScreen } from '../screens/PropertyScreen.tsx';
import { PurchaseScreen } from '../screens/PurchaseScreen.tsx';
import { RentScreen } from '../screens/RentScreen.tsx';
import { SettingsScreen } from '../screens/SettingsScreen.tsx';
import { SectionScreen } from '../screens/SectionScreen.tsx';
import { StreetTab } from '../screens/StreetTab.tsx';
import { PANORAMA_QUERY, useMediaQuery, WIDE_QUERY } from '../ui/media.ts';
import { StreetWorld } from '../world/StreetWorld.tsx';

const TABS: { id: TabId; icon: IconName }[] = [
  { id: 'street', icon: 'street' },
  { id: 'map', icon: 'map' },
  { id: 'decisions', icon: 'decisions' },
  { id: 'assets', icon: 'assets' },
  { id: 'menu', icon: 'menu' },
];

const EMPTY_STACKS: Record<TabId, Route[]> = {
  street: [],
  map: [],
  decisions: [],
  assets: [],
  menu: [],
};

/** Engine events the tutorial listens to. */
const TUTORIAL_EVENTS: Partial<Record<GameEvent['type'], TutorialTrigger>> = {
  visitDone: 'event:visitDone',
  offerMade: 'event:offerMade',
  compromisSigned: 'event:compromisSigned',
  loanRequested: 'event:loanRequested',
  deedSigned: 'event:deedSigned',
  monthlyStatement: 'event:monthlyStatement',
};

interface Props {
  session: GameSession;
  slot: number;
  onSave: (silent?: boolean) => void;
  onExport: () => void;
  onQuit: () => void;
  notify: (message: string) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
}

/** The game: status bar, the five tabs and their screens (docs/04, 4.3 and 4.4). */
export function GameShell({
  session,
  slot,
  onSave,
  onExport,
  onQuit,
  notify,
  settings,
  onSettings,
}: Props) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [tab, setTab] = useState<TabId>('street');
  const [stacks, setStacks] = useState(EMPTY_STACKS);
  const [shownStep, setShownStep] = useState<string | null>(null);

  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);

  const raise = useCallback(
    (triggers: TutorialTrigger[]) => {
      if (triggers.length === 0) return;
      const reaction = tutorialReaction(session.getSnapshot().state, triggers, shownStep);
      if (!reaction) return;
      if ('show' in reaction) setShownStep(reaction.show);
      else session.dispatch({ type: 'tutorial/set', step: reaction.advance });
    },
    [session, shownStep],
  );

  useEffect(
    () =>
      session.onEvents((events) =>
        raise(
          events
            .map((event) => TUTORIAL_EVENTS[event.type])
            .filter((trigger): trigger is TutorialTrigger => trigger !== undefined),
        ),
      ),
    [session, raise],
  );

  const stack = stacks[tab];
  const route = stack.at(-1);
  const wide = useMediaQuery(WIDE_QUERY);
  const panorama = useMediaQuery(PANORAMA_QUERY);
  // The street is drawn once and kept: shown on the « Rue » tab, and always on wide screens.
  const streetRoot = tab === 'street' && !route;
  const showStreet = wide || streetRoot;
  const shellClass = [
    'shell',
    streetRoot && !wide ? 'street-mode' : '',
    wide ? 'wide' : '',
    panorama && !wide ? (streetRoot ? 'panorama' : 'rotate') : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, route]);

  const nav = useMemo<Navigation>(
    () => ({
      tab,
      push: (next) => setStacks((all) => ({ ...all, [tab]: [...all[tab], next] })),
      pop: () => setStacks((all) => ({ ...all, [tab]: all[tab].slice(0, -1) })),
      goTab: (next, nextRoute) => {
        setTab(next);
        setStacks((all) => ({ ...all, [next]: nextRoute ? [nextRoute] : [] }));
      },
      track: (screen: TrackedScreen) => raise([`screen:${screen}`]),
    }),
    [tab, raise],
  );

  const act = useCallback(
    (action: GameAction, success?: string) => {
      const result = session.dispatch(action);
      if (!result.ok) {
        notify(texts.refusals[result.reason.code]);
        return null;
      }
      if (success) notify(success);
      return result.events;
    },
    [session, notify],
  );

  const game = useMemo<GameContextValue>(
    () => ({
      session,
      snapshot,
      state: snapshot.state,
      settings,
      setSettings: (next) => {
        saveSettings(next);
        onSettings(next);
      },
      act,
      notify,
      save: () => onSave(false),
      exportGame: onExport,
      quit: onQuit,
      slot,
    }),
    [session, snapshot, settings, onSettings, act, notify, onSave, onExport, onQuit, slot],
  );

  return (
    <GameContext.Provider value={game}>
      <NavigationContext.Provider value={nav}>
        <div className={shellClass}>
          <StatusBar />
          <div className="street-stage" hidden={!showStreet}>
            <StreetWorld active={showStreet} />
          </div>
          <main className="content" key={`${tab}-${stack.length}`}>
            <TutorialBubble shownStep={shownStep} />
            {route ? <RouteScreen route={route} /> : <TabRoot tab={tab} wide={wide} />}
          </main>
          {panorama && !wide && !streetRoot && (
            <div className="rotate-notice" role="status">
              <p>{t.common.rotate}</p>
            </div>
          )}
          <nav className="tab-bar" aria-label={t.tabs.street}>
            {TABS.map(({ id, icon }) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => nav.goTab(id)}
              >
                <Icon name={icon} />
                {t.tabs[id]}
                {id === 'decisions' && snapshot.decisions.length > 0 && (
                  <span className="counter">{snapshot.decisions.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </NavigationContext.Provider>
    </GameContext.Provider>
  );
}

function TabRoot({ tab, wide }: { tab: TabId; wide: boolean }) {
  switch (tab) {
    case 'street':
      return <StreetTab inline={wide} />;
    case 'map':
      return <MapTab />;
    case 'decisions':
      return <DecisionsTab />;
    case 'assets':
      return <AssetsTab />;
    case 'menu':
      return <MenuTab />;
  }
}

function RouteScreen({ route }: { route: Route }) {
  switch (route.name) {
    case 'listings':
      return <ListingsScreen neighbourhoodId={route.neighbourhoodId} favorites={route.favorites} />;
    case 'listing':
      return <ListingScreen id={route.id} />;
    case 'purchase':
      return <PurchaseScreen id={route.id} />;
    case 'property':
      return <PropertyScreen id={route.id} initialTab={route.tab} />;
    case 'rent':
      return <RentScreen id={route.id} />;
    case 'settings':
      return <SettingsScreen />;
    case 'section':
      return (
        <SectionScreen neighbourhoodId={route.neighbourhoodId} buildingId={route.buildingId} />
      );
  }
}
