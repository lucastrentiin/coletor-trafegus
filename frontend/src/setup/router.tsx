import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Link } from 'react-router';
import { Lock } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { useAuth } from '@/state/auth';
import type { PermissionCode } from '@/types/api';
import { DashboardPage } from '@/screens/DashboardPage';
import { NotFoundPage } from '@/screens/NotFoundPage';
import { VpnStatusWidget } from '@/features/vpns/VpnStatusWidget';

// Painel carrega junto; as demais telas só quando abertas.
const ConsultaPage = lazy(() => import('@/screens/ConsultaPage').then((m) => ({ default: m.ConsultaPage })));
const AtendimentosPage = lazy(() => import('@/screens/AtendimentosPage').then((m) => ({ default: m.AtendimentosPage })));
const ClientesPage = lazy(() => import('@/screens/ClientesPage').then((m) => ({ default: m.ClientesPage })));
const ConexoesPage = lazy(() => import('@/screens/ConexoesPage').then((m) => ({ default: m.ConexoesPage })));
const VpnsPage = lazy(() => import('@/screens/VpnsPage').then((m) => ({ default: m.VpnsPage })));
const LogsPage = lazy(() => import('@/screens/LogsPage').then((m) => ({ default: m.LogsPage })));
const UsuariosPage = lazy(() => import('@/screens/UsuariosPage').then((m) => ({ default: m.UsuariosPage })));
const PerfisPage = lazy(() => import('@/screens/PerfisPage').then((m) => ({ default: m.PerfisPage })));

function PageFallback() {
  return (
    <div role="status" aria-label="Carregando tela">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mt-6 h-64 rounded-lg" />
    </div>
  );
}

function Guard({ permission, requiresAuth, children }: { permission: PermissionCode; requiresAuth?: boolean; children: ReactNode }) {
  const { can, authEnabled } = useAuth();
  if (can(permission, { requiresAuth })) return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
  return (
    <EmptyState
      icon={<Lock />}
      title={requiresAuth && !authEnabled ? 'Disponível apenas com login' : 'Você não tem acesso a esta tela'}
      description={
        requiresAuth && !authEnabled
          ? 'Este ambiente roda em modo local, sem banco de aplicação. Usuários e perfis existem só quando o login está ativo.'
          : 'Peça a um gestor para incluir a permissão no seu perfil de acesso.'
      }
      action={
        <Link to="/" className="text-sm font-medium text-ink underline underline-offset-4">
          Voltar ao painel
        </Link>
      }
    />
  );
}

// Hash router: o web/server.js só serve arquivos que existem, então as rotas
// ficam depois do "#" e um recarregamento nunca cai em 404.
export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Guard permission="dashboard.view"><DashboardPage /><VpnStatusWidget /></Guard> },
      { path: 'consulta', element: <Guard permission="consulta.view"><ConsultaPage /><VpnStatusWidget /></Guard> },
      { path: 'atendimentos', element: <Guard permission="attendance.view"><AtendimentosPage /></Guard> },
      { path: 'clientes', element: <Guard permission="clients.view"><ClientesPage /></Guard> },
      { path: 'conexoes', element: <Guard permission="config.view"><ConexoesPage /></Guard> },
      { path: 'vpns', element: <Guard permission="config.view"><VpnsPage /></Guard> },
      { path: 'logs', element: <Guard permission="logs.view"><LogsPage /></Guard> },
      { path: 'usuarios', element: <Guard permission="users.view" requiresAuth><UsuariosPage /></Guard> },
      { path: 'perfis', element: <Guard permission="profiles.view" requiresAuth><PerfisPage /></Guard> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
