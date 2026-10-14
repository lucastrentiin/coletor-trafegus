import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth';
import type { AuthMe, PermissionCode } from '@/types/api';

interface AuthState {
  /** false no modo local (arquivo): sem login, tudo liberado. */
  authEnabled: boolean;
  user: AuthMe['user'];
  profiles: AuthMe['profiles'];
  /** Verifica permissão. No modo local sempre true, exceto telas que só existem com login. */
  can: (code: PermissionCode, options?: { requiresAuth?: boolean }) => boolean;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

export function AuthProvider({ me, children }: { me: AuthMe; children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data = me } = useQuery({ queryKey: AUTH_QUERY_KEY, queryFn: authService.me, initialData: me, staleTime: 60_000 });

  const can = useCallback<AuthState['can']>(
    (code, options) => {
      if (!data.authEnabled) return !options?.requiresAuth;
      return data.permissions.includes(code);
    },
    [data],
  );

  const value = useMemo<AuthState>(
    () => ({
      authEnabled: data.authEnabled,
      user: data.user,
      profiles: data.profiles,
      can,
      refresh: () => queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY }),
    }),
    [data, can, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}
