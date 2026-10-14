import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/dialog';
import { Field, FormSection } from '@/components/ui/field';
import { Input, PasswordInput, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/choice';
import { Segmented } from '@/components/ui/controls';
import { Callout } from '@/components/ui/feedback';
import { cleanError } from '@/lib/format';
import { clientsService } from '@/services/clients';
import type { Client, ClientPayload, CredentialGroup } from '@/types/api';
import { SshKeyInput } from './SshKeyInput';
import { useClientActions } from './useClientActions';

interface Draft {
  name: string;
  attendanceName: string;
  enabled: boolean;
  host: string;
  port: string;
  database: string;
  credentialGroup: string;
  dbUser: string;
  dbPassword: string;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: string;
  sshCredentialGroup: string;
  sshUser: string;
  sshAuth: 'senha' | 'chave';
  sshPassword: string;
  sshKey: string;
  sshKeyPassphrase: string;
  sshDbHost: string;
  sshDbPort: string;
}

function draftFrom(client: Client | null, groups: CredentialGroup[]): Draft {
  return {
    name: client?.name ?? '',
    attendanceName: client?.attendanceName ?? '',
    enabled: client?.enabled ?? false,
    host: client?.host ?? '',
    port: String(client?.port ?? 5432),
    database: client?.database ?? '',
    credentialGroup: client ? client.credentialGroup : (groups[0]?.id ?? ''),
    dbUser: client?.dbUser ?? '',
    dbPassword: '',
    sshEnabled: client?.sshEnabled ?? false,
    sshHost: client?.sshHost ?? '',
    sshPort: String(client?.sshPort ?? 22),
    sshCredentialGroup: client?.sshCredentialGroup ?? '',
    sshUser: client?.sshUser ?? '',
    sshAuth: client?.hasOwnSshKey ? 'chave' : 'senha',
    sshPassword: '',
    sshKey: '',
    sshKeyPassphrase: '',
    sshDbHost: client?.sshDbHost ?? '',
    sshDbPort: client?.sshDbHost ? String(client.sshDbPort) : '',
  };
}

/** Mesmas regras do formulário antigo: credencial própria só vai quando não há grupo. */
function toPayload(d: Draft, id: Client['id'] | null): ClientPayload {
  const dbOwn = !d.credentialGroup;
  const sshOwn = d.sshEnabled && !d.sshCredentialGroup;
  const useKey = sshOwn && d.sshAuth === 'chave';
  return {
    id,
    name: d.name.trim(),
    attendanceName: d.attendanceName.trim() || d.name.trim(),
    enabled: d.enabled,
    host: d.host.trim(),
    port: d.port,
    database: d.database.trim(),
    credentialGroup: d.credentialGroup,
    dbUser: dbOwn ? d.dbUser.trim() : '',
    dbPassword: dbOwn ? d.dbPassword : '',
    sshEnabled: d.sshEnabled,
    sshHost: d.sshHost.trim(),
    sshPort: d.sshPort || 22,
    sshCredentialGroup: d.sshEnabled ? d.sshCredentialGroup : '',
    sshUser: sshOwn ? d.sshUser.trim() : '',
    sshPassword: sshOwn && !useKey ? d.sshPassword : '',
    sshKey: useKey ? d.sshKey : '',
    sshKeyPassphrase: useKey ? d.sshKeyPassphrase : '',
    sshDbHost: d.sshEnabled ? d.sshDbHost.trim() : '',
    sshDbPort: d.sshEnabled && d.sshDbPort ? d.sshDbPort : d.port,
  };
}

function validate(d: Draft, isNew: boolean): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.name.trim()) errors.name = 'Informe o nome do cliente.';
  if (!d.host.trim()) errors.host = 'Informe o host do banco.';
  if (!d.database.trim()) errors.database = 'Informe o nome do banco.';
  const port = Number(d.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.port = 'Porta entre 1 e 65535.';
  if (!d.credentialGroup && !d.dbUser.trim() && isNew) errors.dbUser = 'Escolha um grupo ou informe o usuário.';
  if (d.sshEnabled && !d.sshHost.trim()) errors.sshHost = 'Informe o host SSH.';
  return errors;
}

/** Montar com `key` do cliente: o rascunho nasce do cadastro atual a cada abertura. */
interface ClientFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  groups: CredentialGroup[];
}

