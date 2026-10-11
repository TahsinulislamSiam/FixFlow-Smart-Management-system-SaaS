import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, tokenStore } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready
  const [error, setError] = useState(null);

  const bootstrap = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(null);
      setStatus('ready');
      return;
    }
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email, password) => {
    setError(null);
    const result = await api.login(email, password);
    tokenStore.set(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (input) => {
    setError(null);
    const result = await api.register(input);
    tokenStore.set(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const updateProfile = useCallback(async (input) => {
    const { user: updated } = await api.updateMe(input);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      error,
      setError,
      isAuthenticated: Boolean(user),
      isManager: user?.role === 'ADMIN' || user?.role === 'MANAGER',
      isAdmin: user?.role === 'ADMIN',
      isTechnician: user?.role === 'TECHNICIAN',
      isRequester: user?.role === 'REQUESTER',
      login,
      register,
      logout,
      updateProfile,
      refresh: bootstrap,
    }),
    [user, status, error, login, register, logout, updateProfile, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

/** Route guard: redirects to /login (or / if the role is wrong). */
export function RequireAuth({ children, roles }) {
  const { isAuthenticated, status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-400" />
          <p className="text-sm text-ink-300">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
