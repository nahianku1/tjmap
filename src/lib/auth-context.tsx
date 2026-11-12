'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onSessionLost, refreshSession, scheduleSilentRefresh, setAccessToken, stopSilentRefresh } from './api';
import type { AuthResponse, User } from './types';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: Status;
  isAdmin: boolean;
  login: (input: { email: string; password: string }) => Promise<User>;
  signup: (input: {
    name: string;
    email: string;
    mobile: string;
    password: string;
    role: 'user' | 'admin';
  }) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(session: AuthResponse, setUser: (user: User | null) => void) {
  setAccessToken(session.accessToken);
  scheduleSilentRefresh(session.expiresIn);
  setUser(session.user);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    onSessionLost(() => {
      setUser(null);
      setStatus('anonymous');
      stopSilentRefresh();
    });
    return () => onSessionLost(null);
  }, []);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        // refreshSession() de-duplicates concurrent calls, so StrictMode's
        // double-invoked effect still hydrates the session exactly once.
        const session = await refreshSession();
        if (disposed) return;
        if (session) {
          applySession(session, setUser);
          setStatus('authenticated');
          return;
        }
        setStatus('anonymous');
      } catch {
        if (!disposed) setStatus('anonymous');
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const session = await api.login(input);
    applySession(session, setUser);
    setStatus('authenticated');
    return session.user;
  }, []);

  const signup = useCallback(
    async (input: {
      name: string;
      email: string;
      mobile: string;
      password: string;
      role: 'user' | 'admin';
    }) => {
      const session = await api.signup(input);
      applySession(session, setUser);
      setStatus('authenticated');
      return session.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network failures on sign-out.
    }
    setAccessToken(null);
    stopSilentRefresh();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAdmin: user?.role === 'admin',
      login,
      signup,
      logout,
    }),
    [user, status, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
