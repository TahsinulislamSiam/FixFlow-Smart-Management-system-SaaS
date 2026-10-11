import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRefreshOn } from '../context/RealtimeContext.jsx';
import { cx, formatDateTime, formatDuration, relativeTime, titleCase } from '../lib/format.js';
import { PRIORITY_META, STATUS_META, TONE_HEX, TONE_SOLID } from '../lib/constants.js';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  ErrorState,
  KeyValue,
  Pill,
  PriorityPill,
  ProgressBar,
  SectionTitle,
  Skeleton,
  StatCard,
} from '../components/ui.jsx';
import { FlagChips, SlaPill, TicketRow } from '../components/TicketCard.jsx';
import { CategoryBars, StatusDonut, TrendChart } from '../components/Charts.jsx';
import { AlertIcon, ChartIcon, CheckIcon, ClockIcon, PlusIcon, RefreshIcon, SparkIcon, TicketIcon, WrenchIcon } from '../components/icons.jsx';

const EVENT_ICON = {
  CREATED: '📝',
  AI_TRIAGE: '🤖',
  ASSIGNED: '🧰',
  STATUS_CHANGED: '🔄',
  PRIORITY_CHANGED: '⚡',
  COMMENTED: '💬',
  ATTACHMENT: '📷',
  SLA_BREACH: '⏰',
  REOPENED: '↩️',
  SAFETY_FLAG: '⚠️',
  ASSIGNMENT_DEFERRED: '⏳',
};

