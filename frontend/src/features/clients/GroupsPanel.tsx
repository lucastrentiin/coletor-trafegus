import { useState } from 'react';
import { KeyRound, MoreHorizontal, PencilLine, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Panel } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { Badge, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/feedback';
import { Menu } from '@/components/ui/menu';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { useCredentialGroups } from '@/hooks/useData';
import { plural } from '@/lib/format';
import { clientsService } from '@/services/clients';
import type { CredentialGroup } from '@/types/api';
import { GroupFormSheet } from './GroupFormSheet';
import { useClientActions } from './useClientActions';

export function GroupsPanel() {
  const { data, isLoading, isError, error, refetch } = useCredentialGroups();
  const [editing, setEditing] = useState<CredentialGroup | 'new' | null>(null);
  const confirm = useConfirm();
  const { refresh } = useClientActions();

  const remove = async (group: CredentialGroup) => {
    if (group.usedBy > 0) {
      toast.error('Grupo em uso', { description: `${plural(group.usedBy, 'cliente usa', 'clientes usam')} este grupo. Troque a credencial desses clientes antes de excluir.` });
      return;
    }
    const ok = await confirm({ title: `Excluir ${group.name}?`, description: 'Usuário, senha e chave deste grupo serão apagados.', confirmLabel: 'Excluir grupo', destructive: true });
    if (!ok) return;
    try {
      await clientsService.removeGroup(group.id);
      toast.success('Grupo excluído');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível excluir', { description: (err as Error).message });
    }
  };

  return (
    <>
      <Panel
        title="Grupos de credencial"
        description="Usuário e senha compartilhados por vários clientes."
        actions={
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
            Novo grupo
          </Button>
        }
      >
        {isLoading ? (
          <SkeletonRows rows={4} columns={4} />
        ) : isError ? (
          <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        ) : !data?.length ? (
          <EmptyState icon={<KeyRound />} title="Nenhum grupo cadastrado" description="Crie um grupo para não repetir a mesma senha em cada cliente." />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th className="w-12">Nº</Th>
                  <Th>Grupo</Th>
                  <Th className="hidden sm:table-cell">PostgreSQL</Th>
                  <Th className="hidden md:table-cell">SSH</Th>
                  <Th className="text-right">Clientes</Th>
                  <Th className="w-10">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.map((group) => (
                  <Tr key={group.id} className="cursor-pointer" onClick={() => setEditing(group)}>
                    <Td className="text-ink-3 tabular">{group.number ?? '—'}</Td>
                    <Td>
                      <span className="block font-medium">{group.name}</span>
                      <span className="block font-mono text-2xs text-ink-3">{group.id}</span>
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <span className="font-mono text-xs">{group.user || '—'}</span>{' '}
                      {!group.hasPassword && <Badge tone="warning">sem senha</Badge>}
                    </Td>
                    <Td className="hidden text-ink-2 md:table-cell">
                      {group.hasSshKey ? 'Chave' : group.hasSshPassword ? 'Senha' : group.sshUser ? 'Só usuário' : '—'}
                    </Td>
                    <Td className="text-right tabular">{group.usedBy}</Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      <Menu
                        trigger={
                          <IconButton label={`Ações para ${group.name}`} size="sm">
                            <MoreHorizontal className="size-4" />
                          </IconButton>
                        }
                        items={[
                          { label: 'Editar', icon: <PencilLine />, onSelect: () => setEditing(group) },
                          { label: 'Excluir', icon: <Trash2 />, destructive: true, onSelect: () => void remove(group) },
                        ]}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </Panel>
      {editing && (
        <GroupFormSheet
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          group={editing === 'new' ? null : editing}
        />
      )}
    </>
  );
}
