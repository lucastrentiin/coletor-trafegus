import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, MoreHorizontal, Plug, Power } from 'lucide-react';
import { Panel } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState, ErrorState, SkeletonRows, Status } from '@/components/ui/feedback';
import { Menu, Tooltip } from '@/components/ui/menu';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { useClients } from '@/hooks/useData';
import { formatRelative } from '@/lib/format';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import { clientState, connectionLabel, HEALTH_ORDER } from '@/features/clients/clientStatus';
import { useClientActions } from '@/features/clients/useClientActions';

export function AttentionList() {
  const { data, isLoading, isError, error, refetch } = useClients();
  const { clientErrors } = useConsulta();
  const { can } = useAuth();
  const actions = useClientActions();
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () =>
      (data ?? [])
        .map((client) => ({ client, state: clientState(client, clientErrors[String(client.id)]) }))
        .sort((a, b) => HEALTH_ORDER[a.state.health] - HEALTH_ORDER[b.state.health] || a.client.name.localeCompare(b.client.name, 'pt-BR')),
    [data, clientErrors],
  );
  const problems = rows.filter((r) => r.state.health !== 'ativo');
  const visible = showAll ? rows : problems;

  return (
    <Panel
      title="Bases que precisam de atenção"
      description={
        !data
          ? undefined
          : !rows.length
            ? 'Nenhum cliente cadastrado'
            : problems.length
              ? `${problems.length} de ${rows.length} fora da coleta`
              : `Todas as ${rows.length} bases estão coletando`
      }
      actions={
        rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Só com problema' : 'Ver todas'}
          </Button>
        )
      }
    >
      {isLoading ? (
        <SkeletonRows rows={5} columns={3} />
      ) : isError ? (
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      ) : !visible.length ? (
        rows.length ? (
          <EmptyState icon={<CheckCircle2 className="text-positive" />} title="Nada pendente" description="Nenhuma base com erro de conexão ou desabilitada." />
        ) : (
          <EmptyState title="Nenhum cliente cadastrado" description="Cadastre o primeiro cliente para começar a coletar." />
        )
      ) : (
        <TableContainer className="max-h-[28rem] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th className="hidden md:table-cell">Conexão</Th>
                <Th>Motivo</Th>
                <Th className="w-32">Estado</Th>
                {can('clients.manage') && <Th className="w-10"><span className="sr-only">Ações</span></Th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(({ client, state }) => (
                <Tr key={client.id}>
                  <Td className="font-medium">{client.name}</Td>
                  <Td className="hidden font-mono text-xs text-ink-2 md:table-cell">{connectionLabel(client)}</Td>
                  <Td className="max-w-0 w-full">
                    {state.reason ? (
                      <Tooltip content={state.reason}>
                        <span className="block truncate text-sm text-ink-2">
                          {state.reason}
                          {client.lastErrorAt && <span className="ml-2 text-xs text-ink-3">{formatRelative(client.lastErrorAt)}</span>}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </Td>
                  <Td>
                    <Status tone={state.tone}>{state.label}</Status>
                  </Td>
                  {can('clients.manage') && (
                    <Td>
                      <Menu
                        trigger={
                          <IconButton label={`Ações para ${client.name}`} size="sm" disabled={actions.pendingId === String(client.id)}>
                            <MoreHorizontal className="size-4" />
                          </IconButton>
                        }
                        items={[
                          { label: 'Testar conexão', icon: <Plug />, onSelect: () => void actions.test(client) },
                          client.enabled
                            ? { label: 'Desabilitar', icon: <Power />, onSelect: () => void actions.setEnabled(client, false) }
                            : { label: 'Testar e reativar', icon: <Power />, onSelect: () => void actions.setEnabled(client, true) },
                        ]}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}
      {can('clients.view') && (
        <div className="border-t border-line px-4 py-2.5 text-right">
          <Link to="/clientes" className="text-xs font-medium text-ink-2 hover:text-ink">
            Abrir cadastro de clientes
          </Link>
        </div>
      )}
    </Panel>
  );
}
