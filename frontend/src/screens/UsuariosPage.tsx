import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, MoreHorizontal, PencilLine, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm';
import { SearchInput } from '@/components/ui/controls';
import { Badge, EmptyState, ErrorState, SkeletonRows, Status } from '@/components/ui/feedback';
import { Menu } from '@/components/ui/menu';
import { SortableTh, sortBy, Table, TableContainer, Td, Th, Tr, type SortState } from '@/components/ui/table';
import { keys, useProfiles, useUsers } from '@/hooks/useData';
import { formatDateTime, formatRelative, normalizeSearch } from '@/lib/format';
import { usersService, type UserPayload } from '@/services/admin';
import { useAuth } from '@/state/auth';
import type { AppUser } from '@/types/api';
import { UserFormSheet } from '@/features/users/UserFormSheet';
import { TempPasswordDialog } from '@/features/users/TempPasswordDialog';

type SortKey = 'nome' | 'login' | 'acesso';

export function UsuariosPage() {
  const { can, user: me } = useAuth();
  const canManage = can('users.manage');
  const usersQuery = useUsers();
  const profilesQuery = useProfiles(can('profiles.view') || canManage);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'nome', direction: 'asc' });
  const [editing, setEditing] = useState<AppUser | 'new' | null>(null);
  const [credentials, setCredentials] = useState<{ login: string; password: string; title: string } | null>(null);

  const profileNames = useMemo(() => new Map((profilesQuery.data?.profiles ?? []).map((p) => [p.code, p.name])), [profilesQuery.data]);

  const visible = useMemo(() => {
    const term = normalizeSearch(search);
    const filtered = (usersQuery.data ?? []).filter((u) => !term || normalizeSearch(`${u.displayName} ${u.login} ${u.email}`).includes(term));
    return sortBy(filtered, sort, (u, key) => (key === 'login' ? u.login : key === 'acesso' ? u.lastLoginAt ?? '' : u.displayName));
  }, [usersQuery.data, search, sort]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: keys.users });

  const save = async (payload: UserPayload) => {
    try {
      const result = await usersService.save(payload);
      await invalidate();
      if (result.tempPassword) setCredentials({ login: payload.login, password: result.tempPassword, title: 'Usuário criado' });
      else toast.success('Usuário salvo');
      return true;
    } catch (error) {
      toast.error('Não foi possível salvar', { description: (error as Error).message });
      return false;
    }
  };

  const resetPassword = async (user: AppUser) => {
    const ok = await confirm({
      title: `Gerar nova senha para ${user.displayName}?`,
      description: 'A senha atual deixa de funcionar e a pessoa terá de trocar a nova no próximo acesso.',
      confirmLabel: 'Gerar senha',
    });
    if (!ok) return;
    try {
      const result = await usersService.resetPassword(user.id);
      await invalidate();
      setCredentials({ login: user.login, password: result.tempPassword, title: 'Nova senha gerada' });
    } catch (error) {
      toast.error('Não foi possível gerar a senha', { description: (error as Error).message });
    }
  };

  const remove = async (user: AppUser) => {
    const ok = await confirm({
      title: `Excluir ${user.displayName}?`,
      description: 'A pessoa perde o acesso imediatamente. Se quiser manter o histórico ligado ao nome, prefira desativar.',
      confirmLabel: 'Excluir usuário',
      destructive: true,
    });
    if (!ok) return;
    try {
      await usersService.remove(user.id);
      await invalidate();
      toast.success('Usuário excluído');
    } catch (error) {
      toast.error('Não foi possível excluir', { description: (error as Error).message });
    }
  };

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o coletor. As permissões vêm dos perfis de acesso."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing('new')}>
              Novo usuário
            </Button>
          )
        }
      />
      <Panel>
        <div className="border-b border-line px-4 py-3">
          <SearchInput value={search} onValueChange={setSearch} placeholder="Buscar nome, login ou e-mail" className="w-full sm:w-72" />
        </div>
        {usersQuery.isLoading ? (
          <SkeletonRows rows={6} columns={4} />
        ) : usersQuery.isError ? (
          <ErrorState message={(usersQuery.error as Error).message} onRetry={() => void usersQuery.refetch()} />
        ) : !visible.length ? (
          <EmptyState icon={<Users />} title={search ? 'Ninguém encontrado' : 'Nenhum usuário cadastrado'} />
        ) : (
          <TableContainer>
            <Table>
              <thead>
                <tr>
                  <SortableTh sortKey="nome" sort={sort} onSort={setSort}>
                    Nome
                  </SortableTh>
                  <SortableTh sortKey="login" sort={sort} onSort={setSort} className="hidden md:table-cell">
                    Login
                  </SortableTh>
                  <Th className="hidden lg:table-cell">Perfis</Th>
                  <SortableTh sortKey="acesso" sort={sort} onSort={setSort} className="hidden sm:table-cell">
                    Último acesso
                  </SortableTh>
                  <Th>Estado</Th>
                  {canManage && (
                    <Th className="w-10">
                      <span className="sr-only">Ações</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => {
                  const isMe = String(user.id) === String(me?.id);
                  return (
                    <Tr key={user.id} className={canManage ? 'cursor-pointer' : undefined} onClick={canManage ? () => setEditing(user) : undefined}>
                      <Td>
                        <span className="font-medium">{user.displayName}</span>
                        {isMe && <span className="ml-2 text-xs text-ink-3">você</span>}
                        <span className="block text-xs text-ink-3">{user.email || <span className="md:hidden">{user.login}</span>}</span>
                      </Td>
                      <Td className="hidden font-mono text-xs md:table-cell">{user.login}</Td>
                      <Td className="hidden lg:table-cell">
                        <span className="flex flex-wrap gap-1">
                          {user.profiles.length ? user.profiles.map((code) => <Badge key={code}>{profileNames.get(code) ?? code}</Badge>) : <span className="text-ink-3">—</span>}
                        </span>
                      </Td>
                      <Td className="hidden text-ink-2 sm:table-cell" title={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : undefined}>
                        {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca'}
                      </Td>
                      <Td>
                        <span className="flex flex-wrap items-center gap-2">
                          <Status tone={user.active ? 'positive' : 'neutral'}>{user.active ? 'Ativo' : 'Inativo'}</Status>
                          {user.mustChangePassword && <Badge tone="warning">Senha temporária</Badge>}
                        </span>
                      </Td>
                      {canManage && (
                        <Td onClick={(e) => e.stopPropagation()}>
                          <Menu
                            trigger={
                              <IconButton label={`Ações para ${user.displayName}`} size="sm">
                                <MoreHorizontal className="size-4" />
                              </IconButton>
                            }
                            items={[
                              { label: 'Editar', icon: <PencilLine />, onSelect: () => setEditing(user) },
                              { label: 'Gerar nova senha', icon: <KeyRound />, onSelect: () => void resetPassword(user) },
                              'separator',
                              { label: 'Excluir', icon: <Trash2 />, destructive: true, disabled: isMe, onSelect: () => void remove(user) },
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
        )}
      </Panel>
      {editing && (
        <UserFormSheet
          key={editing === 'new' ? 'new' : String(editing.id)}
          user={editing === 'new' ? null : editing}
          profiles={profilesQuery.data?.profiles ?? []}
          onClose={() => setEditing(null)}
          onSubmit={save}
        />
      )}
      <TempPasswordDialog credentials={credentials} onClose={() => setCredentials(null)} />
    </>
  );
}
