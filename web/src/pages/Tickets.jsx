import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useRefreshOn } from '../context/RealtimeContext.jsx';
import { cx, relativeTime } from '../lib/format.js';
import { OPEN_STATUSES, PRIORITY_META, PRIORITY_ORDER, STATUS_META, STATUS_ORDER, TONE_SOLID } from '../lib/constants.js';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Pill,
  PriorityPill,
  SegmentedControl,
  Select,
  Skeleton,
  StatusPill,
} from '../components/ui.jsx';
import { FlagChips, SlaPill, TicketRow } from '../components/TicketCard.jsx';
import { CategoryBars } from '../components/Charts.jsx';
import { FilterIcon, PlusIcon, RefreshIcon, SparkIcon } from '../components/icons.jsx';

const PAGE_SIZE = 12;

function BoardColumn({ status, tickets }) {
  const meta = STATUS_META[status];
  return (
    <div className="flex w-[268px] shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-200">
          <span className={cx('h-2 w-2 rounded-full', TONE_SOLID[meta.tone])} />
          {meta.label}
        </span>
        <span className="rounded-md bg-white/6 px-1.5 py-0.5 text-[10px] font-semibold text-ink-300">{tickets.length}</span>
      </div>
      <div className="flex min-h-[120px] flex-col gap-2 rounded-xl border border-ink-400/12 bg-ink-925/40 p-2">
        {tickets.length ? (
          tickets.map((ticket) => <TicketRow key={ticket.id} ticket={ticket} compact showRequester={false} />)
        ) : (
          <p className="px-2 py-6 text-center text-[11px] text-ink-500">Nothing here</p>
        )}
      </div>
    </div>
  );
}

