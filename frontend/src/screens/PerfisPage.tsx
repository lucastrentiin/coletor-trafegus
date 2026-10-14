import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PencilLine, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { EmptyState, ErrorState, SkeletonRows, Status } from '@/components/ui/feedback';
import { Menu } from '@/components/ui/menu';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { keys, useProfiles, useUsers } from '@/hooks/useData';
import { profilesService, type ProfilePayload } from '@/services/admin';
import { useAuth } from '@/state/auth';
import type { Profile } from '@/types/api';
import { ProfileFormSheet } from '@/features/profiles/ProfileFormSheet';

export function PerfisPage() {
  const { can, refresh: refreshSession } = useAuth();
  const canManage = can('profiles.manage');
  const { data, isLoading, isError, error, refetch } = useProfiles();
  const users = useUsers(can('users.view'));
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);

  const usersWith = (profile: Profile) => users.data?.filter((u) => u.profiles.includes(profile.code)).length;

  const invalidate = async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: keys.profiles }), queryClient.invalidateQueries({ queryKey: keys.users }), refreshSession()]);
  };

  const save = async (payload: ProfilePayload) => {
    try {
      await profilesService.save(payload);
      await invalidate();
      toast.success(payload.id ? 'Perfil atualizado' : 'Perfil criado');
      return true;
    } catch (err) {
      toast.error('Não foi possível salvar', { description: (err as Error).message });
      return false;
    }
  };

  const remove = async (profile: Profile) => {
    const inUse = usersWith(profile);
    if (inUse) {
      toast.error('Perfil em uso', { description: `${inUse} usuário(s) têm este perfil. Retire-o deles antes de excluir.` });
      return;
    }
    const ok = await confirm({ title: `Excluir o perfil ${profile.name}?`, confirmLabel: 'Excluir perfil', destructive: true });
    if (!ok) return;
    try {
      await profilesService.remove(profile.id);
      await invalidate();
      toast.success('Perfil excluído');
    } catch (err) {
      toast.error('Não foi possível excluir', { description: (err as Error).message });
    }
  };

  return (
    <>
      <PageHeader
        title="Perfis de acesso"
        description="Conjuntos de permissões atribuídos às pessoas. Uma pessoa pode ter mais de um perfil."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              Novo perfil
            </Button>
          )
        }
      />
      <Panel>
        {isLoading ? (
          <SkeletonRows rows={4} columns={4} />
        ) : isError || !data ? (
          <ErrorState message={(error as Error)?.message ?? 'Sem dados.'} onRetry={() => void refetch()} />
        ) : !data.profiles.length ? (
          <EmptyState icon={<ShieldCheck />} title="Nenhum perfil cadastrado" />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <Th>Perfil</Th>
                  <Th className="hidden md:table-cell">Descrição</Th>
                  <Th className="text-right">Permissões</Th>
                  {users.data && <Th className="hidden text-right sm:table-cell">Usuários</Th>}
                  <Th>Estado</Th>
                  {canManage && (
                    <Th className="w-10">
                      <span className="sr-only">Ações</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.profiles.map((profile) => (
                  <Tr key={profile.id} className={canManage ? 'cursor-pointer' : undefined} onClick={canManage ? () => setEditing(profile) : undefined}>
                    <Td>
                      <span className="block font-medium">{profile.name}</span>
                      <span className="block font-mono text-2xs text-ink-3">{profile.code}</span>
                    </Td>
                    <Td className="hidden max-w-md truncate text-ink-2 md:table-cell">{profile.description || '—'}</Td>
                    <Td className="text-right tabular">
                      {profile.permissionIds.length}
                      <span className="text-ink-3">/{data.permissions.length}</span>
                    </Td>
                    {users.data && <Td className="hidden text-right tabular sm:table-cell">{usersWith(profile)}</Td>}
                    <Td>
                      <Status tone={profile.active ? 'positive' : 'neutral'}>{profile.active ? 'Ativo' : 'Inativo'}</Status>
                    </Td>
                    {canManage && (
                      <Td onClick={(e) => e.stopPropagation()}>
                        <Menu
                          trigger={
                            <IconButton label={`Ações para ${profile.name}`} size="sm">
                              <MoreHorizontal className="size-4" />
                            </IconButton>
                          }
                          items={[
                            { label: 'Editar', icon: <PencilLine />, onSelect: () => setEditing(profile) },
                            { label: 'Excluir', icon: <Trash2 />, destructive: true, onSelect: () => void remove(profile) },
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
      </Panel>
      {editing && data && (
        <ProfileFormSheet
          key={editing === 'new' ? 'new' : String(editing.id)}
          profile={editing === 'new' ? null : editing}
          permissions={data.permissions}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
    </>
  );
}
