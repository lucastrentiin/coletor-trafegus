import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { PasswordInput } from '@/components/ui/input';
import { Callout } from '@/components/ui/feedback';
import { authService } from '@/services/auth';
import { useAuth } from '@/state/auth';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Senha temporária/vencida: não pode ser fechado sem trocar. */
  forced?: boolean;
}

const MIN_LENGTH = 8;

export function ChangePasswordDialog({ open, onOpenChange, forced = false }: Props) {
  const { refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPassword('');
    setConfirmation('');
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_LENGTH) return setError(`Use pelo menos ${MIN_LENGTH} caracteres.`);
    if (password !== confirmation) return setError('As senhas não coincidem.');
    setSaving(true);
    try {
      await authService.changePassword(password);
      toast.success('Senha alterada');
      reset();
      onOpenChange(false);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      locked={forced}
      size="sm"
      title={forced ? 'Defina uma nova senha' : 'Trocar senha'}
      description={forced ? 'Sua senha atual é temporária ou venceu. Crie uma nova para continuar.' : undefined}
    >
      <form id="change-password" onSubmit={submit} className="grid gap-3">
        <Field label="Nova senha" hint={`Mínimo de ${MIN_LENGTH} caracteres.`} required>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirmar nova senha" required>
          <PasswordInput value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </Field>
        {error && <Callout tone="negative">{error}</Callout>}
        <div className="mt-1 flex justify-end gap-2">
          {!forced && (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          )}
          <Button type="submit" variant="primary" loading={saving}>
            Salvar senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
