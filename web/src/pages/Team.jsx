import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useRefreshOn, useRealtimeEvent } from '../context/RealtimeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { cx, formatDateTime, formatDuration } from '../lib/format.js';
import { ROLE_META } from '../lib/constants.js';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dot,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Modal,
  Pill,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
} from '../components/ui.jsx';
import { PlusIcon, RefreshIcon, UsersIcon, WrenchIcon } from '../components/icons.jsx';

const LEVEL_META = {
  JUNIOR: { label: 'Junior', tone: 'neutral' },
  SENIOR: { label: 'Senior', tone: 'info' },
  LEAD: { label: 'Lead', tone: 'brand' },
};

const ROLE_ORDER = ['ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER'];

function AvailablePill({ available }) {
  return available ? (
    <Pill tone="ok">
      <Dot tone="ok" pulse /> Available
    </Pill>
  ) : (
    <Pill tone="neutral">
      <Dot tone="neutral" /> Unavailable
    </Pill>
  );
}

/* -------------------------------------------------------------------------- */
/* Roster — who carries the work                                              */
/* -------------------------------------------------------------------------- */

function RosterTab() {
  const { isManager } = useAuth();
  const { categoryName, categoryIcon } = useMeta();
  const [technicians, setTechnicians] = useState([]);
  const [enriched, setEnriched] = useState({});
  const [online, setOnline] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const [roster, analytics] = await Promise.all([
          api.users.technicians(),
          isManager ? api.analytics.technicians().catch(() => []) : Promise.resolve([]),
        ]);
        setTechnicians(roster ?? []);
        setOnline(new Set((roster ?? []).filter((row) => row.online).map((row) => row.id)));
        setEnriched(Object.fromEntries((analytics ?? []).map((row) => [row.id, row])));
        setError(null);
      } catch (caught) {
        setError(caught.message ?? 'Could not load the technician roster.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isManager],
  );

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOn(['ticket:assigned', 'ticket:status', 'ticket:updated', 'stats:dirty'], () => load({ silent: true }));
  useRealtimeEvent('presence:update', (payload) => setOnline(new Set(payload?.online ?? [])));

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-56" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  const sorted = [...technicians].sort(
    (a, b) => (b.open_tickets ?? 0) - (a.open_tickets ?? 0) || a.name.localeCompare(b.name),
  );

  return (
    <>
      {refreshing ? (
        <p className="text-right text-[11px] text-ink-400">Refreshing…</p>
      ) : null}

      {sorted.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map((technician) => {
            const stats = enriched[technician.id] ?? {};
            const isOnline = online.has(technician.id) || technician.online;
            const loadPct =
              stats.utilisation_pct ?? Math.min(100, Math.round(((technician.open_tickets ?? 0) / 6) * 100));
            const skills = (technician.skills ?? []).slice(0, 5);
            return (
              <Card key={technician.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <Avatar user={technician} size={44} online={isOnline} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{technician.name}</p>
                    <p className="truncate text-[11px] text-ink-400">
                      {technician.title ?? 'Technician'}
                      {technician.zone ? ` · ${technician.zone}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Pill tone={LEVEL_META[technician.level]?.tone ?? 'neutral'}>
                        {LEVEL_META[technician.level]?.label ?? technician.level}
                      </Pill>
                      <AvailablePill available={technician.is_available} />
                    </div>
                  </div>
                  <Link
                    to={`/tickets?assignee_id=${technician.id}&scope=assigned`}
                    className="shrink-0 rounded-xl border border-ink-400/20 bg-white/4 p-2 text-center transition hover:border-brand-400/40"
                    title="Their open jobs"
                  >
                    <p className="text-lg leading-none font-semibold text-white">{technician.open_tickets ?? 0}</p>
                    <p className="mt-0.5 text-[9px] tracking-wide text-ink-400 uppercase">open</p>
                  </Link>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
                    <span className="font-semibold tracking-wide uppercase">Current load</span>
                    <span className="text-ink-200">{loadPct}%</span>
                  </div>
                  <ProgressBar value={loadPct} tone={loadPct > 85 ? 'danger' : loadPct > 60 ? 'warn' : 'ok'} />
                </div>

                {isManager ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-ink-400/12 bg-ink-925/40 p-2 text-center">
                      <p className="text-base leading-none font-semibold text-white">{stats.resolved ?? 0}</p>
                      <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">resolved</p>
                    </div>
                    <div className="rounded-xl border border-ink-400/12 bg-ink-925/40 p-2 text-center">
                      <p className="text-base leading-none font-semibold text-white">
                        {formatDuration(stats.avg_resolution_minutes)}
                      </p>
                      <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">avg fix</p>
                    </div>
                    <div className="rounded-xl border border-ink-400/12 bg-ink-925/40 p-2 text-center">
                      <p className="text-base leading-none font-semibold text-white">
                        {stats.on_time_rate_pct != null ? `${stats.on_time_rate_pct}%` : '—'}
                      </p>
                      <p className="mt-1 text-[9px] tracking-wide text-ink-400 uppercase">on time</p>
                    </div>
                  </div>
                ) : null}

                {skills.length ? (
                  <div className="mt-auto flex flex-wrap gap-1.5 border-t border-ink-400/10 pt-3">
                    {skills.map((skill) => (
                      <Pill key={skill} tone="brand" className="!px-2 !py-0.5 text-[10px]">
                        <span aria-hidden>{categoryIcon(skill)}</span> {categoryName(skill)}
                      </Pill>
                    ))}
                    {(technician.skills?.length ?? 0) > 5 ? (
                      <Pill tone="neutral" className="!px-2 !py-0.5 text-[10px]">
                        +{(technician.skills?.length ?? 0) - 5} more
                      </Pill>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-auto pt-1 text-[11px] text-ink-500 italic">No skills listed</div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="🧰" title="No technicians yet" description="Add technician accounts and they will appear here." />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* People — account directory (managers see, admins manage)                    */
/* -------------------------------------------------------------------------- */

function UserEditor({ open, onClose, initial, categories, zones, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(initial);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitting(false);
    if (initial) {
      setForm({
        name: initial.name ?? '',
        email: initial.email ?? '',
        role: initial.role ?? 'TECHNICIAN',
        level: initial.level ?? 'JUNIOR',
        title: initial.title ?? '',
        phone: initial.phone ?? '',
        zone: initial.zone ?? '',
        skills: initial.skills ?? [],
        is_available: initial.is_available ?? true,
        password: '',
      });
    } else {
      setForm({
        name: '',
        email: '',
        role: 'TECHNICIAN',
        level: 'JUNIOR',
        title: '',
        phone: '',
        zone: '',
        skills: [],
        is_available: true,
        password: '',
      });
    }
  }, [open, initial]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const toggleSkill = (key) =>
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(key) ? current.skills.filter((skill) => skill !== key) : [...current.skills, key],
    }));

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const body = {
        name: form.name.trim(),
        role: form.role,
        level: form.level,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        zone: form.zone.trim() || null,
        skills: form.role === 'TECHNICIAN' ? form.skills : [],
      };
      if (isEdit) {
        await api.users.update(initial.id, { ...body, is_available: form.is_available });
        toast.success('Account updated', `${form.name.trim()} has been saved.`);
      } else {
        await api.users.create({ ...body, email: form.email.trim(), password: form.password });
        toast.success('Account created', `${form.name.trim()} can now sign in.`);
      }
      onSaved?.();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details ?? {});
        toast.error('Could not save', caught.message);
      } else {
        toast.error('Could not save', caught?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${initial.name}` : 'Create an account'}
      subtitle={isEdit ? 'Role, level and contact details' : 'Staff accounts are created here — reporters can also self-register.'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={submitting}>
            {isEdit ? 'Save changes' : 'Create account'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input value={form.name} onChange={set('name')} placeholder="Jordan Ellis" invalid={Boolean(errors.name)} required />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="name@company.com"
              invalid={Boolean(errors.email)}
              disabled={isEdit}
              required
            />
          </Field>
        </div>

        {!isEdit ? (
          <Field label="Temporary password" required error={errors.password} hint="Min 8 characters — they can change it in Settings.">
            <Input type="password" value={form.password} onChange={set('password')} invalid={Boolean(errors.password)} placeholder="••••••••" required minLength={8} />
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Role" error={errors.role}>
            <Select value={form.role} onChange={set('role')}>
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLE_META[role].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Level">
            <Select value={form.level} onChange={set('level')}>
              {Object.entries(LEVEL_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zone">
            <Select value={form.zone} onChange={set('zone')}>
              <option value="">None</option>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job title">
            <Input value={form.title} onChange={set('title')} placeholder="e.g. Electrician" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set('phone')} placeholder="+44 7000 000000" />
          </Field>
        </div>

        {form.role === 'TECHNICIAN' ? (
          <>
            <Field label="Skills" hint="Used by the smart-assignment engine to match the right person to each job.">
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => {
                  const active = form.skills.includes(category.key);
                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => toggleSkill(category.key)}
                      className={cx(
                        'rounded-xl border px-2.5 py-1.5 text-xs font-medium transition',
                        active
                          ? 'border-brand-400/60 bg-brand-500/20 text-brand-200'
                          : 'border-ink-400/20 bg-white/4 text-ink-300 hover:border-brand-400/35',
                      )}
                    >
                      <span aria-hidden className="mr-1">
                        {category.icon}
                      </span>
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </Field>
            {isEdit ? (
              <div className="rounded-xl border border-ink-400/14 bg-ink-925/40 p-3">
                <Checkbox label="Currently available for new assignments" checked={form.is_available} onChange={(event) => setForm((current) => ({ ...current, is_available: event.target.checked }))} />
              </div>
            ) : null}
          </>
        ) : null}
      </form>
    </Modal>
  );
}

function PeopleTab({ canManage }) {
  const { categories, zones } = useMeta();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState({ role: '', q: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // null | { mode:'create' } | { mode:'edit', user }
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api.users.list()) ?? []);
      setError(null);
    } catch (caught) {
      setError(caught.message ?? 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefreshOn(['stats:dirty', 'ticket:assigned'], () => load());

  const filtered = useMemo(() => {
    const query = filter.q.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!filter.role || user.role === filter.role) &&
        (!query || `${user.name} ${user.email} ${user.zone ?? ''}`.toLowerCase().includes(query)),
    );
  }, [users, filter]);

  const confirmReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await api.users.resetPassword(resetTarget.id, resetPassword);
      toast.success('Password reset', `${resetTarget.name} can now sign in with the new password.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (caught) {
      toast.error('Reset failed', caught?.message);
    } finally {
      setResetting(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => load()} />;

  return (
    <>
      {!canManage ? (
        <p className="rounded-xl border border-info-400/25 bg-info-500/8 px-3 py-2 text-xs text-info-400">
          You can view the directory — administrators can create accounts, edit details and reset passwords.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Accounts"
          subtitle={`${users.length} people across the estate`}
          icon={<UsersIcon size={16} />}
          action={
            canManage ? (
              <Button variant="primary" size="sm" icon={<PlusIcon size={15} />} onClick={() => setEditor({ mode: 'create' })}>
                Add user
              </Button>
            ) : null
          }
        />

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Search">
            <Input value={filter.q} onChange={(event) => setFilter((current) => ({ ...current, q: event.target.value }))} placeholder="Name, email or zone…" />
          </Field>
          <Field label="Role">
            <Select value={filter.role} onChange={(event) => setFilter((current) => ({ ...current, role: event.target.value }))}>
              <option value="">All roles</option>
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLE_META[role].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-14" />
            ))}
          </div>
        ) : filtered.length ? (
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="text-[10px] tracking-[0.12em] text-ink-400 uppercase">
                  <th className="pb-2 pr-4 font-semibold">Person</th>
                  <th className="pb-2 pr-4 font-semibold">Role</th>
                  <th className="pb-2 pr-4 font-semibold">Level</th>
                  <th className="pb-2 pr-4 font-semibold">Zone</th>
                  <th className="pb-2 pr-4 font-semibold">Skills</th>
                  <th className="pb-2 pr-4 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Joined</th>
                  {canManage ? <th className="pb-2 pl-2 text-right font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-400/10">
                {filtered.map((user) => (
                  <tr key={user.id} className="group">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar user={user} size={32} />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink-100">{user.name}</p>
                          <p className="truncate text-[10px] text-ink-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Pill tone={ROLE_META[user.role].tone}>{ROLE_META[user.role].label}</Pill>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-ink-300">{LEVEL_META[user.level]?.label ?? '—'}</td>
                    <td className="py-2.5 pr-4 text-xs text-ink-300">{user.zone ?? '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs text-ink-300">
                        {user.role === 'TECHNICIAN' ? `${user.skills?.length ?? 0} skills` : '—'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {user.role === 'TECHNICIAN' ? <AvailablePill available={user.is_available} /> : <span className="text-[11px] text-ink-500">—</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-[11px] text-ink-400">{formatDateTime(user.created_at)}</td>
                    {canManage ? (
                      <td className="py-2.5 pl-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <IconButton label={`Edit ${user.name}`} icon="✎" onClick={() => setEditor({ mode: 'edit', user })} />
                          <IconButton
                            label={`Reset password for ${user.name}`}
                            icon="🔑"
                            onClick={() => {
                              setResetTarget(user);
                              setResetPassword('');
                            }}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="👥" title="No matching accounts" description="Try a different search or role filter." />
        )}
      </Card>

      {editor ? (
        <UserEditor
          open
          onClose={() => setEditor(null)}
          initial={editor.mode === 'edit' ? editor.user : null}
          categories={categories}
          zones={zones}
          onSaved={load}
        />
      ) : null}

      <Modal
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title="Reset password"
        subtitle={`A new temporary password for ${resetTarget?.name}. They can change it afterwards in Settings.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetTarget(null)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={confirmReset} loading={resetting} disabled={resetPassword.length < 8}>
              Set password
            </Button>
          </>
        }
      >
        <Field label="New password" required hint="Min 8 characters">
          <Input
            type="password"
            autoFocus
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && resetPassword.length >= 8) confirmReset();
            }}
          />
        </Field>
      </Modal>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export function TeamPage() {
  const { isManager, isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'people' && isManager ? 'people' : 'roster';

  const setTab = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'roster') next.delete('tab');
    else next.set('tab', value);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Pill tone="brand">
            <WrenchIcon size={13} /> Field operations
          </Pill>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {tab === 'people' ? 'People & accounts' : 'Technicians'}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-300">
            {tab === 'people'
              ? 'Every account on the platform, with the role and permissions each person carries.'
              : 'Skills, availability and live workload — the same signals the assignment engine uses to route jobs.'}
          </p>
        </div>
        {tab === 'roster' ? (
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <RefreshIcon size={13} /> Presence and loads update live
          </div>
        ) : null}
      </header>

      {isManager ? (
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'roster', label: 'Technician roster' },
            { value: 'people', label: 'All accounts' },
          ]}
        />
      ) : null}

      {tab === 'roster' ? <RosterTab /> : <PeopleTab canManage={isAdmin} />}
    </div>
  );
}