import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ConfirmProvider } from '@/components/ui/confirm';
import { TooltipProvider } from '@/components/ui/menu';
import { ErrorState } from '@/components/ui/feedback';
import { LogoMark } from '@/components/layout/Logo';
import { useTheme } from '@/hooks/useTheme';
import { authService } from '@/services/auth';
import { ApiError } from '@/services/http';
import { AuthProvider } from '@/state/auth';
import { ConsultaProvider } from '@/state/consulta';
import type { AuthMe } from '@/types/api';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && [401, 403].includes(error.status)) && count < 1,
    },
  },
});

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-ink-3" role="status">
      <LogoMark className="size-8 animate-pulse text-ink" />
      <span className="sr-only">Carregando o Coletor</span>
    </div>
  );
}

/** Carrega a sessão antes de montar as telas; sem sessão válida vai para o login. */
function SessionGate() {
  const [me, setMe] = useState<AuthMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authService
      .me()
      .then((data) => {
        if (!active) return;
        if (data.authEnabled && !data.user) window.location.assign('/login.html');
        else setMe(data);
      })
      .catch((err: Error) => {
        if (!active) return;
        // Sem sessão o backend responde 401 também para /api/auth/me.
        if (err instanceof ApiError && err.status === 401) window.location.assign('/login.html');
        else setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (error)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  if (!me) return <Splash />;

  return (
    <AuthProvider me={me}>
      <ConsultaProvider>
        <RouterProvider router={router} />
      </ConsultaProvider>
    </AuthProvider>
  );
}

export function App() {
  const { resolved } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ConfirmProvider>
          <SessionGate />
        </ConfirmProvider>
      </TooltipProvider>
      <Toaster
        theme={resolved}
        position="bottom-right"
        closeButton
        toastOptions={{ classNames: { toast: 'font-sans !text-sm !rounded-lg !border-line', description: '!text-ink-2' } }}
      />
    </QueryClientProvider>
  );
}
