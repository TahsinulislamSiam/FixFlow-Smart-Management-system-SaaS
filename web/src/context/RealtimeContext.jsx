import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { tokenStore } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

/**
 * Single websocket connection for the whole app.
 *
 * Components subscribe with `useRealtimeEvent('ticket:updated', handler)`
 * instead of creating their own sockets — one connection, many listeners,
 * automatic reconnection and a visible connection status in the top bar.
 */
const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());
  const [status, setStatus] = useState('idle'); // idle | connecting | live | offline
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus('idle');
      return undefined;
    }

    const token = tokenStore.get();
    if (!token) return undefined;

    setStatus('connecting');
    const socket = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelay: 800 });
    socketRef.current = socket;

    const dispatch = (event, payload) => {
      for (const handler of listenersRef.current.get(event) ?? []) {
        try {
          handler(payload);
        } catch (error) {
          console.error('[fixflow] realtime handler failed', event, error);
        }
      }
    };

    socket.on('connect', () => setStatus('live'));
    socket.on('disconnect', () => setStatus('offline'));
    socket.on('connect_error', () => setStatus('offline'));
    socket.on('presence:update', (payload) => setOnlineUsers(payload?.online ?? []));

    const forwarded = [
      'notification',
      'ticket:created',
      'ticket:updated',
      'ticket:status',
      'ticket:assigned',
      'ticket:commented',
      'ticket:attachment',
      'stats:dirty',
      'sla:breached',
    ];
    for (const event of forwarded) socket.on(event, (payload) => dispatch(event, payload));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setStatus('idle');
    };
  }, [isAuthenticated, user]);

  const subscribe = useCallback((event, handler) => {
    if (!listenersRef.current.has(event)) listenersRef.current.set(event, new Set());
    listenersRef.current.get(event).add(handler);
    return () => {
      listenersRef.current.get(event)?.delete(handler);
    };
  }, []);

  const joinTicket = useCallback((ticketId) => {
    socketRef.current?.emit('ticket:subscribe', ticketId);
    return () => socketRef.current?.emit('ticket:unsubscribe', ticketId);
  }, []);

  const value = useMemo(
    () => ({
      status,
      isLive: status === 'live',
      onlineUsers,
      onlineCount: onlineUsers.length,
      subscribe,
      joinTicket,
      socket: socketRef,
    }),
    [status, onlineUsers, subscribe, joinTicket],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return context;
}

/** Subscribe to one realtime event for the lifetime of a component. */
export function useRealtimeEvent(event, handler) {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => subscribe(event, (payload) => ref.current?.(payload)), [event, subscribe]);
}

/** Re-run a callback whenever any of the given realtime events fire. */
export function useRefreshOn(events, callback, deps = []) {
  const { subscribe } = useRealtime();
  const ref = useRef(callback);
  ref.current = callback;

  useEffect(() => {
    const unsubscribers = events.map((event) => subscribe(event, (payload) => ref.current?.(payload)));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, events.join('|'), ...deps]);
}
