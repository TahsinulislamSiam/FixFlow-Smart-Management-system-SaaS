import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useRealtimeEvent } from '../context/RealtimeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

/**
 * Notification inbox: server-persisted list + live push.
 * A realtime `notification` event prepends the item, bumps the badge and
 * surfaces a toast (except for the person who triggered it).
 */
export function useNotifications({ toastOnPush = true } = {}) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const result = await api.notifications.list({ limit: 40 });
      setItems(result.notifications ?? []);
      setUnread(result.unread ?? 0);
    } catch {
      /* silent — the bell simply shows nothing */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('notification', (payload) => {
    if (!payload) return;
    setItems((current) => {
      if (current.some((item) => item.id === payload.id)) return current;
      return [payload, ...current].slice(0, 40);
    });
    setUnread((current) => current + 1);
    if (toastOnPush) {
      const tone = payload.kind === 'CRITICAL' ? 'error' : payload.kind === 'WARNING' ? 'warn' : 'info';
      toast[tone === 'error' ? 'error' : tone === 'warn' ? 'warn' : 'info'](payload.title, payload.body ?? undefined);
    }
  });

  const markRead = useCallback(async (id) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    try {
      const result = await api.notifications.read(id);
      setUnread(result.unread ?? 0);
    } catch {
      /* keep the optimistic state */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnread(0);
    try {
      await api.notifications.readAll();
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(async (id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try {
      const result = await api.notifications.remove(id);
      setUnread(result.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  return { items, unread, loading, reload: load, markRead, markAllRead, dismiss };
}
