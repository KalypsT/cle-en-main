import type { Cents } from '@cle/engine';
import { useEffect } from 'react';
import { format, formatEuros, propertyLabel, t } from '../texts.ts';
import { Facade } from '../ui/Facade.tsx';
import { useReducedMotion } from '../ui/media.ts';
import { useGame } from './context.tsx';

/** The short scene of the later purchases closes by itself. */
const SHORT_SCENE_MS = 3600;

/**
 * The key of the app icon (public/icons/icon.svg): a house for a head, an
 * amber lock, lying on its side and pointing right.
 */
function HouseKey() {
  return (
    <g>
      <g fill="#e8b04c" stroke="#b9852a" strokeWidth="6" strokeLinejoin="round">
        <path d="M156 150 L242 230 H222 V332 H90 V230 H70 Z" />
        <rect x="222" y="262" width="214" height="40" />
        <path d="M392 302 V346 H360 V302 Z M336 302 V334 H310 V302 Z" />
      </g>
      <circle cx="156" cy="262" r="20" fill="#7a4f12" />
      <path d="M146 274 H166 L173 310 H139 Z" fill="#7a4f12" />
    </g>
  );
}

/** The key slides into a brass lock and turns: the door is yours. */
function KeyInLock({ short }: { short: boolean }) {
  return (
    <svg className={`keys-lock${short ? ' short' : ''}`} viewBox="0 0 320 120" aria-hidden="true">
      <g className="keys-rays" transform="translate(236 60)">
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x="-2"
            y="-58"
            width="4"
            height="16"
            rx="2"
            transform={`rotate(${i * 36})`}
          />
        ))}
      </g>
      <g className="keys-key">
        <g transform="translate(87 -45) scale(0.36)">
          <HouseKey />
        </g>
      </g>
      {/* The plate comes over the key: its tip is in the lock. */}
      <g className="keys-plate">
        <rect
          x="208"
          y="14"
          width="56"
          height="92"
          rx="14"
          fill="#e0ad3c"
          stroke="#b98522"
          strokeWidth="3"
        />
        <circle cx="236" cy="52" r="9" fill="#3d2a0c" />
        <path d="M231 56 H241 L245 76 H227 Z" fill="#3d2a0c" />
      </g>
    </svg>
  );
}

const CONFETTI = 24;

/**
 * The handing over of the keys at the deed (docs/04, 4.6; the game's name):
 * the whole scene for the first purchase, a short one for the next ones,
 * which closes by itself.
 */
export function KeysScene({
  propertyId,
  price,
  first,
  onClose,
  onShowProperty,
}: {
  propertyId: string;
  price: Cents;
  first: boolean;
  onClose: () => void;
  onShowProperty: () => void;
}) {
  const { state } = useGame();
  const reduced = useReducedMotion();
  const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
  const keys = t.celebration.keys;

  useEffect(() => {
    if (first) return;
    const timer = setTimeout(onClose, SHORT_SCENE_MS);
    return () => clearTimeout(timer);
  }, [first, onClose]);

  const label = owned ? propertyLabel(owned.property) : '';
  return (
    <div
      className={`overlay keys-overlay${first ? ' festive' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={first ? keys.firstTitle : keys.title}
    >
      <div className={`overlay-body keys-body${first ? '' : ' short'}`} data-testid="overlay-keys">
        {first && !reduced && (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: CONFETTI }, (_, i) => (
              <span
                key={i}
                style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.18}s` }}
              />
            ))}
          </div>
        )}
        <KeyInLock short={!first} />
        <div className="keys-text">
          <p className="toast-kicker keys-kicker">{keys.kicker}</p>
          <p className="display h1 celebration-title">{first ? keys.firstTitle : keys.title}</p>
          {owned && (
            <div className="keys-facade">
              <Facade property={owned.property} owned height={first ? 150 : 96} />
            </div>
          )}
          <p>{format(first ? keys.firstText : keys.text, { property: label })}</p>
          <p className="small muted">{format(keys.price, { price: formatEuros(price) })}</p>
        </div>
        <div className="row">
          {owned && (
            <button type="button" className="button grow" onClick={onShowProperty}>
              {keys.see}
            </button>
          )}
          <button type="button" className="button primary grow" onClick={onClose}>
            {keys.continue}
          </button>
        </div>
      </div>
    </div>
  );
}
