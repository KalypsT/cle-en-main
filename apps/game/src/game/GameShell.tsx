import { music, type TutorialTrigger } from '@cle/content';
import type { GameAction, GameEvent } from '@cle/engine';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { AudioMixer } from '../audio/mixer.ts';
import type { EffectName } from '../audio/effects.ts';
import type { GameSession } from '../session/game-session.ts';
import { saveSettings, type Settings } from '../settings.ts';
import { describeEvent, t, texts } from '../texts.ts';
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
import { useShownAmbience } from './ambience.ts';
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
import { SaleScreen } from '../screens/SaleScreen.tsx';
import { WorksScreen } from '../screens/WorksScreen.tsx';
import { RentScreen } from '../screens/RentScreen.tsx';
import { SettingsScreen } from '../screens/SettingsScreen.tsx';
import { SectionScreen } from '../screens/SectionScreen.tsx';
import { StreetTab } from '../screens/StreetTab.tsx';
import { PANORAMA_QUERY, useMediaQuery, WIDE_QUERY } from '../ui/media.ts';
import { StreetWorld } from '../world/StreetWorld.tsx';
import { AgendaScreen } from '../screens/AgendaScreen.tsx';
import { BankScreen } from '../screens/BankScreen.tsx';
import { BankerScreen } from '../screens/BankerScreen.tsx';
import { SoldPropertyScreen } from '../screens/SoldPropertyScreen.tsx';
import { CitiesScreen } from '../screens/CitiesScreen.tsx';
import { ChallengeScreen } from '../screens/ChallengeScreen.tsx';
import { EventScreen } from '../screens/EventScreen.tsx';
import { ProgressionScreen } from '../screens/ProgressionScreen.tsx';
import { MonthlyReviewScreen, YearReviewScreen } from '../screens/ReviewScreens.tsx';
import { RewindScreen } from '../screens/RewindScreen.tsx';
import { StatisticsScreen } from '../screens/StatisticsScreen.tsx';
import type { Checkpoint } from '../storage/saves.ts';
import { type Overlay, OverlayView } from './Overlays.tsx';
import { ScrollMemory } from './scroll-memory.ts';

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
  onRewind: (checkpoint: Checkpoint) => void;
  onQuit: () => void;
  notify: (message: string) => void;
  settings: Settings;
  onSettings: (settings: Settings) => void;
  /** Tells whether it is night in the game (the « Automatique » theme). */
  onNight: (night: boolean) => void;
  audio: AudioMixer;
}

/** Interface effects of some engine events (docs/05, 5.8). */
function effectOf(event: GameEvent): EffectName | null {
  switch (event.type) {
    case 'monthlyStatement':
      return event.lines.some((line) => line.kind === 'rentalIncome' && line.amount > 0)
        ? 'kaching'
        : null;
    case 'compromisSigned':
    case 'deedSigned':
    case 'saleAgreed':
    case 'propertySold':
      return 'stamp';
    case 'worksStarted':
      return 'drill';
    default:
      return null;
  }
}

/** Overlays that play the celebration music (docs/05, 5.8). */
const FESTIVE: ReadonlySet<Overlay['kind']> = new Set(['month', 'year', 'title']);

/** What an engine event brings over the game (reviews, titles, fresh start, end). */
function overlaysOf(events: GameEvent[], monthly: boolean): Overlay[] {
  const overlays: Overlay[] = [];
  for (const event of events) {
    if (event.type === 'yearStarted') overlays.push({ kind: 'year' });
    else if (event.type === 'monthStarted' && event.month !== 1 && monthly) {
      overlays.push({ kind: 'month' });
    } else if (event.type === 'titleEarned')
      overlays.push({ kind: 'title', titleId: event.titleId });
    else if (event.type === 'freshStart') overlays.push({ kind: 'freshStart' });
    else if (event.type === 'gameOver') overlays.push({ kind: 'gameOver' });
  }
  return overlays;
}

