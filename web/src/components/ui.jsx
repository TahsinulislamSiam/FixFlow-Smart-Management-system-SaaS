import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx, initials } from '../lib/format.js';
import { PRIORITY_META, STATUS_META, TONE_CLASSES, TONE_SOLID } from '../lib/constants.js';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return (
    <Tag className={cx('surface p-5', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, icon, className }) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex items-start gap-3">
        {icon ? <span className="text-lg leading-none">{icon}</span> : null}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-100 uppercase">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-ink-300">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

const BUTTON_VARIANTS = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 shadow-[0_10px_30px_-12px_rgba(99,102,241,0.9)] border border-brand-400/40',
  secondary: 'bg-white/5 text-ink-100 hover:bg-white/10 border border-ink-400/25',
  ghost: 'bg-transparent text-ink-200 hover:bg-white/6 border border-transparent',
  outline: 'bg-transparent text-brand-300 hover:bg-brand-500/12 border border-brand-400/40',
  danger: 'bg-danger-500/90 text-white hover:bg-danger-400 border border-danger-400/40',
  success: 'bg-ok-500/90 text-white hover:bg-ok-400 border border-ok-400/40',
};

const BUTTON_SIZES = {
  xs: 'px-2.5 py-1 text-xs rounded-lg gap-1',
  sm: 'px-3 py-1.5 text-sm rounded-xl gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-base rounded-2xl gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.secondary,
        BUTTON_SIZES[size] ?? BUTTON_SIZES.md,
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : icon ? <span aria-hidden>{icon}</span> : null}
      {children}
    </button>
  );
}

export function IconButton({ label, icon, className, ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink-400/20 bg-white/4 text-ink-200',
        'transition hover:border-brand-400/40 hover:bg-brand-500/12 hover:text-white',
        className,
      )}
      {...rest}
    >
      <span aria-hidden>{icon}</span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Pills & badges                                                             */
/* -------------------------------------------------------------------------- */

export function Pill({ tone = 'neutral', children, className, ...rest }) {
  return (
    <span className={cx('chip', TONE_CLASSES[tone] ?? TONE_CLASSES.neutral, className)} {...rest}>
      {children}
    </span>
  );
}

export function StatusPill({ status, className }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'neutral' };
  return (
    <Pill tone={meta.tone} className={className}>
      <span className={cx('h-1.5 w-1.5 rounded-full', TONE_SOLID[meta.tone])} />
      {meta.label}
    </Pill>
  );
}

export function PriorityPill({ priority, className }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, tone: 'neutral' };
  return (
    <Pill tone={meta.tone} className={className}>
      {priority === 'CRITICAL' ? <span aria-hidden>▲</span> : null}
      {meta.label}
    </Pill>
  );
}

export function Dot({ tone = 'neutral', pulse = false, className }) {
  return (
    <span className={cx('relative inline-flex h-2 w-2 rounded-full', TONE_SOLID[tone], pulse && 'live-dot', className)} />
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold tracking-wide text-ink-200 uppercase">
          {label}
          {required ? <span className="text-danger-400">*</span> : null}
        </span>
      ) : null}
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-danger-400">{error}</span> : null}
      {!error && hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, invalid, ...rest }) {
  return <input className={cx('field', invalid && 'border-danger-400/70', className)} {...rest} />;
}

export function Textarea({ className, invalid, rows = 4, ...rest }) {
  return <textarea rows={rows} className={cx('field resize-y leading-relaxed', invalid && 'border-danger-400/70', className)} {...rest} />;
}

export function Select({ className, children, invalid, ...rest }) {
  return (
    <select className={cx('field appearance-none bg-[length:0] pr-9', invalid && 'border-danger-400/70', className)} {...rest}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...rest }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2 text-sm text-ink-200', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-ink-400/40 bg-ink-925 accent-brand-500"
        {...rest}
      />
      {label}
    </label>
  );
}

