import { PageHeader } from '@/components/layout/PageHeader';
import { Callout, ErrorState, Skeleton } from '@/components/ui/feedback';
import { useConnections } from '@/hooks/useData';
import { useAuth } from '@/state/auth';
import { ConnectionForm } from '@/features/connections/ConnectionForm';
import type { ExternalConnection } from '@/types/api';

const keyOf = (c: ExternalConnection) => `${c.enabled}-${c.host}-${c.port}-${c.database}-${c.user}-${c.ssl}-${c.hasPassword}`;

export function ConexoesPage() {
  const { can } = useAuth();
  const canManage = can('connections.manage');
  const { data, isLoading, isError, error, refetch } = useConnections();

  return (
    <>
      <PageHeader
        title="Conexões"
        description="Bancos usados além das bases dos clientes. Ficam em config/credentials.env deste servidor."
      />
      {!canManage && (
        <div className="mb-4">
          <Callout tone="info">Você pode ver as conexões, mas só quem tem a permissão "Gerenciar conexões" pode alterá-las.</Callout>
        </div>
      )}
      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-lg" />
          <Skeleton className="h-96 rounded-lg" />
        </div>
      ) : isError || !data ? (
        <ErrorState message={(error as Error)?.message ?? 'Sem dados.'} onRetry={() => void refetch()} className="rounded-lg border border-line bg-surface" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <ConnectionForm
            key={keyOf(data.atendimentos)}
            type="ATENDIMENTOS"
            title="Banco de atendimentos"
            description="Origem dos indicadores de chamados (estatistica.chamados_bi)."
            value={data.atendimentos}
            canManage={canManage}
          />
          <ConnectionForm
            key={keyOf(data.central)}
            type="CENTRAL"
            title="Banco central do coletor"
            description="Disponível como origem na busca SQL personalizada."
            value={data.central}
            canManage={canManage}
          />
        </div>
      )}
    </>
  );
}
