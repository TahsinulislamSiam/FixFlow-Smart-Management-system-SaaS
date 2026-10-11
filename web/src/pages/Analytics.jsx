import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useRefreshOn } from '../context/RealtimeContext.jsx';
import { cx, formatDateTime, formatDuration } from '../lib/format.js';
import { PRIORITY_META, PRIORITY_ORDER, STATUS_META, TONE_HEX } from '../lib/constants.js';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Pill,
  PriorityPill,
  ProgressBar,
  Skeleton,
  StatCard,
  StatusPill,
} from '../components/ui.jsx';
import { CategoryBars, StatusDonut, TechnicianChart, TrendChart } from '../components/Charts.jsx';
import { ChartIcon, RefreshIcon, SparkIcon } from '../components/icons.jsx';

/* -------------------------------------------------------------------------- */
/* Priority x category heatmap                                                 */
/* -------------------------------------------------------------------------- */

function PriorityHeatmap({ matrix = {}, categories = [] }) {
  const max = Math.max(1, ...PRIORITY_ORDER.flatMap((priority) => Object.values(matrix[priority] ?? {}).map(Number)));

  return (
    <div className="overflow-x-auto scroll-slim">
      <table className="w-full min-w-[560px] border-collapse text-center">
        <thead>
          <tr>
            <th className="pb-2 pr-3 text-left text-[10px] font-semibold tracking-[0.12em] text-ink-400 uppercase">Priority</th>
            {categories.map((category) => (
              <th key={category.key} className="px-1.5 pb-2 text-[10px] font-semibold tracking-[0.08em] text-ink-400 uppercase">
                <span className="block text-sm">{category.icon}</span>
                <span className="mt-0.5 block max-w-16 truncate">{category.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PRIORITY_ORDER.map((priority) => (
            <tr key={priority}>
              <td className="py-1 pr-3 text-left">
                <PriorityPill priority={priority} />
              </td>
              {categories.map((category) => {
                const count = matrix[priority]?.[category.key] ?? 0;
                const share = count / max;
                return (
                  <td key={category.key} className="p-1">
                    <div
                      className="flex h-9 items-center justify-center rounded-lg text-xs font-semibold transition"
                      style={{
                        background: count ? `rgba(99,102,241,${0.14 + 0.62 * share})` : 'rgba(255,255,255,0.025)',
                        color: count ? (share > 0.55 ? '#ffffff' : '#cdd2ef') : '#3d4266',
                      }}
                      title={`${count} ${category.name} · ${PRIORITY_META[priority].label}`}
                    >
                      {count || '·'}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-ink-500">
        Heat intensity shows where critical and high-priority demand concentrates by trade.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Category table                                                              */
/* -------------------------------------------------------------------------- */

function CategoryTable({ rows = [] }) {
  return (
    <div className="divide-y divide-ink-400/10">
      {rows.map((row) => (
        <div key={row.category} className="flex items-center gap-3 py-2.5">
          <span className="text-base leading-none" aria-hidden>
            {row.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-ink-100">{row.name}</p>
              <span className="shrink-0 text-[11px] text-ink-400">
                {row.total} total · {row.open} open
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex-1">
                <ProgressBar
                  value={row.avg_urgency ?? 0}
                  tone={(row.avg_urgency ?? 0) >= 70 ? 'danger' : (row.avg_urgency ?? 0) >= 45 ? 'warn' : 'brand'}
                />
              </div>
              <span className="w-16 shrink-0 text-right text-[10px] text-ink-400">
                {row.avg_urgency == null ? '—' : `urgency ${row.avg_urgency}`}
              </span>
              <span className="w-12 shrink-0 text-right text-[10px] text-ok-400">{formatDuration(row.avg_resolution_minutes)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Technician leaderboard                                                      */
/* -------------------------------------------------------------------------- */

function Leaderboard({ rows = [] }) {
  if (!rows.length) return <EmptyState icon="🧰" title="No technicians yet" />;
  return (
    <ol className="space-y-3">
      {rows.map((row, index) => (
        <li key={row.id} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-center text-[11px] font-bold text-ink-400">{index + 1}</span>
          <Avatar user={row} size={30} online={row.is_available} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-ink-100">{row.name}</p>
              <span className="shrink-0 text-[11px] text-ink-400">
                {row.resolved} fixed · {row.open} open
              </span>
            </div>
            <ProgressBar
              className="mt-1"
              value={row.utilisation_pct ?? 0}
              tone={(row.utilisation_pct ?? 0) > 85 ? 'danger' : (row.utilisation_pct ?? 0) > 60 ? 'warn' : 'ok'}
            />
            <p className="mt-1 text-[10px] text-ink-400">
              avg {formatDuration(row.avg_resolution_minutes)}
              {row.on_time_rate_pct != null ? ` · ${row.on_time_rate_pct}% on time` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* SLA watchlist table                                                         */
/* -------------------------------------------------------------------------- */

function SlaTable({ rows = [] }) {
  if (!rows.length) return <EmptyState icon="✅" title="Nothing on the SLA clock" description="No open tickets carry an SLA deadline right now." />;
  return (
    <div className="overflow-x-auto scroll-slim">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="text-[10px] tracking-[0.12em] text-ink-400 uppercase">
            <th className="pb-2 pr-4 font-semibold">Ticket</th>
            <th className="pb-2 pr-4 font-semibold">Title</th>
            <th className="pb-2 pr-4 font-semibold">Priority</th>
            <th className="pb-2 pr-4 font-semibold">Status</th>
            <th className="pb-2 pr-4 font-semibold">Assignee</th>
            <th className="pb-2 pr-4 font-semibold">Category</th>
            <th className="pb-2 font-semibold">SLA clock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-400/10">
          {rows.slice(0, 15).map((row) => (
            <tr key={row.id}>
              <td className="py-2.5 pr-4">
                <Link to={`/tickets/${row.id}`} className="font-mono text-xs text-brand-300 hover:text-brand-200">
                  {row.code}
                </Link>
              </td>
              <td className="max-w-[240px] truncate py-2.5 pr-4 text-xs text-ink-100">{row.title}</td>
              <td className="py-2.5 pr-4">
                <PriorityPill priority={row.priority} />
              </td>
              <td className="py-2.5 pr-4">
                <StatusPill status={row.status} />
              </td>
              <td className="py-2.5 pr-4 text-xs text-ink-300">{row.assignee_name ?? 'Unassigned'}</td>
              <td className="py-2.5 pr-4 text-[11px] text-ink-400">{row.category}</td>
              <td className="py-2.5">
                <span
                  className={cx(
                    'whitespace-nowrap text-[11px] font-semibold',
                    row.minutes_overdue > 0 ? 'text-danger-400' : row.minutes_to_due != null && row.minutes_to_due <= 180 ? 'text-warn-400' : 'text-ok-400',
                  )}
                >
                  {row.minutes_overdue > 0
                    ? `${formatDuration(row.minutes_overdue)} overdue`
                    : row.minutes_to_due != null
                      ? `${formatDuration(row.minutes_to_due)} left`
                      : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await api.analytics.summary());
      setError(null);
    } catch (caught) {
      setError(caught.message ?? 'Could not load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOn(['ticket:created', 'ticket:updated', 'ticket:status', 'ticket:assigned', 'stats:dirty'], () => load({ silent: true }));

  const statusChart = useMemo(() => {
    const byStatus = data?.overview?.by_status ?? {};
    return Object.entries(byStatus)
      .filter(([, value]) => value > 0)
      .map(([status, value]) => ({
        name: STATUS_META[status]?.label ?? status,
        value,
        color: TONE_HEX[STATUS_META[status]?.tone ?? 'neutral'],
      }));
  }, [data]);

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
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  const { overview, categories = [], technicians = [], sla = [], hotspots, priority_matrix = {}, generated_at } = data;
  const perf = overview.performance;

  return (
    <div className="space-y-5">
      {/* Header ---------------------------------------------------------- */}
      <header className="surface surface-raised relative overflow-hidden p-5">
        <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-accent-500/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Pill tone="brand">
                <ChartIcon size={13} /> Analytics workspace
              </Pill>
              <Pill tone="neutral">Manager view</Pill>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-[1.75rem]">Maintenance intelligence</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-300">
              Demand, performance and risk across the estate — every number derived live from the ticket log.
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={<RefreshIcon size={15} className={refreshing ? 'animate-spin' : undefined} />} onClick={() => load({ silent: true })}>
            Refresh
          </Button>
        </div>
      </header>

      {/* KPI row --------------------------------------------------------- */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open tickets" value={overview.totals.open} hint={`${overview.totals.unassigned} unassigned`} tone="brand" icon="🧰" />
        <StatCard
          label="SLA breaches"
          value={overview.totals.breached}
          hint={`${overview.totals.at_risk} due within 3h`}
          tone={overview.totals.breached ? 'danger' : 'ok'}
          icon="⏰"
        />
        <StatCard
          label="SLA compliance"
          value={`${perf.sla_compliance_pct}%`}
          hint={`${perf.first_response_coverage_pct}% first-response coverage`}
          tone={perf.sla_compliance_pct >= 85 ? 'ok' : 'warn'}
          icon="✅"
        />
        <StatCard label="Avg resolution" value={formatDuration(perf.avg_resolution_minutes)} hint={`${perf.reopen_rate_pct}% reopen rate`} tone="info" icon="🔧" />
      </section>

      {/* Trend + pipeline ------------------------------------------------ */}
      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Demand vs throughput"
            subtitle="Last 14 days, created against resolved"
            icon="📈"
            action={
              <Pill tone={(overview.trend_14d?.at(-1)?.net ?? 0) > 0 ? 'warn' : 'ok'}>
                backlog {(overview.trend_14d?.at(-1)?.net ?? 0) > 0 ? '+' : ''}
                {overview.trend_14d?.at(-1)?.net ?? 0}
              </Pill>
            }
          />
          <TrendChart data={overview.trend_14d ?? []} height={260} />
        </Card>

        <Card>
          <CardHeader title="Pipeline by status" subtitle="All tickets, current snapshot" icon="🧭" />
          {statusChart.length ? <StatusDonut data={statusChart} height={230} /> : <EmptyState icon="📊" title="No tickets yet" />}
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-ink-400/14 p-2 text-center">
              <p className="text-base leading-none font-semibold text-white">{overview.totals.resolved}</p>
              <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">resolved</p>
            </div>
            <div className="rounded-xl border border-ink-400/14 p-2 text-center">
              <p className="text-base leading-none font-semibold text-white">{overview.totals.created_today}</p>
              <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">today</p>
            </div>
            <div className="rounded-xl border border-ink-400/14 p-2 text-center">
              <p className="text-base leading-none font-semibold text-warn-400">{perf.reopen_rate_pct}%</p>
              <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">reopens</p>
            </div>
          </div>
        </Card>
      </section>

      {/* Priority matrix + AI performance ---------------------------------- */}
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Priority × trade matrix" subtitle="Where critical demand concentrates" icon="🗺️" />
          <PriorityHeatmap matrix={priority_matrix} categories={categories} />
        </Card>

        <Card>
          <CardHeader title="AI triage engine" subtitle="fixflow-triage-v1, running on every report" icon="🤖" />
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
                <span className="font-semibold tracking-wide uppercase">Auto-triaged share</span>
                <span className="text-ink-200">{perf.auto_triage_share_pct}%</span>
              </div>
              <ProgressBar value={perf.auto_triage_share_pct} tone="brand" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-ink-400/14 bg-ink-925/40 p-2.5 text-center">
                <p className="text-lg leading-none font-semibold text-white">{perf.ai_auto_prioritised}</p>
                <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">auto-prioritised</p>
              </div>
              <div className="rounded-xl border border-ink-400/14 bg-ink-925/40 p-2.5 text-center">
                <p className="text-lg leading-none font-semibold text-danger-400">{overview.totals.flagged}</p>
                <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">flags open</p>
              </div>
              <div className="rounded-xl border border-ink-400/14 bg-ink-925/40 p-2.5 text-center">
                <p className="text-lg leading-none font-semibold text-white">{formatDuration(perf.avg_first_response_minutes)}</p>
                <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">avg response</p>
              </div>
            </div>
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-400">
              <SparkIcon size={13} className="mt-0.5 shrink-0 text-accent-400" />
              Safety-flagged reports are escalated instantly and can never be downgraded by the model — a manager's
              decision is always final.
            </p>
          </div>
        </Card>
      </section>

      {/* Categories + hotspots -------------------------------------------- */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Trades in demand" subtitle="Volume, urgency score and avg fix time by category" icon="🛠️" />
          {categories.length ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
              <CategoryBars data={categories} height={280} />
              <CategoryTable rows={categories} />
            </div>
          ) : (
            <EmptyState icon="📊" title="No ticket data yet" />
          )}
        </Card>

        <Card>
          <CardHeader title="Coverage hotspots" subtitle="Where maintenance demand clusters" icon="📍" />
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-ink-400 uppercase">By zone</p>
              {hotspots?.zones?.length ? (
                <ul className="space-y-2.5">
                  {hotspots.zones.slice(0, 6).map((zone) => (
                    <li key={zone.zone}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-ink-100">{zone.zone}</span>
                        <span className="text-ink-400">{zone.total} total · {zone.open} open</span>
                      </div>
                      <ProgressBar
                        className="mt-1"
                        value={(zone.flagged / Math.max(1, zone.total)) * 100 || (zone.open / Math.max(1, zone.total)) * 100}
                        tone={zone.flagged ? 'danger' : 'brand'}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-500">No zone data yet.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-ink-400 uppercase">Repeat locations</p>
              {hotspots?.locations?.length ? (
                <ul className="space-y-2">
                  {hotspots.locations.map((location) => (
                    <li key={location.location} className="rounded-xl border border-ink-400/14 p-2.5">
                      <p className="truncate text-xs font-medium text-ink-100">{location.location}</p>
                      <p className="mt-0.5 text-[10px] text-ink-400">
                        {location.total} reports · {location.open} open
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-ink-500">No repeat locations yet.</p>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* Technician performance -------------------------------------------- */}
      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Technician throughput" subtitle="Resolved vs open, last 8 by volume" icon="🏆" />
          {technicians.length ? <TechnicianChart data={technicians} height={280} /> : <EmptyState icon="🧰" title="No technicians yet" />}
        </Card>
        <Card>
          <CardHeader title="Team leaderboard" subtitle="Load, speed and on-time reliability" icon="🥇" />
          <Leaderboard rows={technicians} />
        </Card>
      </section>

      {/* SLA watchlist ------------------------------------------------------ */}
      <Card>
        <CardHeader
          title="SLA watchlist"
          subtitle="Every open ticket with a running SLA clock, soonest first"
          icon="⏰"
          action={<Pill tone={overview.totals.breached ? 'danger' : 'ok'}>{overview.totals.breached} breached</Pill>}
        />
        <SlaTable rows={sla} />
      </Card>

      {/* Footer ------------------------------------------------------------- */}
      <section className="surface flex items-center gap-2 p-4 text-[11px] text-ink-400">
        <ChartIcon size={14} className="text-accent-400" />
        Snapshot generated {formatDateTime(generated_at)} · derived live from {overview.totals.total} tickets · updates in real time
      </section>
    </div>
  );
}