/** The game: status bar, the five tabs and their screens (docs/04, 4.3 and 4.4). */
export function GameShell({
  session,
  slot,
  onSave,
  onExport,
  onRewind,
  onQuit,
  notify,
  settings,
  onSettings,
  onNight,
  audio,
}: Props) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [tab, setTab] = useState<TabId>('street');
  const baseCityId = snapshot.state.player.baseCityId;
  const [viewCityId, setViewCityId] = useState(baseCityId);
  // Moving house brings the player back to his new base.
  const [seenBaseCityId, setSeenBaseCityId] = useState(baseCityId);
  if (seenBaseCityId !== baseCityId) {
    setSeenBaseCityId(baseCityId);
    setViewCityId(baseCityId);
  }
  const [stacks, setStacks] = useState(EMPTY_STACKS);
  const [memory] = useState(() => new Map<string, unknown>());
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

  const shownAmbience = useShownAmbience(snapshot, viewCityId);
  const { ambience } = shownAmbience;
  const night = ambience.moment === 'night';
  useEffect(() => onNight(night), [night, onNight]);
  const [overlays, setOverlays] = useState<Overlay[]>(() =>
    session.getSnapshot().state.gameOver ? [{ kind: 'gameOver' }] : [],
  );
  const overlay = overlays[0];
  const resumeSpeed = useRef<number | null>(null);
  const celebrating = overlay !== undefined && FESTIVE.has(overlay.kind);
  useEffect(
    () => audio.setMusic(celebrating ? 'celebration' : music.slotByMoment[ambience.moment]),
    [audio, celebrating, ambience.moment],
  );
  useEffect(
    () =>
      session.onEvents((events, state) => {
        for (const event of events) {
          const effect = effectOf(event);
          if (effect) audio.effect(effect);
        }
        // A refused offer is told at once, wherever the player is.
        const bad = events.filter(
          (event) =>
            (event.type === 'offerAnswered' && event.answer === 'refused') ||
            event.type === 'counterOfferExpired',
        );
        if (bad.length > 0) {
          notify(
            bad
              .map((event) => describeEvent(event, state))
              .filter(Boolean)
              .join(' '),
          );
        }
        const fresh = overlaysOf(events, settings.monthlyReview);
        if (fresh.length === 0) return;
        // The clock waits while a review or a celebration is open, then goes on at its speed.
        if (resumeSpeed.current === null) {
          resumeSpeed.current = session.getSnapshot().speed;
          session.setSpeed(0);
        }
        setOverlays((queue) => [...queue, ...fresh]);
      }),
    [session, audio, notify, settings.monthlyReview],
  );
  const closeOverlay = useCallback(() => {
    setOverlays((queue) => queue.slice(1));
    if (overlays.length <= 1 && resumeSpeed.current !== null) {
      if (resumeSpeed.current > 0) session.setSpeed(resumeSpeed.current);
      resumeSpeed.current = null;
    }
  }, [overlays.length, session]);

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

  const [scrolls] = useState(() => new ScrollMemory());
  const depth = stack.length;

  useEffect(() => {
    window.scrollTo(0, scrolls.get(tab, depth));
  }, [scrolls, tab, depth]);

  const nav = useMemo<Navigation>(
    () => ({
      tab,
      cityId: viewCityId,
      memory,
      setCityId: setViewCityId,
      push: (next) => {
        scrolls.save(tab, depth, window.scrollY);
        scrolls.forget(tab, depth + 1);
        setStacks((all) => ({ ...all, [tab]: [...all[tab], next] }));
      },
      pop: () => {
        scrolls.forget(tab, depth);
        setStacks((all) => ({ ...all, [tab]: all[tab].slice(0, -1) }));
      },
      replace: (next) => setStacks((all) => ({ ...all, [tab]: [...all[tab].slice(0, -1), next] })),
      goTab: (next, nextRoute) => {
        scrolls.save(tab, depth, window.scrollY);
        scrolls.forgetTab(next);
        setTab(next);
        setStacks((all) => ({ ...all, [next]: nextRoute ? [nextRoute] : [] }));
      },
      selectTab: (next) => {
        scrolls.save(tab, depth, window.scrollY);
        if (next === tab) {
          scrolls.forgetTab(next);
          setStacks((all) => ({ ...all, [next]: [] }));
        }
        setTab(next);
      },
      track: (screen: TrackedScreen) => raise([`screen:${screen}`]),
    }),
    [tab, depth, scrolls, memory, viewCityId, raise],
  );

  // The phone's back button goes back one screen, then to the street; on the street it does
  // nothing, so the game is never left by mistake. A history entry is kept above the page's
  // own, put back after each press (and at each touch, which Chrome needs to honour it).
  const backRef = useRef({ tab, depth: stack.length, nav });
  useEffect(() => {
    backRef.current = { tab, depth: stack.length, nav };
  }, [tab, stack.length, nav]);
  useEffect(() => {
    const MARK = 'cle-en-main.back';
    const arm = () => {
      if ((history.state as { mark?: string } | null)?.mark !== MARK) {
        history.pushState({ mark: MARK }, '');
      }
    };
    const onBack = () => {
      const { tab: current, depth, nav: navigation } = backRef.current;
      if (depth > 0) navigation.pop();
      else if (current !== 'street') navigation.goTab('street');
      arm();
    };
    arm();
    window.addEventListener('popstate', onBack);
    window.addEventListener('pointerdown', arm);
    return () => {
      window.removeEventListener('popstate', onBack);
      window.removeEventListener('pointerdown', arm);
    };
  }, []);

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
      ambience: shownAmbience,
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
      audio,
      rewind: onRewind,
    }),
    [
      session,
      snapshot,
      shownAmbience,
      settings,
      onSettings,
      act,
      notify,
      onSave,
      onExport,
      onQuit,
      slot,
      audio,
      onRewind,
    ],
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
          {overlay && (
            <OverlayView
              overlay={overlay}
              onClose={closeOverlay}
              onQuit={onQuit}
              onShowChronicle={() => {
                setOverlays([]);
                nav.goTab('menu', { name: 'progression' });
              }}
            />
          )}
          <nav className="tab-bar" aria-label={t.tabs.street}>
            {TABS.map(({ id, icon }) => (
              <button
                key={id}
                type="button"
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => nav.selectTab(id)}
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
      return <ListingsScreen route={route} />;
    case 'listing':
      return <ListingScreen id={route.id} />;
    case 'purchase':
      return <PurchaseScreen id={route.id} />;
    case 'property':
      return <PropertyScreen id={route.id} initialTab={route.tab} />;
    case 'rent':
      return <RentScreen id={route.id} />;
    case 'works':
      return <WorksScreen id={route.id} />;
    case 'sale':
      return <SaleScreen id={route.id} />;
    case 'settings':
      return <SettingsScreen />;
    case 'event':
      return <EventScreen id={route.id} />;
    case 'challenge':
      return <ChallengeScreen />;
    case 'progression':
      return <ProgressionScreen />;
    case 'statistics':
      return <StatisticsScreen />;
    case 'agenda':
      return <AgendaScreen />;
    case 'cities':
      return <CitiesScreen />;
    case 'bank':
      return <BankScreen />;
    case 'banker':
      return <BankerScreen id={route.id} />;
    case 'soldProperty':
      return <SoldPropertyScreen id={route.id} />;
    case 'monthReview':
      return <MonthlyReviewScreen />;
    case 'yearReview':
      return <YearReviewScreen />;
    case 'rewind':
      return <RewindScreen />;
    case 'section':
      return (
        <SectionScreen neighbourhoodId={route.neighbourhoodId} buildingId={route.buildingId} />
      );
  }
}
