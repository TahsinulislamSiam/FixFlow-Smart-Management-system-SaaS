import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, ApiError } from '../lib/api.js';
import { formatDuration } from '../lib/format.js';
import { Button, Field, Input, Pill } from '../components/ui.jsx';
import { CameraIcon, ChartIcon, SparkIcon, WrenchIcon } from '../components/icons.jsx';

const FEATURES = [
  {
    icon: CameraIcon,
    title: 'Report with photo & location',
    body: 'Anyone can raise a ticket in seconds — photos, GPS and site details included.',
  },
  {
    icon: SparkIcon,
    title: 'AI triage on arrival',
    body: 'The complaint is categorised, prioritised and scanned for safety signals automatically.',
  },
  {
    icon: WrenchIcon,
    title: 'Skill & workload routing',
    body: 'The best-matched technician is chosen by trade, zone, seniority and spare capacity.',
  },
  {
    icon: ChartIcon,
    title: 'SLA and response analytics',
    body: 'Response times, breach risk and repeat-offender locations, live on one board.',
  },
];

export function AuthLayout({ children }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.meta
      .publicStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
      {/* Story panel */}
      <section className="relative flex flex-1 flex-col justify-between gap-8 overflow-hidden p-6 sm:p-10 lg:p-14">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-accent-500 text-xl font-black text-white shadow-[0_16px_40px_-16px_rgba(99,102,241,1)]">
            F
          </span>
          <div>
            <p className="text-lg leading-tight font-bold text-white">FixFlow</p>
            <p className="text-[11px] tracking-[0.2em] text-ink-400 uppercase">Smart maintenance OS</p>
          </div>
        </header>

        <div className="max-w-xl">
          <Pill tone="brand" className="mb-4">
            <SparkIcon size={13} /> AI-assisted facilities management
          </Pill>
          <h1 className="text-3xl leading-[1.1] font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
            Every maintenance problem,
            <span className="bg-gradient-to-r from-brand-300 to-accent-300 bg-clip-text text-transparent"> fixed faster and tracked end to end.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-300 sm:text-base">
            FixFlow is where apartments, offices, universities and businesses report faults, route them to the right
            technician, and prove the fix — with response-time analytics on top.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="surface p-4">
                <feature.icon size={18} className="text-accent-400" />
                <h2 className="mt-2.5 text-sm font-semibold text-ink-100">{feature.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-400">
          {stats ? (
            <>
              <span>
                <strong className="text-ink-100">{stats.tickets_reported}</strong> issues tracked
              </span>
              <span>
                <strong className="text-ink-100">{stats.sla_compliance_pct}%</strong> SLA compliance
              </span>
              {stats.avg_resolution_minutes != null ? (
                <span>
                  avg fix <strong className="text-ink-100">{formatDuration(stats.avg_resolution_minutes)}</strong>
                </span>
              ) : null}
              <span>
                <strong className="text-ink-100">{stats.technicians}</strong> technicians
              </span>
            </>
          ) : (
            <span>Seeded demo workspace · runs entirely on your machine</span>
          )}
        </div>
      </section>

      {/* Form panel */}
      <section className="flex w-full items-center justify-center border-ink-400/12 p-6 sm:p-10 lg:max-w-[540px] lg:border-l">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);
  const [demo, setDemo] = useState(null);
  const [pendingEmail, setPendingEmail] = useState(null);

  useEffect(() => {
    api.demoAccounts()
      .then(setDemo)
      .catch(() => setDemo(null));
  }, []);

  const submit = async (event, override) => {
    event?.preventDefault();
    const credentials = override ?? { email, password };
    if (!override) setPendingEmail(null);
    setLoading(true);
    setError(null);
    setDetails(null);
    try {
      const user = await login(credentials.email, credentials.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`, 'Signed in successfully.');
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Could not sign you in.';
      setError(message);
      setDetails(caught?.details ?? null);
      if (override) setPendingEmail(credentials.email);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (account) => {
    setPendingEmail(account.email);
    setEmail(account.email);
    setPassword(demo?.password ?? 'FixFlow123!');
    submit(null, { email: account.email, password: demo?.password ?? 'FixFlow123!' });
  };

  const grouped = (demo?.accounts ?? []).reduce((accumulator, account) => {
    const key = account.role === 'TECHNICIAN' ? 'TECHNICIAN' : account.role;
    (accumulator[key] ??= []).push(account);
    return accumulator;
  }, {});

  const roleLabels = { ADMIN: 'Administrator', MANAGER: 'Managers', TECHNICIAN: 'Technicians', REQUESTER: 'Reporters' };

  return (
    <AuthLayout>
      <div className="surface surface-raised p-6 sm:p-7">
        <h2 className="text-xl font-bold text-white">Sign in to FixFlow</h2>
        <p className="mt-1 text-xs text-ink-400">
          Use a demo persona below, or sign in with the account you registered.
        </p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <Field label="Work email" required error={details?.email}>
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={Boolean(details?.email)}
              required
            />
          </Field>

          <Field label="Password" required error={details?.password}>
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(details?.password)}
              required
            />
          </Field>

          {error && !details ? (
            <p className="rounded-xl border border-danger-400/35 bg-danger-500/10 px-3 py-2 text-xs text-danger-400">{error}</p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading && !pendingEmail}>
            Sign in
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-400">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-300 hover:text-brand-200">
            Create an account
          </Link>
        </p>
      </div>

      {demo?.accounts?.length ? (
        <div className="surface mt-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold tracking-[0.14em] text-ink-300 uppercase">One-click demo logins</h3>
            <Pill tone="neutral">password: {demo.password}</Pill>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
            The workspace is seeded with three weeks of tickets, technicians and SLA history.
          </p>

          <div className="mt-4 space-y-3">
            {['ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER'].map((role) =>
              grouped[role]?.length ? (
                <div key={role}>
                  <p className="mb-1.5 text-[11px] font-semibold text-ink-400">{roleLabels[role]}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {grouped[role].slice(0, role === 'TECHNICIAN' ? 4 : 2).map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => quickLogin(account)}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-xl border border-ink-400/18 bg-white/3 px-2.5 py-2 text-left transition hover:border-brand-400/45 hover:bg-brand-500/10 disabled:opacity-50"
                      >
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                          style={{ background: account.avatar_color ?? '#6366f1' }}
                        >
                          {account.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-ink-100">{account.name}</span>
                          <span className="block truncate text-[10px] text-ink-400">{account.title ?? account.email}</span>
                        </span>
                        {pendingEmail === account.email && loading ? (
                          <span className="ml-auto text-[10px] text-brand-300">signing in…</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </AuthLayout>
  );
}
