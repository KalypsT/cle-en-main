import type { GameEvent } from './events.ts';
import type { GameState } from './state.ts';
import type { BankActionRefusal } from './systems/banking.ts';

/** Every player or bot decision goes through one of these actions. */
export type GameAction =
  | { type: 'bank/meet'; bankId: string }
  | { type: 'bank/refinance'; loanId: string; bankId: string }
  | { type: 'job/resign' };

export type RefusalCode = BankActionRefusal | 'job.alreadyResigned';

/** Machine-readable refusal; the interface maps `code` to a text from `content/`. */
export interface Refusal {
  code: RefusalCode;
}

export type DispatchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; reason: Refusal };
