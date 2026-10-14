import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import { Field, FormSection } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Switch } from '@/components/ui/choice';
import { Segmented } from '@/components/ui/controls';
import { clientsService } from '@/services/clients';
import { useAuth } from '@/state/auth';
import type { CredentialGroup, CredentialGroupPayload } from '@/types/api';
import { SshKeyInput } from './SshKeyInput';
import { useClientActions } from './useClientActions';

interface GroupFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: CredentialGroup | null;
}

/** Montar com `key` do grupo para reiniciar o rascunho a cada abertura. */
export function GroupFormSheet({ open, onOpenChange, group }: GroupFormSheetProps) {
  const { authEnabled } = useAuth();
  const { refresh } = useClientActions();
  const [code, setCode] = useState(group?.id.replace(/^GRUPO_/, '') ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [user, setUser] = useState(group?.user ?? '');
  const [password, setPassword] = useState('');
  const [usesSsh, setUsesSsh] = useState(Boolean(group && (group.sshUser || group.hasSshPassword || group.hasSshKey)));
  const [sshUser, setSshUser] = useState(group?.sshUser ?? '');
  const [sshAuth, setSshAuth] = useState<'senha' | 'chave'>(group?.hasSshKey ? 'chave' : 'senha');
  const [sshPassword, setSshPassword] = useState('');
  const [sshKey, setSshKey] = useState('');
  const [sshKeyPassphrase, setSshKeyPassphrase] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const codeError = !group && !code.trim() ? 'Informe um código para o grupo.' : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (codeError) return;
    const payload: CredentialGroupPayload = {
      id: group?.id ?? code.trim(),
      name: name.trim() || code.trim(),
      user: user.trim(),
      sshUser: usesSsh ? sshUser.trim() : '',
    };
    // Campos secretos vazios não são enviados: o valor salvo continua valendo.
    if (password) payload.password = password;
    if (usesSsh && sshAuth === 'senha' && sshPassword) payload.sshPassword = sshPassword;
    if (usesSsh && sshAuth === 'chave' && sshKey) {
      payload.sshKey = sshKey;
      if (sshKeyPassphrase) payload.sshKeyPassphrase = sshKeyPassphrase;
    }
    setSaving(true);
    try {
      await clientsService.saveGroup(payload);
      toast.success(group ? 'Grupo atualizado' : 'Grupo criado');
      await refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error('Não foi possível salvar o grupo', { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={group ? `Editar ${group.name}` : 'Novo grupo de credencial'}
      description="Vários clientes podem usar o mesmo usuário e senha. Trocar aqui vale para todos eles."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="group-form" variant="primary" loading={saving}>
            {group ? 'Salvar alterações' : 'Criar grupo'}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="grid gap-6" noValidate>
        <FormSection title="Identificação">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Código" required error={touched ? codeError : null} hint={group ? 'Não pode ser alterado.' : 'Recebe o prefixo GRUPO_ automaticamente.'}>
              <Input
                value={group ? group.id : code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={Boolean(group)}
                className="font-mono"
                placeholder="1"
              />
            </Field>
            <Field label="Nome">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Servidores Rota" />
            </Field>
          </div>
        </FormSection>

        <FormSection title="PostgreSQL">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Usuário">
              <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Senha" hint={group?.hasPassword ? 'Vazio mantém a senha atual.' : undefined}>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="SSH">
          <Switch checked={usesSsh} onCheckedChange={setUsesSsh} label="Este grupo também tem acesso SSH" />
          {usesSsh && (
            <>
              <Field label="Usuário SSH">
                <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} autoComplete="off" />
              </Field>
              <Segmented
                label="Autenticação SSH"
                value={sshAuth}
                onValueChange={setSshAuth}
                options={[
                  { value: 'senha', label: 'Senha' },
                  { value: 'chave', label: 'Chave privada' },
                ]}
                className="w-fit"
              />
              {sshAuth === 'senha' ? (
                <Field label="Senha SSH" hint={group?.hasSshPassword ? 'Vazio mantém a senha atual.' : undefined}>
                  <PasswordInput value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} />
                </Field>
              ) : authEnabled ? (
                <>
                  <SshKeyInput hasSavedKey={Boolean(group?.hasSshKey)} onLoad={setSshKey} />
                  <Field label="Senha da chave" hint="Só se a chave for protegida por senha.">
                    <PasswordInput value={sshKeyPassphrase} onChange={(e) => setSshKeyPassphrase(e.target.value)} />
                  </Field>
                </>
              ) : (
                <Field label="Caminho da chave no servidor" hint="No modo local a chave fica em disco; informe o caminho do arquivo.">
                  <Input value={sshKey} onChange={(e) => setSshKey(e.target.value)} placeholder="/caminho/para/chave_rsa" className="font-mono" />
                </Field>
              )}
            </>
          )}
        </FormSection>
      </form>
    </Sheet>
  );
}
