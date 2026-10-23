import { gameContent } from '@cle/content';
import type { Avatar as AvatarParts, GameEvent, GameState } from '@cle/engine';
import {
  bankerName,
  describeEvent,
  findChallenge,
  format,
  formatEuros,
  formatPercent,
  t,
} from '../texts.ts';
import {
  BANK_CHARACTERS,
  CHARACTER_AVATARS,
  characterMood,
  faceOf,
  type Mood,
  RIVAL_CHARACTERS,
} from '../ui/Avatar.tsx';
import type { IconName } from '../ui/Icon.tsx';

/** A good news told at once over the game (docs/04, 4.6), or an achievement earned. */
export interface GoodNews {
  kind: 'news' | 'achievement';
  text: string;
  /** The achievement's description. */
  detail?: string;
  /** Who brings the news, when it is someone with a face. */
  face?: { parts: AvatarParts; mood: Mood };
  icon: IconName;
}

function character(id: string, mood: Mood): GoodNews['face'] {
  const parts = CHARACTER_AVATARS[id];
  return parts ? { parts, mood: characterMood(id, mood) } : undefined;
}

/**
 * The good news among a batch of engine events. A signed deed has its own
 * scene (the keys), a new title its celebration: they are not told here.
 */
export function goodNewsOf(event: GameEvent, state: GameState): GoodNews | null {
  const news = (icon: IconName, face?: GoodNews['face']): GoodNews | null => {
    const text = describeEvent(event, state);
    return text ? { kind: 'news', text, icon, ...(face ? { face } : {}) } : null;
  };
  switch (event.type) {
    case 'offerAnswered':
      return event.answer === 'accepted' ? news('check') : null;
    case 'loanAnswered': {
      if (event.decision === 'refused' || event.amount === undefined) return null;
      const accepted = event.decision === 'accepted';
      const id = BANK_CHARACTERS[event.bankId];
      const face = id ? character(id, accepted ? 'happy' : 'smile') : undefined;
      return {
        kind: 'news',
        text: format(accepted ? t.goodNews.loanGranted : t.goodNews.loanProposal, {
          banker: bankerName(event.bankId),
          amount: formatEuros(event.amount),
          rate: formatPercent(event.ratePercent ?? 0),
        }),
        icon: 'bank',
        ...(face ? { face } : {}),
      };
    }
    case 'compromisSigned':
      return news('book');
    case 'tenantMovedIn':
      return news('person', { parts: faceOf(event.tenantName), mood: 'happy' });
    case 'worksCompleted':
      // With the before recorded, the end of the works has its own scene (before and after).
      return state.properties.some((o) => o.property.id === event.propertyId && o.lastWorks)
        ? null
        : news('wrench');
    case 'renovationAidPaid':
    case 'propertySold':
      return news('euro');
    case 'saleAgreed':
      return news('tag');
    case 'loanRepaid':
      return news('bank');
    case 'transformationCompleted':
      return news('assets');
    case 'offMarketOffered':
      return news('star');
    case 'challengeWon': {
      const giver = findChallenge(event.challengeId)?.giver;
      return news('trophy', giver ? character(giver, 'happy') : undefined);
    }
    case 'achievementEarned': {
      const achievement = gameContent.achievements.find((a) => a.id === event.achievementId);
      return achievement
        ? {
            kind: 'achievement',
            text: achievement.name,
            detail: achievement.description,
            icon: 'trophy',
          }
        : null;
    }
    default:
      return null;
  }
}

const RIVAL_BEATEN = 'rivalBeaten.';

/** How many times the player beat each rival to a property (`rivalBeaten.<id>` counters). */
export function rivalsBeaten(state: GameState): Record<string, number> {
  const beaten: Record<string, number> = {};
  for (const [key, count] of Object.entries(state.progress.counters)) {
    if (key.startsWith(RIVAL_BEATEN)) beaten[key.slice(RIVAL_BEATEN.length)] = count;
  }
  return beaten;
}

/**
 * The rivals who just lost a property to the player (a compromis signed on
 * what they wanted): they make a face (docs/02, 2.10, « Mme Delaporte en larmes »).
 */
export function rivalNews(before: Record<string, number>, state: GameState): GoodNews[] {
  const texts: Record<string, string> = t.goodNews.rivalBeaten;
  const after = rivalsBeaten(state);
  return Object.entries(after)
    .filter(([id, count]) => count > (before[id] ?? 0) && texts[id])
    .map(([id]) => {
      const face = character(RIVAL_CHARACTERS[id] ?? '', 'upset');
      return { kind: 'news', text: texts[id] ?? '', icon: 'person', ...(face ? { face } : {}) };
    });
}

/** The toast on screen and the news waiting for it. */
export interface GoodNewsQueue {
  shown: GoodNews[] | null;
  waiting: GoodNews[];
}

/** News waiting beyond this are dropped (a long run at ×8 brings many). */
const WAITING_KEPT = 12;

/**
 * The next toast from the waiting news: an achievement alone, or the news that
 * arrived together (several at a time while the clock runs fast).
 */
function nextBatch(waiting: readonly GoodNews[]): GoodNews[] {
  const first = waiting[0];
  if (!first) return [];
  if (first.kind === 'achievement') return [first];
  const batch: GoodNews[] = [];
  for (const news of waiting) {
    if (news.kind !== 'news') break;
    batch.push(news);
  }
  return batch;
}

function showNext(waiting: GoodNews[]): GoodNewsQueue {
  const batch = nextBatch(waiting);
  return batch.length > 0
    ? { shown: batch, waiting: waiting.slice(batch.length) }
    : { shown: null, waiting };
}

/** Fresh news join the queue; they show at once when nothing is on screen. */
export function queueGoodNews(queue: GoodNewsQueue, fresh: GoodNews[]): GoodNewsQueue {
  const waiting = [...queue.waiting, ...fresh].slice(-WAITING_KEPT);
  return queue.shown ? { shown: queue.shown, waiting } : showNext(waiting);
}

/** The toast on screen goes away, the next one comes. */
export function dismissGoodNews(queue: GoodNewsQueue): GoodNewsQueue {
  return showNext(queue.waiting);
}
