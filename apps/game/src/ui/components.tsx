import { DPE_LABELS, type DpeLabel } from '@cle/engine';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../texts.ts';
import { Icon, type IconName } from './Icon.tsx';

/** Header of a pushed screen: back button, title, optional action. */
export function ScreenHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack?: (() => void) | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <header className="screen-header">
      {onBack ? (
        <button type="button" className="icon-button" onClick={onBack} aria-label={t.common.back}>
          <Icon name="back" />
        </button>
      ) : (
        <span className="spacer" />
      )}
      <h1 className="h2">{title}</h1>
      {action ?? <span className="spacer" />}
    </header>
  );
}

/** A card that folds: its heading opens and closes it (game feel, lot 3). */
export interface Fold {
  open: boolean;
  onToggle: () => void;
}

export function Card({
  title,
  aside,
  tint,
  children,
  testId,
  fold,
  id,
}: {
  title?: ReactNode | undefined;
  aside?: ReactNode | undefined;
  tint?: 'amber' | 'brick' | 'accent' | undefined;
  children?: ReactNode | undefined;
  testId?: string | undefined;
  fold?: Fold | undefined;
  /** Anchor, to bring the card into view. */
  id?: string | undefined;
}) {
  const open = fold?.open ?? true;
  return (
    <section
      className={`card${tint ? ` tinted-${tint}` : ''}${fold ? ' foldable' : ''}`}
      data-testid={testId}
      id={id}
    >
      {(title || aside) &&
        (fold ? (
          <button
            type="button"
            className="card-heading card-fold"
            aria-expanded={open}
            onClick={fold.onToggle}
          >
            {title && <h2 className="h3">{title}</h2>}
            <span className="row">
              {aside}
              <span className="card-chevron" aria-hidden="true">
                <Icon name="chevron" size={18} />
              </span>
            </span>
          </button>
        ) : (
          <div className="card-heading">
            {title && <h2 className="h3">{title}</h2>}
            {aside}
          </div>
        ))}
      {open && children}
    </section>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-title">
      <h2 className="h2">{title}</h2>
      {action}
    </div>
  );
}

/** A tappable row of a list: thumbnail, title, subtitle, a value on the right. */
export function ListRow({
  icon,
  thumb,
  title,
  subtitle,
  extra,
  side,
  onClick,
  testId,
}: {
  icon?: IconName | undefined;
  thumb?: ReactNode | undefined;
  title: ReactNode;
  subtitle?: ReactNode | undefined;
  extra?: ReactNode | undefined;
  side?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
}) {
  return (
    <button type="button" className="list-row" onClick={onClick} data-testid={testId}>
      {(thumb || icon) && <span className="thumb">{thumb ?? (icon && <Icon name={icon} />)}</span>}
      <span className="grow stack tight">
        <span className="title">{title}</span>
        {subtitle && <span className="subtitle">{subtitle}</span>}
        {extra && <span className="row wrap">{extra}</span>}
      </span>
      {side && <span className="side">{side}</span>}
      <span className="chevron">
        <Icon name="chevron" size={18} />
      </span>
    </button>
  );
}

export function Badge({
  tone,
  icon,
  children,
  testId,
}: {
  tone?: 'accent' | 'amber' | 'brick' | 'green' | undefined;
  icon?: IconName | undefined;
  children: ReactNode;
  testId?: string | undefined;
}) {
  return (
    <span className={`badge${tone ? ` ${tone}` : ''}`} data-testid={testId}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Tile({
  label,
  value,
  hint,
  onClick,
  testId,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode | undefined;
  onClick?: (() => void) | undefined;
  testId?: string | undefined;
  children?: ReactNode | undefined;
}) {
  const content = (
    <>
      <span className="tile-label">{label}</span>
      <span className="tile-value" data-testid={testId}>
        {value}
      </span>
      {hint && <span className="tiny muted">{hint}</span>}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="tile" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="tile">{content}</div>
  );
}

/** The « ? » next to an amount: explains it in a bottom sheet (docs/04, 4.6). */
export function Why({ title, children }: { title?: string | undefined; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="why"
        aria-label={title ?? t.common.why}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <span>{t.common.whyShort}</span>
      </button>
      {open && (
        <BottomSheet title={title ?? t.common.why} onClose={() => setOpen(false)}>
          {children}
        </BottomSheet>
      )}
    </>
  );
}

/** Label and amount, with an optional explanation. */
export function Amount({
  label,
  value,
  className,
  why,
  whyTitle,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string | undefined;
  why?: ReactNode | undefined;
  whyTitle?: string | undefined;
  testId?: string | undefined;
}) {
  return (
    <div className="stack tight">
      <span className="small muted">{label}</span>
      <span className="row" style={{ gap: 4 }}>
        <span className={`big-number ${className ?? ''}`} data-testid={testId}>
          {value}
        </span>
        {why && <Why title={whyTitle}>{why}</Why>}
      </span>
    </div>
  );
}

/** Lines of a breakdown: label, value. */
export function KeyValues({
  rows,
}: {
  rows: { label: ReactNode; value: ReactNode; className?: string; total?: boolean }[];
}) {
  return (
    <dl className="kv">
      {rows.map((row, index) => (
        <div key={index} style={{ display: 'contents' }}>
          <dt className={row.total ? 'total strong' : undefined}>{row.label}</dt>
          <dd className={`${row.total ? 'total ' : ''}${row.className ?? ''}`}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="sheet-grip" />
        <div className="row between">
          <h2 className="h2" id={titleId}>
            {title}
          </h2>
          <button type="button" className="link-button" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch">
      <span className="stack tight">
        <span className="strong">{label}</span>
        {hint && <span className="small muted">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function DpeLetter({ dpe }: { dpe: DpeLabel }) {
  return <span className={`dpe-letter dpe-${dpe}`}>{dpe}</span>;
}

/** The A … G scale with the current class raised. */
export function DpeBar({ dpe }: { dpe: DpeLabel }) {
  return (
    <div className="dpe" aria-hidden="true">
      {DPE_LABELS.map((label) => (
        <span key={label} className={`dpe-${label}`} data-current={label === dpe}>
          {label}
        </span>
      ))}
    </div>
  );
}

/** State of an item, 1 … 5, as five dots (with its text next to it). */
export function StateDots({ state }: { state: number }) {
  const level = state <= 2 ? 'low' : state === 3 ? 'mid' : 'high';
  return (
    <span className="state-dots" data-level={level} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((dot) => (
        <i key={dot} data-on={dot <= state} />
      ))}
    </span>
  );
}

export function Empty({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      {children}
    </div>
  );
}

/** Minus / value / plus picker (avatar parts). */
export function Stepper({
  label,
  value,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: {
  label: string;
  value: string;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="stack tight">
      <span className="field-label">{label}</span>
      <div className="stepper">
        <button
          type="button"
          className="icon-button"
          aria-label={previousLabel}
          onClick={onPrevious}
        >
          <Icon name="back" />
        </button>
        <span>{value}</span>
        <button type="button" className="icon-button" aria-label={nextLabel} onClick={onNext}>
          <Icon name="chevron" />
        </button>
      </div>
    </div>
  );
}
