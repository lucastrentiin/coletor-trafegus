import { useMemo, useState } from 'react';
import { Database, MoreHorizontal, PencilLine, Plug, Power, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { EmptyState, Status } from '@/components/ui/feedback';
import { Menu, Tooltip } from '@/components/ui/menu';
import { SortableTh, sortBy, Table, TableContainer, Td, Th, Tr, type SortState } from '@/components/ui/table';
import { formatRelative } from '@/lib/format';
import type { Client, CredentialGroup } from '@/types/api';
import { clientState, connectionLabel, HEALTH_ORDER } from './clientStatus';
import { useClientActions } from './useClientActions';

type SortKey = 'nome' | 'conexao' | 'banco' | 'credencial' | 'estado';

interface ClientsTableProps {
  clients: Client[];
  groups: CredentialGroup[];
  sessionErrors: Record<string, string>;
  canManage: boolean;
  onEdit: (client: Client) => void;
  emptyMessage: string;
}

export function ClientsTable({ clients, groups, sessionErrors, canManage, onEdit, emptyMessage }: ClientsTableProps) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'estado', direction: 'asc' });
  const actions = useClientActions();
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const groupName = (id: string) => groupNames.get(id) ?? id;

  const rows = useMemo(() => {
    const nameOf = (id: string) => groupNames.get(id) ?? id;
    const withState = clients.map((client) => ({ client, state: clientState(client, sessionErrors[String(client.id)]) }));
    return sortBy(withState, sort, (row, key) => {
      switch (key) {
        case 'conexao':
          return connectionLabel(row.client);
        case 'banco':
          return row.client.database;
        case 'credencial':
          return row.client.credentialGroup ? nameOf(row.client.credentialGroup) : 'Própria';
        case 'estado':
          return `${HEALTH_ORDER[row.state.health]}${row.client.name.toLowerCase()}`;
        default:
          return row.client.name;
      }
    });
  }, [clients, sessionErrors, sort, groupNames]);

  if (!rows.length) return <EmptyState icon={<Database />} title={emptyMessage} />;

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <SortableTh sortKey="nome" sort={sort} onSort={setSort} className="w-[28%] min-w-44">
              Cliente
            </SortableTh>
            <SortableTh sortKey="conexao" sort={sort} onSort={setSort} className="hidden lg:table-cell">
              Conexão
            </SortableTh>
            <SortableTh sortKey="banco" sort={sort} onSort={setSort} className="hidden md:table-cell">
              Banco
            </SortableTh>
            <SortableTh sortKey="credencial" sort={sort} onSort={setSort} className="hidden xl:table-cell">
              Credencial
            </SortableTh>
            <SortableTh sortKey="estado" sort={sort} onSort={setSort}>
              Estado
            </SortableTh>
            {canManage && (
              <Th className="w-10">
                <span className="sr-only">Ações</span>
              </Th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, state }) => {
            const pending = actions.pendingId === String(client.id);
            return (
              <Tr key={client.id} className={canManage ? 'cursor-pointer' : undefined} onClick={canManage ? () => onEdit(client) : undefined}>
                <Td className="max-w-72">
                  <span className="block truncate font-medium" title={client.name}>
                    {client.name}
                  </span>
                  <span className="block truncate font-mono text-2xs text-ink-3 lg:hidden">
                    {client.database} em {connectionLabel(client)}
                  </span>
                </Td>
                <Td className="hidden font-mono text-xs text-ink-2 lg:table-cell">{connectionLabel(client)}</Td>
                <Td className="hidden font-mono text-xs text-ink-2 md:table-cell">{client.database}</Td>
                <Td className="hidden text-ink-2 xl:table-cell">{client.credentialGroup ? groupName(client.credentialGroup) : 'Própria'}</Td>
                <Td>
                  {state.reason && state.health === 'erro' ? (
                    <Tooltip
                      content={
                        <>
                          {state.reason}
                          {client.lastErrorAt && <span className="mt-1 block opacity-70">{formatRelative(client.lastErrorAt)}</span>}
                        </>
                      }
                    >
                      <span className="cursor-help">
                        <Status tone={state.tone}>{state.label}</Status>
                      </span>
                    </Tooltip>
                  ) : (
                    <Status tone={state.tone}>{state.label}</Status>
                  )}
                </Td>
                {canManage && (
                  <Td onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={
                        <IconButton label={`Ações para ${client.name}`} size="sm" disabled={pending}>
                          <MoreHorizontal className="size-4" />
                        </IconButton>
                      }
                      items={[
                        { label: 'Editar', icon: <PencilLine />, onSelect: () => onEdit(client) },
                        { label: 'Testar conexão', icon: <Plug />, onSelect: () => void actions.test(client) },
                        client.enabled
                          ? { label: 'Desabilitar', icon: <Power />, onSelect: () => void actions.setEnabled(client, false) }
                          : { label: 'Testar e habilitar', icon: <Power />, onSelect: () => void actions.setEnabled(client, true) },
                        'separator',
                        { label: 'Excluir', icon: <Trash2 />, destructive: true, onSelect: () => void actions.remove(client) },
                      ]}
                    />
                  </Td>
                )}
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
}
