import { Link } from 'react-router-dom';
import { cx, formatCountdown, relativeTime, truncate } from '../lib/format.js';
import { CHART_COLORS, FLAG_META, PRIORITY_META, TONE_SOLID } from '../lib/constants.js';
import { useMeta } from '../context/MetaContext.jsx';
import { Avatar, Pill, PriorityPill, StatusPill } from './ui.jsx';
import { ClockIcon, MapPinIcon } from './icons.jsx';

/** SLA pill: green while comfortable, amber when close, red once breached. */
export function SlaPill({ ticket, className }) {
  if (!ticket.sla_due_at) return null;
  const done = ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status);
  if (done) {
    return (
      <Pill tone={ticket.sla_breached ? 'danger' : 'ok'} className={className}>
        <ClockIcon size={12} />
        {ticket.sla_breached ? 'SLA missed' : 'Met SLA'}
      </Pill>
    );
  }
  const minutes = ticket.sla_due_in_minutes ?? 0;
  const tone = ticket.sla_breached || minutes < 0 ? 'danger' : minutes < 180 ? 'warn' : 'ok';
  return (
    <Pill tone={tone} className={className}>
      <ClockIcon size={12} />
      {formatCountdown(minutes)}
    </Pill>
  );
}

export function FlagChips({ flags = [], max = 3, className }) {
  if (!flags.length) return null;
  return (
    <span className={cx('flex flex-wrap items-center gap-1', className)}>
      {flags.slice(0, max).map((flag) => {
        const meta = FLAG_META[flag] ?? { label: flag, tone: 'warn' };
        return (
          <Pill key={flag} tone={meta.tone}>
            <span aria-hidden>⚠</span>
            {meta.label}
          </Pill>
        );
      })}
      {flags.length > max ? <Pill tone="neutral">+{flags.length - max}</Pill> : null}
    </span>
  );
}

/** Dense, scannable row used by the ticket list and dashboard queues. */
export function TicketRow({ ticket, showRequester = true, className, compact = false }) {
  const { categoryIcon, categoryName } = useMeta();
  const priority = PRIORITY_META[ticket.priority] ?? PRIORITY_META.MEDIUM;

  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className={cx(
        'group relative block overflow-hidden rounded-xl border border-ink-400/14 bg-white/[0.025] p-3.5 transition',
        'hover:-translate-y-0.5 hover:border-brand-400/40 hover:bg-brand-500/[0.07]',
        className,
      )}
    >
      <span className={cx('absolute inset-y-0 left-0 w-[3px]', TONE_SOLID[priority.tone])} aria-hidden />

      <div className="flex items-start gap-3 pl-1.5">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-400/18 bg-ink-925/70 text-base">
          <span aria-hidden>{categoryIcon(ticket.category)}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] tracking-wide text-ink-400">{ticket.code}</span>
            <StatusPill status={ticket.status} />
            <PriorityPill priority={ticket.priority} />
            <SlaPill ticket={ticket} />
          </div>

          <h3 className="mt-1.5 truncate text-sm font-semibold text-ink-100 group-hover:text-white">{ticket.title}</h3>

          {!compact ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{truncate(ticket.ai?.summary ?? ticket.description, 150)}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-400">
            <span className="inline-flex items-center gap-1">
              <MapPinIcon size={12} />
              {ticket.location_text ?? ticket.zone ?? 'No location'}
            </span>
            <span className="inline-flex items-center gap-1">{relativeTime(ticket.created_at)}</span>
            <span className="hidden items-center gap-1 sm:inline-flex">{categoryName(ticket.category)}</span>
            {ticket.comment_count ? <span>{ticket.comment_count} updates</span> : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <FlagChips flags={ticket.ai?.flags} max={2} />
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          {ticket.assignee ? (
            <div className="flex items-center gap-2">
              <span className="text-right text-[11px] leading-tight text-ink-300">
                <span className="block text-ink-400">Assigned to</span>
                {ticket.assignee.name}
              </span>
              <Avatar user={ticket.assignee} size={28} />
            </div>
          ) : (
            <Pill tone="warn">Unassigned</Pill>
          )}
          {showRequester && ticket.requester ? (
            <div className="flex items-center gap-2 opacity-80">
              <span className="text-right text-[11px] leading-tight text-ink-400">
                <span className="block">Reported by</span>
                {ticket.requester.name}
              </span>
              <Avatar user={ticket.requester} size={24} />
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ticketTone(ticket) {
  if (ticket.sla_breached) return 'danger';
  return PRIORITY_META[ticket.priority]?.tone ?? 'neutral';
}

export const CHART_PALETTE = CHART_COLORS;