function ActivityFeed({ items = [] }) {
  if (!items.length) {
    return <EmptyState icon="🕒" title="No activity yet" description="Workflow events will appear here as tickets move." />;
  }
  return (
    <ol className="relative space-y-3 pl-5">
      <span className="absolute top-1 bottom-1 left-[7px] w-px bg-gradient-to-b from-brand-400/40 via-ink-400/20 to-transparent" aria-hidden />
      {items.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute top-1 -left-5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink-400/30 bg-ink-900 text-[8px]">
            <span aria-hidden>{EVENT_ICON[event.type] ?? '•'}</span>
          </span>
          <p className="text-xs leading-relaxed text-ink-200">
            {event.message ?? titleCase(event.type)}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
            {event.code ? (
              <Link to={`/tickets/${event.ticket_id}`} className="font-mono text-brand-300 hover:text-brand-200">
                {event.code}
              </Link>
            ) : null}
            <span>{event.actor_name ?? 'FixFlow'}</span>
            <span>{relativeTime(event.created_at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SlaRiskList({ items = [] }) {
  if (!items.length) {
    return <EmptyState icon="✅" title="All tickets are inside SLA" description="Nothing is at risk of breaching right now." />;
  }
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((ticket) => (
        <li key={ticket.id}>
          <Link
            to={`/tickets/${ticket.id}`}
            className={cx(
              'flex items-center gap-3 rounded-xl border p-2.5 transition hover:-translate-y-0.5',
              ticket.minutes_overdue > 0
                ? 'border-danger-400/30 bg-danger-500/8 hover:border-danger-400/50'
                : 'border-warn-400/25 bg-warn-500/6 hover:border-warn-400/45',
            )}
          >
            <span className="font-mono text-[11px] text-ink-400">{ticket.code}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-100">{ticket.title}</span>
            <PriorityPill priority={ticket.priority} />
            <span className={cx('shrink-0 text-[11px] font-semibold', ticket.minutes_overdue > 0 ? 'text-danger-400' : 'text-warn-400')}>
              {ticket.minutes_overdue > 0
                ? `${formatDuration(ticket.minutes_overdue)} over`
                : `${formatDuration(ticket.minutes_to_due)} left`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TechnicianBoard({ technicians = [], highlightId }) {
  const sorted = useMemo(
    () => [...technicians].sort((a, b) => b.resolved - a.resolved || a.open - b.open).slice(0, 6),
    [technicians],
  );
  if (!sorted.length) return <EmptyState icon="🧰" title="No technicians yet" />;

  return (
    <ul className="space-y-3">
      {sorted.map((technician, index) => (
        <li key={technician.id} className={cx('flex items-center gap-3 rounded-xl p-2', technician.id === highlightId && 'bg-brand-500/10 ring-1 ring-brand-400/30')}>
          <span className="w-4 text-center text-[11px] font-bold text-ink-400">{index + 1}</span>
          <Avatar user={technician} size={32} online={technician.is_available} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-ink-100">{technician.name}</p>
              <span className="shrink-0 text-[11px] text-ink-400">
                {technician.resolved} fixed · {technician.open} open
              </span>
            </div>
            <ProgressBar
              className="mt-1.5"
              value={technician.utilisation_pct ?? 0}
              tone={(technician.utilisation_pct ?? 0) > 85 ? 'danger' : (technician.utilisation_pct ?? 0) > 60 ? 'warn' : 'ok'}
            />
            <p className="mt-1 text-[10px] text-ink-400">
              {technician.open} active · avg {formatDuration(technician.avg_resolution_minutes)}
              {technician.on_time_rate_pct != null ? ` · ${technician.on_time_rate_pct}% on time` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  const { user, isManager, isTechnician, isRequester } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const result = await api.dashboard();
        setData(result);
        setError(null);
      } catch (caught) {
        setError(caught.message ?? 'Could not load your dashboard.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live: any workflow change refreshes the board (silently, no flicker).
  useRefreshOn(['ticket:created', 'ticket:updated', 'ticket:status', 'ticket:assigned', 'stats:dirty'], () => load({ silent: true }));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  const { mine, overview } = data;
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const statusChart = Object.entries(data.by_status ?? overview?.by_status ?? {})
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({
      name: STATUS_META[status]?.label ?? status,
      value,
      color: TONE_HEX[STATUS_META[status]?.tone ?? 'neutral'],
    }));

  return (
    <div className="space-y-5">
      {/* Header ------------------------------------------------------------ */}
      <section className="surface surface-raised relative overflow-hidden p-5">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-brand-500/12 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Pill tone="brand">
                <SparkIcon size={13} /> {isManager ? 'Operations overview' : isTechnician ? 'Field workspace' : 'My requests'}
              </Pill>
              {data.online_users ? (
                <Pill tone="ok">
                  <Dot tone="ok" pulse /> {data.online_users} online
                </Pill>
              ) : null}
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[1.75rem]">
              {greeting}, {user.name.split(' ')[0]}.
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-300">
              {isManager
                ? 'Here is the live picture of maintenance demand, response times and the technicians carrying it.'
                : isTechnician
                  ? `You have ${mine.open} job${mine.open === 1 ? '' : 's'} in your queue. Critical jobs and SLA risk are listed first.`
                  : 'Track everything you have reported, and confirm the fixes once they are done.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshIcon size={15} className={refreshing ? 'animate-spin' : undefined} />}
              onClick={() => load({ silent: true })}
            >
              Refresh
            </Button>
            <Button variant="primary" size="sm" icon={<PlusIcon size={15} />} onClick={() => navigate('/new')}>
              Report an issue
            </Button>
            <Button variant="outline" size="sm" icon={<TicketIcon size={15} />} onClick={() => navigate('/tickets')}>
              Open the queue
            </Button>
          </div>
        </div>
      </section>

      {/* KPI row ---------------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isManager && overview ? (
          <>
            <StatCard
              label="Open tickets"
              value={overview.totals.open}
              hint={`${overview.totals.unassigned} unassigned`}
              tone="brand"
              icon={<TicketIcon size={16} />}
              onClick={() => navigate('/tickets?scope=open')}
            />
            <StatCard
              label="SLA breaches"
              value={overview.totals.breached}
              hint={`${overview.totals.at_risk} due within 3h`}
              tone={overview.totals.breached > 0 ? 'danger' : 'ok'}
              icon={<ClockIcon size={16} />}
              onClick={() => navigate('/tickets?sla=breached')}
            />
            <StatCard
              label="Avg first response"
              value={formatDuration(overview.performance.avg_first_response_minutes)}
              hint={`Coverage ${overview.performance.first_response_coverage_pct}%`}
              tone="info"
              icon={<ClockIcon size={16} />}
            />
            <StatCard
              label="SLA compliance"
              value={`${overview.performance.sla_compliance_pct}%`}
              hint={`Avg fix ${formatDuration(overview.performance.avg_resolution_minutes)}`}
              tone={overview.performance.sla_compliance_pct >= 85 ? 'ok' : 'warn'}
              icon={<CheckIcon size={16} />}
              onClick={() => navigate('/analytics')}
            />
          </>
        ) : null}

        {isTechnician ? (
          <>
            <StatCard label="My open jobs" value={mine.open} hint={`${mine.in_progress} in progress`} tone="brand" icon={<WrenchIcon size={16} />} onClick={() => navigate('/tickets?scope=assigned')} />
            <StatCard label="SLA risk" value={mine.breached} hint={mine.breached ? 'Needs attention now' : 'All inside SLA'} tone={mine.breached ? 'danger' : 'ok'} icon={<ClockIcon size={16} />} onClick={() => navigate('/tickets?scope=assigned&sla=breached')} />
            <StatCard label="Avg response" value={formatDuration(mine.avg_first_response_minutes)} hint="Across all your jobs" tone="info" icon={<ClockIcon size={16} />} />
            <StatCard
              label="Resolved to date"
              value={data.my_resolved ?? mine.resolved}
              hint={data.leaderboard_position ? `#${data.leaderboard_position} of ${data.leaderboard_size} technicians` : undefined}
              tone="ok"
              icon={<CheckIcon size={16} />}
            />
          </>
        ) : null}

        {isRequester ? (
          <>
            <StatCard label="My open requests" value={mine.open} hint="Being worked on" tone="brand" icon={<TicketIcon size={16} />} onClick={() => navigate('/tickets')} />
            <StatCard
              label="Awaiting my confirmation"
              value={mine.awaiting_closure}
              hint={mine.awaiting_closure ? 'Confirm the fix to close' : 'Nothing to confirm'}
              tone={mine.awaiting_closure ? 'warn' : 'ok'}
              icon={<CheckIcon size={16} />}
            />
            <StatCard label="Resolved" value={mine.resolved} hint={`${mine.total} raised in total`} tone="ok" icon={<CheckIcon size={16} />} />
            <StatCard
              label="Avg fix time"
              value={formatDuration(mine.avg_resolution_minutes)}
              hint="For your requests"
              tone="info"
              icon={<ClockIcon size={16} />}
            />
          </>
        ) : null}
      </section>

      {/* Manager grid ----------------------------------------------------- */}
      {isManager && overview ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader
                title="Demand vs throughput"
                subtitle="Reported against resolved, last 14 days"
                icon="📈"
                action={
                  <Pill tone={overview.trend_14d.at(-1)?.net > 0 ? 'warn' : 'ok'}>
                    backlog {overview.trend_14d.at(-1)?.net > 0 ? '+' : ''}
                    {overview.trend_14d.at(-1)?.net ?? 0}
                  </Pill>
                }
              />
              <TrendChart data={overview.trend_14d} />
            </Card>

            <Card>
              <CardHeader title="Pipeline by status" subtitle="Where every ticket currently sits" icon="🧭" />
              {statusChart.length ? <StatusDonut data={statusChart} /> : <EmptyState icon="📊" title="No tickets yet" />}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-ink-400/14 p-2.5">
                  <p className="text-[10px] tracking-wide text-ink-400 uppercase">Reported today</p>
                  <p className="mt-0.5 text-lg font-semibold text-white">
                    {overview.totals.created_today}
                    {overview.totals.created_delta_pct != null ? (
                      <span className={cx('ml-2 text-[11px] font-semibold', overview.totals.created_delta_pct > 0 ? 'text-danger-400' : 'text-ok-400')}>
                        {overview.totals.created_delta_pct > 0 ? '▲' : '▼'} {Math.abs(overview.totals.created_delta_pct)}%
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-xl border border-ink-400/14 p-2.5">
                  <p className="text-[10px] tracking-wide text-ink-400 uppercase">AI auto-triaged</p>
                  <p className="mt-0.5 text-lg font-semibold text-white">{overview.performance.auto_triage_share_pct}%</p>
                </div>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader
                title="SLA watchlist"
                subtitle="Breached and at-risk tickets, soonest first"
                icon="⏰"
                action={
                  <Button variant="ghost" size="xs" onClick={() => navigate('/tickets?sla=breached')}>
                    View all
                  </Button>
                }
              />
              <SlaRiskList items={data.sla} />
            </Card>

            <Card>
              <CardHeader title="Coverage hotspots" subtitle="Zones driving demand" icon="📍" />
              {data.hotspots?.zones?.length ? (
                <ul className="space-y-2.5">
                  {data.hotspots.zones.slice(0, 5).map((zone) => (
                    <li key={zone.zone}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink-100">{zone.zone}</span>
                        <span className="text-ink-400">
                          {zone.total} total · {zone.open} open
                        </span>
                      </div>
                      <ProgressBar
                        className="mt-1.5"
                        value={(zone.flagged / Math.max(1, zone.total)) * 100 || (zone.open / Math.max(1, zone.total)) * 100}
                        tone={zone.flagged ? 'danger' : 'brand'}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="📍" title="No zone data" />
              )}
            </Card>

            <Card>
              <CardHeader title="Technician leaderboard" subtitle="Resolved volume and load" icon="🏆" />
              <TechnicianBoard technicians={data.technicians} highlightId={user.id} />
            </Card>

            <Card>
              <CardHeader title="Requests by trade" subtitle="Where maintenance effort is going" icon="🛠️" />
              {data.categories?.length ? <CategoryBars data={data.categories} height={260} /> : <EmptyState icon="📊" title="No data yet" />}
            </Card>

            <Card>
              <CardHeader
                title="Needs routing"
                subtitle="Unassigned tickets waiting for dispatch"
                icon="⏳"
                action={
                  <Button variant="ghost" size="xs" onClick={() => navigate('/tickets?scope=unassigned')}>
                    Dispatch
                  </Button>
                }
              />
              {data.needs_action?.length ? (
                <ul className="space-y-2">
                  {data.needs_action.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        to={`/tickets/${ticket.id}`}
                        className="flex items-center gap-2.5 rounded-xl border border-warn-400/25 bg-warn-500/6 p-2.5 transition hover:border-warn-400/50"
                      >
                        <AlertIcon size={15} className="text-warn-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-100">{ticket.title}</span>
                          <span className="block font-mono text-[10px] text-ink-400">{ticket.code} · {ticket.zone ?? 'no zone'}</span>
                        </span>
                        <PriorityPill priority={ticket.priority} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon="✅" title="Everything is dispatched" description="Every open ticket has an owner." />
              )}
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader title="Operations summary" subtitle="Rolling performance" icon="📋" />
              <div className="divide-y divide-ink-400/12">
                <KeyValue label="Total tickets" value={overview.totals.total} />
                <KeyValue label="Resolved" value={overview.totals.resolved} />
                <KeyValue label="Avg resolution" value={formatDuration(overview.performance.avg_resolution_minutes)} />
                <KeyValue label="Avg first response" value={formatDuration(overview.performance.avg_first_response_minutes)} />
                <KeyValue label="First-response coverage" value={`${overview.performance.first_response_coverage_pct}%`} />
                <KeyValue label="Reopen rate" value={`${overview.performance.reopen_rate_pct}%`} />
                <KeyValue label="Safety-flagged open" value={overview.totals.flagged} />
                <KeyValue
                  label="Oldest open ticket"
                  value={
                    overview.oldest_open ? (
                      <Link to={`/tickets/${overview.oldest_open.id}`} className="text-brand-300 hover:text-brand-200">
                        {overview.oldest_open.code}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Latest activity" subtitle="Live workflow events across the estate" icon="⚡" />
              <div className="max-h-[420px] overflow-y-auto pr-1 scroll-slim">
                <ActivityFeed items={data.activity} />
              </div>
            </Card>
          </section>
        </>
      ) : null}

      {/* Technician & requester grid ------------------------------------- */}
      {!isManager ? (
        <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader
              title={isTechnician ? 'Your job queue' : 'Your latest requests'}
              subtitle={isTechnician ? 'Worst-first: critical and soonest SLA' : 'Most recent activity on your tickets'}
              icon="🧰"
              action={
                <Button variant="ghost" size="xs" onClick={() => navigate('/tickets')}>
                  See all
                </Button>
              }
            />
            {(isTechnician ? data.my_queue : data.needs_action)?.length ? (
              <div className="space-y-2">
                {(isTechnician ? data.my_queue : data.needs_action).map((ticket) => (
                  <TicketRow key={ticket.id} ticket={{ ...ticket, sla_due_in_minutes: null, ai: { flags: [] } }} compact />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="🎉"
                title={isTechnician ? 'No jobs waiting' : 'Nothing open right now'}
                description={isTechnician ? 'Your queue is clear. New assignments arrive in real time.' : 'Raise a ticket and it will show up here instantly.'}
                action={
                  <Button variant="primary" size="sm" icon={<PlusIcon size={15} />} onClick={() => navigate('/new')}>
                    Report an issue
                  </Button>
                }
              />
            )}
          </Card>

          <div className="space-y-4">
            {isRequester && data.mine.awaiting_closure > 0 ? (
              <Card>
                <CardHeader title="Confirm your fixes" subtitle="These were resolved — close them if you're happy" icon="✅" />
                <ul className="space-y-2">
                  {data.needs_action.map((ticket) => (
                    <li key={ticket.id}>
                      <Link to={`/tickets/${ticket.id}`} className="flex items-center gap-3 rounded-xl border border-ok-400/25 bg-ok-500/6 p-2.5 hover:border-ok-400/50">
                        <CheckIcon size={16} className="text-ok-400" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-100">{ticket.title}</span>
                          <span className="block text-[10px] text-ink-400">
                            {ticket.assignee_name ? `Fixed by ${ticket.assignee_name} · ` : ''}
                            {relativeTime(ticket.resolved_at)}
                          </span>
                        </span>
                        <span className="text-[11px] font-semibold text-ok-400">Confirm</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            {isTechnician ? (
              <Card>
                <CardHeader title="How you rank" subtitle="Resolved volume against peers" icon="🏆" />
                {data.leaderboard_position ? (
                  <div className="mb-3 rounded-xl border border-brand-400/25 bg-brand-500/10 p-3">
                    <p className="text-xs text-ink-300">
                      You are ranked{' '}
                      <strong className="text-white">
                        #{data.leaderboard_position} of {data.leaderboard_size}
                      </strong>{' '}
                      technicians with{' '}
                      <strong className="text-white">{data.my_resolved}</strong> tickets resolved.
                    </p>
                  </div>
                ) : null}
                <TechnicianBoard technicians={data.technicians} highlightId={user.id} />
              </Card>
            ) : (
              <Card>
                <CardHeader title="What happens next" subtitle="How FixFlow handles your report" icon="🤖" />
                <ol className="space-y-3">
                  {[
                    { title: 'AI triage', body: 'Your words are classified into a trade, priority and safety review within a second.' },
                    { title: 'Smart routing', body: 'A technician is picked by skill, zone, seniority and current workload.' },
                    { title: 'Live progress', body: 'You get notified on every status change, comment and photo.' },
                    { title: 'You confirm', body: 'Once marked resolved, you confirm the fix before it closes.' },
                  ].map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand-400/40 bg-brand-500/15 text-[11px] font-bold text-brand-200">
                        {index + 1}
                      </span>
                      <span>
                        <span className="block text-xs font-semibold text-ink-100">{step.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{step.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            <Card>
              <CardHeader title="Latest activity" subtitle="On the tickets you can see" icon="⚡" />
              <div className="max-h-[360px] overflow-y-auto pr-1 scroll-slim">
                <ActivityFeed items={data.activity} />
              </div>
            </Card>
          </div>
        </section>
      ) : null}

      {isManager ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader title="Trades in demand" subtitle="Ticket mix across the estate" icon="📊" />
            <CategoryBars data={data.categories ?? []} height={300} dataKey="open" />
          </Card>
          <Card>
            <CardHeader title="Reported vs resolved" subtitle="14-day trend" icon="📈" />
            <TrendChart data={overview.trend_14d} height={300} />
          </Card>
        </section>
      ) : null}

      {/* Footer strip ---------------------------------------------------- */}
      <section className="surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-xs text-ink-300">
          <ChartIcon size={15} className="text-accent-400" />
          Snapshot generated {formatDateTime(data.generated_at)} · updates arrive live over websockets
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManager ? (
            <Button variant="secondary" size="sm" icon={<SparkIcon size={14} />} onClick={() => navigate('/analytics')}>
              Open analytics workspace
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon={<TicketIcon size={14} />} onClick={() => navigate('/tickets')}>
            Browse all tickets
          </Button>
        </div>
      </section>
    </div>
  );
}