export function SegmentedControl({ options, value, onChange, className }) {
  return (
    <div className={cx('inline-flex flex-wrap gap-1 rounded-xl border border-ink-400/20 bg-ink-925/60 p-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition',
              active ? 'bg-brand-500/85 text-white shadow-[0_8px_20px_-12px_rgba(99,102,241,1)]' : 'text-ink-300 hover:bg-white/6 hover:text-ink-100',
            )}
          >
            {option.label}
            {option.count != null ? (
              <span className={cx('ml-1.5 rounded-md px-1 text-[10px]', active ? 'bg-white/20' : 'bg-white/8 text-ink-300')}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export function Spinner({ size = 'md', className }) {
  const dimensions = { sm: 'h-3.5 w-3.5 border-2', md: 'h-5 w-5 border-2', lg: 'h-9 w-9 border-[3px]' }[size] ?? 'h-5 w-5 border-2';
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx('inline-block animate-spin rounded-full border-current border-t-transparent opacity-80', dimensions, className)}
    />
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-shimmer rounded-xl', className)} />;
}

export function EmptyState({ icon = '📭', title, description, action, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-400/20 bg-white/4 text-2xl">
        <span aria-hidden>{icon}</span>
      </div>
      <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
      {description ? <p className="max-w-sm text-xs leading-relaxed text-ink-300">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Something went wrong"
      description={message}
      action={
        onRetry ? (
          <Button variant="secondary" size="sm" onClick={onRetry} icon="↻">
            Try again
          </Button>
        ) : null
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export function Avatar({ user, size = 36, online, className, ring = true }) {
  const name = user?.name ?? 'Unknown';
  const color = user?.avatar_color ?? '#6366f1';
  return (
    <span className={cx('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <span
        className={cx('flex h-full w-full items-center justify-center rounded-full font-semibold text-white', ring && 'ring-2 ring-ink-950/60')}
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}99)`,
          fontSize: Math.max(10, size * 0.36),
        }}
        title={name}
      >
        {initials(name)}
      </span>
      {online != null ? (
        <span
          className={cx(
            'absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-ink-950',
            online ? 'bg-ok-500' : 'bg-ink-500',
          )}
        />
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Stats & progress                                                           */
/* -------------------------------------------------------------------------- */

export function StatCard({ label, value, hint, tone = 'brand', icon, delta, className, onClick }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'surface surface-raised relative overflow-hidden p-4',
        onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-400/40',
        className,
      )}
    >
      <div className={cx('absolute inset-x-0 top-0 h-[2px]', TONE_SOLID[tone], 'opacity-70')} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wider text-ink-300 uppercase">{label}</p>
        {icon ? <span className="text-base leading-none opacity-80">{icon}</span> : null}
      </div>
      <p className="mt-2 text-3xl leading-none font-semibold tracking-tight text-white">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta != null ? (
          <span className={cx('text-[11px] font-semibold', delta > 0 ? 'text-danger-400' : delta < 0 ? 'text-ok-400' : 'text-ink-400')}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {Math.abs(delta)}%
          </span>
        ) : null}
        {hint ? <span className="text-[11px] text-ink-400">{hint}</span> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'brand', className, showLabel = false }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        <div
          className={cx('h-full rounded-full transition-all duration-500', TONE_SOLID[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel ? <span className="w-9 text-right text-[11px] text-ink-300">{clamped}%</span> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

const MODAL_SIZES = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', closeOnBackdrop = true }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        className="animate-fade-in fixed inset-0 bg-ink-950/80 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx('surface surface-raised animate-pop relative z-10 my-auto w-full p-5 outline-none', MODAL_SIZES[size])}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {subtitle ? <p className="mt-1 text-xs leading-relaxed text-ink-300">{subtitle}</p> : null}
          </div>
          <IconButton label="Close dialog" icon="✕" onClick={onClose} />
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1 scroll-slim">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-ink-400/15 pt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'danger', loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-200">{message}</p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function Tooltip({ text, children }) {
  return (
    <span title={text} className="inline-flex cursor-help items-center">
      {children}
    </span>
  );
}

export function KeyValue({ label, value, className }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 py-1.5', className)}>
      <span className="text-xs text-ink-400">{label}</span>
      <span className="text-right text-sm font-medium text-ink-100">{value}</span>
    </div>
  );
}

export function SectionTitle({ children, action, className }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">{children}</h2>
      {action}
    </div>
  );
}
