import { useEffect, useRef, useState } from 'react';
import { t } from '../texts.ts';
import { BottomSheet } from './components.tsx';

interface Request {
  message: string;
  resolve: (confirmed: boolean) => void;
}

let show: ((request: Request) => void) | null = null;

/**
 * Asks the player to confirm, in a sheet of the game: the frame of DomoThib Games blocks
 * `window.confirm` (docs/domothib.md, §6). Resolves false when the sheet is closed.
 */
export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ message, resolve });
    else resolve(false);
  });
}

/** Shows the questions of `askConfirm`; rendered once, by the app. */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const pending = useRef<Request | null>(null);
  useEffect(() => {
    show = (next) => {
      pending.current?.resolve(false);
      pending.current = next;
      setRequest(next);
    };
    return () => {
      show = null;
      pending.current?.resolve(false);
      pending.current = null;
    };
  }, []);
  if (!request) return null;
  const answer = (confirmed: boolean) => {
    request.resolve(confirmed);
    pending.current = null;
    setRequest(null);
  };
  return (
    <BottomSheet title={t.common.confirmTitle} onClose={() => answer(false)}>
      <p data-testid="confirm-message">{request.message}</p>
      <div className="row wrap">
        <button
          type="button"
          className="button primary"
          data-testid="confirm-yes"
          onClick={() => answer(true)}
        >
          {t.common.confirm}
        </button>
        <button type="button" className="button" onClick={() => answer(false)}>
          {t.common.cancel}
        </button>
      </div>
    </BottomSheet>
  );
}
