import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Panel } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/choice';
import { Callout, Status } from '@/components/ui/feedback';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { keys } from '@/hooks/useData';
import { cleanError } from '@/lib/format';
import { connectionsService, type ExternalPayload } from '@/services/admin';
import type { ExternalConnection, ExternalType } from '@/types/api';

interface ConnectionFormProps {
  type: ExternalType;
  title: string;
  description: string;
  value: ExternalConnection;
  canManage: boolean;
}

/** Montar com key derivada do valor salvo para reiniciar após salvar. */
export function ConnectionForm({ type, title, description, value, canManage }: ConnectionFormProps) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(value.enabled);
  const [host, setHost] = useState(value.host);
  const [port, setPort] = useState(String(value.port || 5432));
  const [database, setDatabase] = useState(value.database);
  const [user, setUser] = useState(value.user);
  const [password, setPassword] = useState('');
  const [ssl, setSsl] = useState(value.ssl);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  const payload = (): ExternalPayload => ({ type, enabled, ssl, host: host.trim(), port, database: database.trim(), user: user.trim(), password });

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const result = await connectionsService.test(payload());
      setTest({ ok: true, message: result.message });
    } catch (error) {
      setTest({ ok: false, message: cleanError((error as Error).message) });
    } finally {
      setTesting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await connectionsService.save(payload());
      toast.success(`${title} salvo`);
      await queryClient.invalidateQueries({ queryKey: keys.connections });
    } catch (error) {
      toast.error('Não foi possível salvar', { description: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title={title}
      description={description}
      actions={<Status tone={value.enabled ? 'positive' : 'neutral'}>{value.enabled ? 'Ativa' : 'Desativada'}</Status>}
    >
      <form onSubmit={submit} className="grid gap-4 p-4">
        <fieldset disabled={!canManage} className="grid gap-4 disabled:opacity-80">
          <Switch checked={enabled} onCheckedChange={setEnabled} label="Usar esta conexão" disabled={!canManage} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Porta">
              <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="font-mono" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Banco">
              <Input value={database} onChange={(e) => setDatabase(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Usuário">
              <Input value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <Field label="Senha" hint={value.hasPassword ? 'Vazio mantém a senha salva.' : 'Nenhuma senha salva.'}>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Checkbox checked={ssl} onCheckedChange={setSsl} label="Exigir SSL" disabled={!canManage} />
        </fieldset>
        {test && (
          <Callout tone={test.ok ? 'positive' : 'negative'} title={test.ok ? 'Conexão funcionando' : 'Falha na conexão'}>
            {test.message}
          </Callout>
        )}
        {canManage && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <Button icon={<Plug className="size-3.5" />} loading={testing} onClick={() => void runTest()}>
              Testar
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Salvar
            </Button>
          </div>
        )}
      </form>
    </Panel>
  );
}
