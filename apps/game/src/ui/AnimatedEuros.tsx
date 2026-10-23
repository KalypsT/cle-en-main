import type { Cents } from '@cle/engine';
import { useEffect, useRef, useState } from 'react';
import { formatEuros, formatSigned } from '../texts.ts';
import { useReducedMotion } from './media.ts';

/** How long the amount takes to roll to its new value. */
const ROLL_MS = 700;
/** How long the green or red flash and the floating difference stay. */
const FLASH_MS = 1400;
/** Below one euro, a change is not worth a flash. */
const MIN_CHANGE: Cents = 100;

interface Change {
  delta: Cents;
  /** Changes key the floating difference, so that each one plays its animation. */
  id: number;
}

/**
 * An amount in whole euros that rolls to its new value, flashes green or red
 * and lets the difference float away (docs/05, 5.6). The exact amount stays
 * in the element named by `testId`, for screen readers and tests; the rolling
 * figure is decoration.
 */
export function AnimatedEuros({
  value,
  testId,
  negative,
}: {
  value: Cents;
  testId?: string;
  negative?: boolean;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const [change, setChange] = useState<Change | null>(null);
  const from = useRef(value);
  const counter = useRef(0);

  useEffect(() => {
    const start = from.current;
    from.current = value;
    const delta = value - start;
    if (Math.abs(delta) < MIN_CHANGE) {
      setShown(value);
      return;
    }
    counter.current += 1;
    setChange({ delta, id: counter.current });
    const clear = setTimeout(() => setChange(null), FLASH_MS);
    if (reduced) {
      setShown(value);
      return () => clearTimeout(clear);
    }
    const began = performance.now();
    let frame = requestAnimationFrame(function roll(now) {
      const progress = Math.min(1, (now - began) / ROLL_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(start + delta * eased));
      if (progress < 1) frame = requestAnimationFrame(roll);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(clear);
      setShown(value);
    };
  }, [value, reduced]);

  const tone = change ? (change.delta > 0 ? ' gain' : ' loss') : '';
  return (
    <span className={`animated-euros${tone}${negative ? ' negative' : ''}`}>
      <span className="sr-only" data-testid={testId}>
        {formatEuros(value)}
      </span>
      <span aria-hidden="true">{formatEuros(shown)}</span>
      {change && !reduced && (
        <span key={change.id} className="money-delta" aria-hidden="true">
          {formatSigned(change.delta)}
        </span>
      )}
    </span>
  );
}
