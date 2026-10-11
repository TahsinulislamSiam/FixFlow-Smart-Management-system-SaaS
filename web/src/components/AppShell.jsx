import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cx } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from '../context/RealtimeContext.jsx';
import { useNotifications } from '../hooks/useNotifications.js';
import { NotificationPanel } from './NotificationPanel.jsx';
import { ROLE_META } from '../lib/constants.js';
import { Avatar, Button, Dot, Pill } from './ui.jsx';
import {
  BellIcon,
  ChartIcon,
  CogIcon,
  GridIcon,
  LogOutIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SparkIcon,
  TicketIcon,
  UsersIcon,
} from './icons.jsx';

function useNavItems() {
  const { isManager, isAdmin, isRequester } = useAuth();
  return useMemo(() => {
    const items = [
      { to: '/', label: 'Dashboard', icon: GridIcon, end: true },
      {
        to: '/tickets',
        label: isRequester ? 'My requests' : isManager ? 'Ticket queue' : 'My work',
        icon: TicketIcon,
      },
      { to: '/new', label: 'Report an issue', icon: PlusIcon },
    ];
    if (!isRequester) items.push({ to: '/team', label: 'Technicians', icon: UsersIcon });
    if (isManager) items.push({ to: '/analytics', label: 'Analytics', icon: ChartIcon });
    if (isAdmin) items.push({ to: '/team?tab=people', label: 'User accounts', icon: UsersIcon });
    items.push({ to: '/settings', label: 'Settings', icon: CogIcon });
    return items;
  }, [isManager, isAdmin, isRequester]);
}

function Logo({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-accent-500 shadow-[0_10px_30px_-12px_rgba(99,102,241,1)]">
        <span className="text-lg font-black text-white">F</span>
      </span>
      {!compact ? (
        <span className="leading-tight">
          <span className="block text-sm font-bold tracking-tight text-white">FixFlow</span>
          <span className="block text-[10px] tracking-[0.16em] text-ink-400 uppercase">Maintenance OS</span>
        </span>
      ) : null}
    </Link>
  );
}

export function AppShell() {
  const { user, logout, isManager } = useAuth();
  const { status: realtimeStatus, onlineCount } = useRealtime();
  const notifications = useNotifications();
  const navItems = useNavItems();
  const navigate = useNavigate();
  const location = useLocation();

  const [panelOpen, setPanelOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    setNavOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onSearch = (event) => {
    event.preventDefault();
    navigate(`/tickets?q=${encodeURIComponent(query.trim())}`);
  };

  const roleMeta = ROLE_META[user.role] ?? ROLE_META.REQUESTER;

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between">
        <Logo />
        <span className="lg:hidden">
          <Button variant="ghost" size="xs" onClick={() => setNavOpen(false)} aria-label="Close menu">
            ✕
          </Button>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={`${item.to}-${item.label}`}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                'nav-link',
                isActive && 'bg-brand-500/20 font-semibold text-white shadow-[inset_2px_0_0_#818cf8]',
              )
            }
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3">
        <div className="surface p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-ink-300 uppercase">
            <SparkIcon size={14} className="text-accent-400" />
            AI triage
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
            Every new report is categorised, prioritised and routed automatically — with safety signals escalated first.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <Dot tone={realtimeStatus === 'live' ? 'ok' : 'warn'} pulse={realtimeStatus === 'live'} />
            <span className="text-[11px] text-ink-300">
              {realtimeStatus === 'live' ? 'Realtime connected' : realtimeStatus === 'connecting' ? 'Connecting…' : 'Offline'}
              {onlineCount ? ` · ${onlineCount} online` : ''}
            </span>
          </div>
        </div>

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            className="surface flex w-full items-center gap-3 p-2.5 text-left transition hover:border-brand-400/40"
          >
            <Avatar user={user} size={34} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-100">{user.name}</span>
              <span className="block truncate text-[11px] text-ink-400">{roleMeta.label}</span>
            </span>
            <span className="text-ink-400" aria-hidden>
              ⌄
            </span>
          </button>

          {userMenuOpen ? (
            <div className="surface surface-raised animate-pop absolute bottom-14 left-0 z-30 w-full p-1.5">
              <Link to="/settings" className="block rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-white/6">
                Profile &amp; preferences
              </Link>
              {isManager ? (
                <Link to="/analytics" className="block rounded-lg px-3 py-2 text-sm text-ink-200 hover:bg-white/6">
                  Analytics workspace
                </Link>
              ) : null}
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger-400 hover:bg-danger-500/10"
              >
                <LogOutIcon size={16} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 border-r border-ink-400/12 bg-ink-925/70 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />
          <aside className="animate-fade-in fixed inset-y-0 left-0 z-50 w-[272px] border-r border-ink-400/15 bg-ink-925 lg:hidden">
            {sidebar}
          </aside>
        </>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-400/12 bg-ink-950/75 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <span className="lg:hidden">
              <Button variant="secondary" size="sm" onClick={() => setNavOpen(true)} aria-label="Open menu" icon={<MenuIcon size={16} />} />
            </span>

            <form onSubmit={onSearch} className="relative hidden min-w-0 flex-1 sm:block sm:max-w-md">
              <SearchIcon size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tickets, locations, codes…"
                className="field pl-9"
                aria-label="Search tickets"
              />
            </form>

            <div className="ml-auto flex items-center gap-2">
              <Pill tone={realtimeStatus === 'live' ? 'ok' : 'warn'} className="hidden sm:inline-flex">
                <Dot tone={realtimeStatus === 'live' ? 'ok' : 'warn'} pulse={realtimeStatus === 'live'} />
                {realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'connecting' ? 'Syncing' : 'Offline'}
              </Pill>

              <Button
                variant="primary"
                size="sm"
                icon={<PlusIcon size={15} />}
                className="hidden sm:inline-flex"
                onClick={() => navigate('/new')}
              >
                New request
              </Button>

              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-ink-400/20 bg-white/4 text-ink-200 transition hover:border-brand-400/40 hover:text-white"
                aria-label={`Notifications${notifications.unread ? ` (${notifications.unread} unread)` : ''}`}
              >
                <BellIcon size={17} />
                {notifications.unread > 0 ? (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] font-bold text-white">
                    {notifications.unread > 9 ? '9+' : notifications.unread}
                  </span>
                ) : null}
              </button>

              <Link to="/settings" className="hidden sm:block" aria-label="Your profile">
                <Avatar user={user} size={34} />
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>

        <footer className="px-4 pb-6 text-center text-[11px] text-ink-500 sm:px-6">
          FixFlow · smart maintenance management demo · {new Date().getFullYear()}
        </footer>
      </div>

      <NotificationPanel open={panelOpen} onClose={() => setPanelOpen(false)} notifications={notifications} />
    </div>
  );
}
