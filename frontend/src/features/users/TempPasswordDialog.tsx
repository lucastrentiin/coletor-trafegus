import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/controls';
import { Dialog } from '@/components/ui/dialog';
import { Callout } from '@/components/ui/feedback';

interface TempPasswordDialogProps {
  credentials: { login: string; password: string; title: string } | null;
  onClose: () => void;
}

/** A senha temporária só aparece aqui, uma vez. */
export function TempPasswordDialog({ credentials, onClose }: TempPasswordDialogProps) {
  return (
    <Dialog
      open={credentials !== null}
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      title={credentials?.title ?? ''}
      description="Envie estes dados para a pessoa. No primeiro acesso ela terá de criar uma senha própria."
      footer={
        <Button variant="primary" onClick={onClose}>
          Já anotei
        </Button>
      }
    >
      {credentials && (
        <div className="grid gap-3">
          <dl className="grid gap-2 rounded-md border border-line bg-subtle p-3">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-ink-3">Login</dt>
              <dd className="flex items-center gap-1 font-mono text-sm">
                {credentials.login}
                <CopyButton value={credentials.login} label="Copiar login" />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-ink-3">Senha temporária</dt>
              <dd className="flex items-center gap-1 font-mono text-sm">
                {credentials.password}
                <CopyButton value={credentials.password} label="Copiar senha" />
              </dd>
            </div>
          </dl>
          <Callout tone="warning">Esta senha não será mostrada de novo. Se perder, gere outra pelo menu do usuário.</Callout>
        </div>
      )}
    </Dialog>
  );
}