export function ClientFormSheet({ open, onOpenChange, client, groups }: ClientFormSheetProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(client, groups));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const { refresh } = useClientActions();
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (testResult) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [testResult]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setTestResult(null);
  };
  const errors = touched ? validate(draft, !client) : {};
  const hasErrors = Object.keys(validate(draft, !client)).length > 0;

  const testConnection = async () => {
    setTouched(true);
    if (hasErrors) return;
    setTesting(true);
    try {
      const result = await clientsService.test(toPayload(draft, client?.id ?? null));
      setTestResult({ ok: true, message: result.message });
    } catch (error) {
      setTestResult({ ok: false, message: cleanError((error as Error).message) });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      await clientsService.save(toPayload(draft, client?.id ?? null));
      toast.success(client ? 'Cliente atualizado' : 'Cliente cadastrado', { description: draft.name });
      await refresh();
      onOpenChange(false);
    } catch (error) {
      toast.error('Não foi possível salvar', { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const groupOptions = (
    <>
      <option value="">Credencial própria deste cliente</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name} ({g.id})
        </option>
      ))}
    </>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={client ? `Editar ${client.name}` : 'Novo cliente'}
      description="Senhas e chaves ficam criptografadas. Campos de senha vazios mantêm o valor salvo."
      footer={
        <>
          <Button className="mr-auto" icon={<Plug className="size-3.5" />} loading={testing} onClick={() => void testConnection()}>
            Testar conexão
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="client-form" variant="primary" loading={saving}>
            {client ? 'Salvar alterações' : 'Cadastrar cliente'}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="grid gap-6" noValidate>
        <FormSection title="Identificação">
          <Field label="Nome do cliente" required error={errors.name}>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus={!client} maxLength={120} />
          </Field>
          <Field label="Nome no banco de atendimentos" hint="Como o cliente aparece em estatistica.chamados_bi. Vazio usa o nome acima.">
            <Input value={draft.attendanceName} onChange={(e) => set('attendanceName', e.target.value)} placeholder={draft.name} />
          </Field>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => set('enabled', v)}
            label="Habilitado para coleta"
            description="Entra na coleta diária e aparece na Consulta. Teste a conexão antes de habilitar."
          />
        </FormSection>

        <FormSection title="Banco PostgreSQL">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Field label="Host" required error={errors.host}>
              <Input value={draft.host} onChange={(e) => set('host', e.target.value)} placeholder="10.0.0.12 ou db.cliente.com.br" className="font-mono" />
            </Field>
            <Field label="Porta" required error={errors.port}>
              <Input value={draft.port} onChange={(e) => set('port', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="font-mono" />
            </Field>
          </div>
          <Field label="Nome do banco" required error={errors.database}>
            <Input value={draft.database} onChange={(e) => set('database', e.target.value)} className="font-mono" />
          </Field>
          <Field label="Credencial" hint={draft.credentialGroup ? 'Usuário e senha vêm do grupo selecionado.' : undefined}>
            <Select value={draft.credentialGroup} onChange={(e) => set('credentialGroup', e.target.value)}>
              {groupOptions}
            </Select>
          </Field>
          {!draft.credentialGroup && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Usuário" error={errors.dbUser}>
                <Input value={draft.dbUser} onChange={(e) => set('dbUser', e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Senha" hint={client?.hasOwnDbCredential ? 'Vazio mantém a senha atual.' : undefined}>
                <PasswordInput value={draft.dbPassword} onChange={(e) => set('dbPassword', e.target.value)} />
              </Field>
            </div>
          )}
        </FormSection>

        <FormSection title="Túnel SSH" description="Para bases que só aceitam conexão a partir do servidor do cliente.">
          <Switch checked={draft.sshEnabled} onCheckedChange={(v) => set('sshEnabled', v)} label="Conectar por túnel SSH" />
          {draft.sshEnabled && (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <Field label="Host SSH" required error={errors.sshHost}>
                  <Input value={draft.sshHost} onChange={(e) => set('sshHost', e.target.value)} className="font-mono" />
                </Field>
                <Field label="Porta SSH">
                  <Input value={draft.sshPort} onChange={(e) => set('sshPort', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="font-mono" />
                </Field>
              </div>
              <Field label="Credencial SSH">
                <Select value={draft.sshCredentialGroup} onChange={(e) => set('sshCredentialGroup', e.target.value)}>
                  {groupOptions}
                </Select>
              </Field>
              {!draft.sshCredentialGroup && (
                <>
                  <Field label="Usuário SSH">
                    <Input value={draft.sshUser} onChange={(e) => set('sshUser', e.target.value)} autoComplete="off" />
                  </Field>
                  <Segmented
                    label="Autenticação SSH"
                    value={draft.sshAuth}
                    onValueChange={(v) => set('sshAuth', v)}
                    options={[
                      { value: 'senha', label: 'Senha' },
                      { value: 'chave', label: 'Chave privada' },
                    ]}
                    className="w-fit"
                  />
                  {draft.sshAuth === 'senha' ? (
                    <Field label="Senha SSH" hint={client?.hasOwnSshCredential ? 'Vazio mantém a senha atual.' : undefined}>
                      <PasswordInput value={draft.sshPassword} onChange={(e) => set('sshPassword', e.target.value)} />
                    </Field>
                  ) : (
                    <>
                      <SshKeyInput hasSavedKey={Boolean(client?.hasOwnSshKey)} onLoad={(content) => set('sshKey', content)} />
                      <Field label="Senha da chave" hint="Só se a chave for protegida por senha.">
                        <PasswordInput value={draft.sshKeyPassphrase} onChange={(e) => set('sshKeyPassphrase', e.target.value)} />
                      </Field>
                    </>
                  )}
                </>
              )}
              <details className="group rounded-md border border-line px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-2 select-none">Destino do banco dentro do túnel (avançado)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                  <Field label="Host do banco visto pelo SSH" hint="Vazio usa o host do banco informado acima.">
                    <Input value={draft.sshDbHost} onChange={(e) => set('sshDbHost', e.target.value)} placeholder="127.0.0.1" className="font-mono" />
                  </Field>
                  <Field label="Porta">
                    <Input value={draft.sshDbPort} onChange={(e) => set('sshDbPort', e.target.value.replace(/\D/g, ''))} placeholder={draft.port} className="font-mono" />
                  </Field>
                </div>
              </details>
            </>
          )}
        </FormSection>

        {/* Perto do botão "Testar conexão" do rodapé, e trazido para a vista ao aparecer. */}
        {testResult && (
          <div ref={resultRef}>
            <Callout tone={testResult.ok ? 'positive' : 'negative'} title={testResult.ok ? 'Conexão funcionando' : 'Falha na conexão'}>
              {testResult.message}
            </Callout>
          </div>
        )}
      </form>
    </Sheet>
  );
}