export function TicketsPage() {
  const { user, isManager, isRequester } = useAuth();
  const { categories } = useMeta();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [view, setView] = useState('list');
  const [tickets, setTickets] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [counts, setCounts] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters are derived from the URL so links and the browser back button work.
  const filters = useMemo(
    () => ({
      q: params.get('q') ?? '',
      status: params.get('status') ?? '',
      priority: params.get('priority') ?? '',
      category: params.get('category') ?? '',
      assignee_id: params.get('assignee_id') ?? '',
      scope: params.get('scope') ?? '',
      sla: params.get('sla') ?? '',
      sort: params.get('sort') ?? 'priority',
      page: Number(params.get('page') ?? '1') || 1,
      view: params.get('view') ?? 'list',
    }),
    [params],
  );

  useEffect(() => {
    setView(filters.view === 'board' ? 'board' : 'list');
  }, [filters.view]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(params);
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const query = {
          q: filters.q || undefined,
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          category: filters.category || undefined,
          assignee_id: filters.assignee_id || undefined,
          scope: filters.scope || undefined,
          sla: filters.sla || undefined,
          sort: filters.sort,
          limit: view === 'board' ? 200 : PAGE_SIZE,
          page: view === 'board' ? 1 : filters.page,
        };
        const [result, countResult] = await Promise.all([
          api.tickets.list(query),
          api.tickets.counts().catch(() => null),
        ]);
        setTickets(result.data ?? []);
        setMeta(result.meta ?? { page: 1, totalPages: 1, total: 0 });
        setCounts(countResult);
        setError(null);
      } catch (caught) {
        setError(caught.message ?? 'Could not load tickets.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filters, view],
  );

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOn(['ticket:created', 'ticket:updated', 'ticket:status', 'ticket:assigned'], () => load({ silent: true }));

  useEffect(() => {
    if (!isManager) return;
    api.users
      .technicians()
      .then((rows) => setTechnicians(rows ?? []))
      .catch(() => setTechnicians([]));
  }, [isManager]);

  const activeFilterCount = ['status', 'priority', 'category', 'assignee_id', 'scope', 'sla'].filter((key) => filters[key]).length;

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((status) => [status, []]));
    for (const ticket of tickets) map[ticket.status]?.push(ticket);
    return map;
  }, [tickets]);

  const scopeOptions = isManager
    ? [
        { value: '', label: 'Everything' },
        { value: 'open', label: 'Open' },
        { value: 'unassigned', label: 'Unassigned' },
        { value: 'mine', label: 'Raised by me' },
      ]
    : isRequester
      ? [
          { value: '', label: 'All of mine' },
          { value: 'open', label: 'Open' },
        ]
      : [
          { value: '', label: 'My visibility' },
          { value: 'assigned', label: 'Assigned to me' },
          { value: 'open', label: 'Open queue' },
        ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {isRequester ? 'My requests' : isManager ? 'Ticket queue' : 'My work'}
          </h1>
          <p className="mt-1 text-sm text-ink-300">
            {meta.total} ticket{meta.total === 1 ? '' : 's'}
            {activeFilterCount ? ` matching ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'}` : ' in view'}
            {counts ? ` · ${OPEN_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)} open` : ''}
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
        </div>
      </header>

      {/* Status chips ---------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          tone={!filters.status ? 'brand' : 'neutral'}
          role="button"
          onClick={() => setFilter('status', '')}
          className="cursor-pointer"
        >
          All {counts ? Object.values(counts).reduce((sum, value) => sum + value, 0) : ''}
        </Pill>
        {STATUS_ORDER.map((status) => (
          <Pill
            key={status}
            tone={filters.status.split(',').includes(status) ? STATUS_META[status].tone : 'neutral'}
            role="button"
            onClick={() => {
              const current = filters.status ? filters.status.split(',') : [];
              const next = current.includes(status) ? current.filter((item) => item !== status) : [...current, status];
              setFilter('status', next.join(','));
            }}
            className="cursor-pointer"
          >
            <span className={cx('h-1.5 w-1.5 rounded-full', TONE_SOLID[STATUS_META[status].tone])} />
            {STATUS_META[status].label}
            {counts ? <span className="opacity-70">{counts[status] ?? 0}</span> : null}
          </Pill>
        ))}
      </div>

      {/* Filter bar ------------------------------------------------------ */}
      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <label className="relative">
            <FilterIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
            <Input
              value={filters.q}
              onChange={(event) => setFilter('q', event.target.value)}
              placeholder="Search title, description, code or location…"
              className="pl-9"
              aria-label="Search tickets"
            />
          </label>

          <Select value={filters.scope} onChange={(event) => setFilter('scope', event.target.value)} aria-label="Scope">
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select value={filters.priority} onChange={(event) => setFilter('priority', event.target.value)} aria-label="Priority">
            <option value="">Any priority</option>
            {PRIORITY_ORDER.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_META[priority].label}
              </option>
            ))}
          </Select>

          <Select value={filters.category} onChange={(event) => setFilter('category', event.target.value)} aria-label="Trade">
            <option value="">Any trade</option>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.icon} {category.name}
              </option>
            ))}
          </Select>

          <Select value={filters.sla} onChange={(event) => setFilter('sla', event.target.value)} aria-label="SLA state">
            <option value="">Any SLA state</option>
            <option value="breached">Breached</option>
            <option value="at_risk">Due within 3h</option>
            <option value="on_track">On track</option>
          </Select>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              value={filters.sort}
              onChange={(value) => setFilter('sort', value)}
              options={[
                { value: 'priority', label: 'Priority' },
                { value: 'newest', label: 'Newest' },
                { value: 'sla', label: 'SLA' },
                { value: 'updated', label: 'Recently updated' },
              ]}
            />
            {isManager ? (
              <Select
                value={filters.assignee_id}
                onChange={(event) => setFilter('assignee_id', event.target.value)}
                className="max-w-[210px]"
                aria-label="Technician"
              >
                <option value="">Any technician</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                    {technician.open_tickets ? ` (${technician.open_tickets})` : ''}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {activeFilterCount ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setParams(new URLSearchParams({ sort: filters.sort }), { replace: true })}
              >
                Clear filters
              </Button>
            ) : null}
            <SegmentedControl
              value={view}
              onChange={(value) => setFilter('view', value)}
              options={[
                { value: 'list', label: 'List' },
                { value: 'board', label: 'Board' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Results --------------------------------------------------------- */}
      {error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((key) => (
            <Skeleton key={key} className="h-28 w-full" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔍"
            title="No tickets match those filters"
            description="Try widening the search, or clear the filters to see the whole queue."
            action={
              <Button variant="secondary" size="sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                Clear all filters
              </Button>
            }
          />
        </Card>
      ) : view === 'board' ? (
        <div className="overflow-x-auto pb-2 scroll-slim">
          <div className="flex gap-3">
            {STATUS_ORDER.filter((status) => status !== 'CANCELLED').map((status) => (
              <BoardColumn key={status} status={status} tickets={grouped[status] ?? []} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <TicketRow key={ticket.id} ticket={ticket} showRequester={!isRequester} />
            ))}
          </div>

          {meta.totalPages > 1 ? (
            <nav className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => setFilter('page', meta.page - 1)}
              >
                ← Previous
              </Button>
              <span className="text-xs text-ink-400">
                Page {meta.page} of {meta.totalPages} · {meta.total} tickets
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilter('page', meta.page + 1)}
              >
                Next →
              </Button>
            </nav>
          ) : null}
        </>
      )}

      {/* Manager insight footer ------------------------------------------ */}
      {isManager && tickets.length ? (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <SparkIcon size={15} className="text-accent-400" />
            <h2 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">What this view tells you</h2>
          </div>
          <p className="text-xs leading-relaxed text-ink-400">
            {tickets.filter((ticket) => ticket.sla_breached).length} ticket(s) in this view have breached SLA and{' '}
            {tickets.filter((ticket) => !ticket.assignee_id).length} are still unassigned. Highest urgency in view:{' '}
            {tickets.reduce((max, ticket) => Math.max(max, ticket.ai?.urgency ?? 0), 0)}/100.
          </p>
          <div className="mt-3">
            <CategoryBars
              data={Object.entries(
                tickets.reduce((accumulator, ticket) => {
                  accumulator[ticket.category] = (accumulator[ticket.category] ?? 0) + 1;
                  return accumulator;
                }, {}),
              ).map(([key, total]) => ({ name: key.replace(/_/g, ' '), total }))}
              height={180}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
