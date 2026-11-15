'use client';

import type { LoginRequest, Permission, Session } from '@bytecontent/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { api, ApiRequestError } from './api-client';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  login: (input: LoginRequest) => Promise<Session>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  setSession: (session: Session) => void;
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const SESSION_KEY = ['session'] as const;

async function fetchSession(): Promise<Session | null> {
  try {
    const res = await api.request<{ data: Session }>('/auth/session');
    api.setCsrfToken(res.data.csrfToken);
    return res.data;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      api.setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: 60_000 });

  const setSession = useCallback(
    (session: Session) => {
      api.setCsrfToken(session.csrfToken);
      queryClient.setQueryData(SESSION_KEY, session);
    },
    [queryClient],
  );

  const login = useCallback(
    async (input: LoginRequest) => {
      const res = await api.request<{ data: Session }>('/auth/login', {
        method: 'POST',
        body: input,
      });
      queryClient.clear();
      setSession(res.data);
      return res.data;
    },
    [queryClient, setSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.request('/auth/logout', { method: 'POST' });
    } finally {
      api.setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    }
  }, [queryClient]);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      const res = await api.request<{ data: Session }>('/auth/switch-tenant', {
        method: 'POST',
        body: { tenantId },
      });
      // Everything cached belongs to the previous tenant.
      queryClient.clear();
      setSession(res.data);
    },
    [queryClient, setSession],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      session: query.data ?? null,
      loading: query.isLoading,
      login,
      logout,
      switchTenant,
      setSession,
      can: (permission) => query.data?.permissions.includes(permission) ?? false,
    }),
    [query.data, query.isLoading, login, logout, switchTenant, setSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
