import { Link } from 'react-router-dom';
import { cx, relativeTime } from '../lib/format.js';
import { Avatar, Button, EmptyState, Pill, Skeleton } from './ui.jsx';

const KIND_TONE = { CRITICAL: 'danger', WARNING: 'warn', SUCCESS: 'ok', INFO: 'info' };
const KIND_ICON = { CRITICAL: '🚨', WARNING: '⚠️', SUCCESS: '✅', INFO: '🔔' };

export function NotificationPanel({ open, onClose, notifications }) {
  const { items, unread, loading, markRead, markAllRead, dismiss } = notifications;

  return (
    <>
      <div
        className={cx(
          'fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cx(
          'surface surface-raised fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col rounded-none border-y-0 border-r-0 transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-label="Notifications"
      >
        <header className="flex items-center justify-between gap-2 border-b border-ink-400/15 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              Notifications
              {unread > 0 ? <Pill tone="danger">{unread} new</Pill> : null}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-400">Assignments, SLA alerts and replies</p>
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 ? (
              <Button variant="ghost" size="xs" onClick={markAllRead}>
                Mark all read
              </Button>
            ) : null}
            <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close notifications">
              ✕
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 scroll-slim">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon="🔔" title="You're all caught up" description="New assignments and SLA alerts will appear here in real time." />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={cx(
                    'group rounded-xl border p-3 transition',
                    item.is_read ? 'border-ink-400/12 bg-white/2' : 'border-brand-400/30 bg-brand-500/8',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-base leading-none" aria-hidden>
                      {KIND_ICON[item.kind] ?? '🔔'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-ink-100">{item.title}</p>
                        <Pill tone={KIND_TONE[item.kind] ?? 'neutral'} className="shrink-0">
                          {item.kind}
                        </Pill>
                      </div>
                      {item.body ? <p className="mt-1 text-xs leading-relaxed text-ink-300">{item.body}</p> : null}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[11px] text-ink-400">{relativeTime(item.created_at)}</span>
                        {item.link ? (
                          <Link
                            to={item.link}
                            onClick={() => {
                              markRead(item.id);
                              onClose?.();
                            }}
                            className="text-[11px] font-semibold text-brand-300 hover:text-brand-200"
                          >
                            Open ticket →
                          </Link>
                        ) : null}
                        {!item.is_read ? (
                          <button
                            type="button"
                            onClick={() => markRead(item.id)}
                            className="text-[11px] text-ink-400 hover:text-ink-200"
                          >
                            Mark read
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => dismiss(item.id)}
                          className="ml-auto text-[11px] text-ink-500 opacity-0 transition group-hover:opacity-100 hover:text-danger-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-ink-400/15 p-3">
          <div className="flex items-center gap-2 text-[11px] text-ink-400">
            <Avatar user={{ name: 'FixFlow', avatar_color: '#22d3ee' }} size={20} ring={false} />
            Delivered instantly over websockets
          </div>
        </footer>
      </aside>
    </>
  );
}
