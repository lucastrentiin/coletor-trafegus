import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { SearchInput, Segmented, TabPanel, Tabs } from '@/components/ui/controls';
import { ErrorState, Kbd, SkeletonRows } from '@/components/ui/feedback';
import { useClients, useCredentialGroups } from '@/hooks/useData';
import { useHotkey } from '@/hooks/useHotkey';
import { usePersistentState } from '@/hooks/usePersistentState';
import { normalizeSearch } from '@/lib/format';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import type { Client } from '@/types/api';
import { ClientsTable } from '@/features/clients/ClientsTable';
import { ClientFormSheet } from '@/features/clients/ClientFormSheet';
import { GroupsPanel } from '@/features/clients/GroupsPanel';
import { clientState, type ClientHealth } from '@/features/clients/clientStatus';

type Filter = 'todos' | ClientHealth;
type Tab = 'clientes' | 'grupos';

export function ClientesPage() {
  const { can } = useAuth();
  const canManage = can('clients.manage');
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('aba') === 'grupos' && canManage ? 'grupos' : 'clientes';
  const clientsQuery = useClients();
  const groupsQuery = useCredentialGroups(canManage);
  const { clientErrors } = useConsulta();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = usePersistentState<Filter>('clientes:filtro', 'todos');
  const [editing, setEditing] = useState<Client | 'new' | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkey('/', () => searchRef.current?.focus());

  const withHealth = useMemo(
    () => (clientsQuery.data ?? []).map((client) => ({ client, health: clientState(client, clientErrors[String(client.id)]).health })),
    [clientsQuery.data, clientErrors],
  );
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { todos: withHealth.length, ativo: 0, desabilitado: 0, erro: 0 };
    withHealth.forEach((row) => (result[row.health] += 1));
    return result;
  }, [withHealth]);

  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    return withHealth
      .filter((row) => filter === 'todos' || row.health === filter)
      .filter(({ client }) => !term || normalizeSearch(`${client.name} ${client.host} ${client.database} ${client.credentialGroup} ${client.sshHost}`).includes(term))
      .map((row) => row.client);
  }, [withHealth, filter, search]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Bases PostgreSQL consultadas pelo coletor. Falhas de conexão desabilitam o cliente e registram o motivo."
        actions={
          canManage &&
          tab === 'clientes' && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              Novo cliente
            </Button>
          )
        }
      />

      {canManage && (
        <Tabs
          value={tab}
          onValueChange={(next) => setParams(next === 'grupos' ? { aba: 'grupos' } : {}, { replace: true })}
          tabs={[
            { value: 'clientes', label: 'Clientes', count: clientsQuery.data?.length },
            { value: 'grupos', label: 'Grupos de credencial', count: groupsQuery.data?.length },
          ]}
          className="mb-4"
        >
          <TabPanel value="grupos" className="pt-4">
            <GroupsPanel />
          </TabPanel>
        </Tabs>
      )}

      {tab === 'clientes' && (
        <Panel bodyClassName="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <SearchInput
              ref={searchRef}
              value={search}
              onValueChange={setSearch}
              placeholder="Buscar nome, host ou banco"
              className="w-full sm:w-72"
              shortcutHint={<Kbd>/</Kbd>}
            />
            <Segmented
              label="Filtrar por estado"
              value={filter}
              onValueChange={setFilter}
              className="max-w-full overflow-x-auto"
              options={[
                { value: 'todos', label: `Todos ${counts.todos}` },
                { value: 'ativo', label: `Coletando ${counts.ativo}` },
                { value: 'erro', label: `Sem conexão ${counts.erro}` },
                { value: 'desabilitado', label: `Desabilitados ${counts.desabilitado}` },
              ]}
            />
          </div>
          {clientsQuery.isLoading ? (
            <SkeletonRows rows={8} columns={5} />
          ) : clientsQuery.isError ? (
            <ErrorState message={(clientsQuery.error as Error).message} onRetry={() => void clientsQuery.refetch()} />
          ) : (
            <ClientsTable
              clients={visible}
              groups={groupsQuery.data ?? []}
              sessionErrors={clientErrors}
              canManage={canManage}
              onEdit={setEditing}
              emptyMessage={search || filter !== 'todos' ? 'Nenhum cliente com esses filtros' : 'Nenhum cliente cadastrado ainda'}
            />
          )}
        </Panel>
      )}

      {editing && (
        <ClientFormSheet
          key={editing === 'new' ? 'new' : String(editing.id)}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          client={editing === 'new' ? null : editing}
          groups={groupsQuery.data ?? []}
        />
      )}
    </>
  );
}
