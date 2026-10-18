import { gameContent } from '@cle/content';
import { createEngine } from '@cle/engine';

/** The game engine, bound to the content built into the app. */
export const engine = createEngine(gameContent);
