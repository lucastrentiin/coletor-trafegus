import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, PasswordInput } from '@/components/ui/input';
import { Callout } from '@/components/ui/feedback';
import { Logo, LogoMark } from '@/components/layout/Logo';
import { authService } from '@/services/auth';

export function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!login.trim() || !password) {
      setError('Informe login e senha.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authService.login(login.trim(), password);
      window.location.replace('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 lg:flex">
        <Logo />
        <div className="max-w-md">
          <p className="text-xl leading-snug font-medium text-white">Os indicadores de todos os clientes, coletados direto das bases e prontos para a planilha.</p>
          <p className="mt-4 text-sm text-sidebar-ink-2">Viagens, terminais, eventos, acessos e chamados, por dia, semana, mês ou período.</p>
        </div>
        <p className="text-2xs text-sidebar-ink-2">Uso interno Trafegus. Acessos são registrados na auditoria.</p>
        {/* Barras de coleta ao fundo: a mesma forma da marca, em escala. */}
        <svg className="pointer-events-none absolute -right-10 bottom-24 h-72 w-80 text-sidebar-line" viewBox="0 0 120 100" aria-hidden>
          {[18, 34, 26, 52, 44, 70, 62, 88].map((h, i) => (
            <rect key={i} x={i * 15} y={100 - h} width="10" height={h} rx="1.5" fill={i === 7 ? 'var(--signal)' : 'currentColor'} opacity={i === 7 ? 0.9 : 1} />
          ))}
        </svg>
      </aside>

      <main className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-ink lg:hidden">
            <LogoMark />
            <span className="text-sm font-semibold">Coletor</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Entrar no Coletor</h1>
          <p className="mt-1 text-sm text-ink-2">Use o login e a senha fornecidos pelo gestor.</p>

          <form onSubmit={submit} className="mt-8 grid gap-4" noValidate>
            <Field label="Login ou e-mail">
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus className="h-10" />
            </Field>
            <Field label="Senha">
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="[&_input]:h-10" />
            </Field>
            {error && <Callout tone="negative">{error}</Callout>}
            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <button type="button" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp} className="mt-6 text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Esqueci minha senha
          </button>
          {showHelp && (
            <p className="mt-2 text-sm text-ink-3">
              Peça a um gestor com acesso a Usuários para gerar uma senha temporária. Você vai trocá-la no primeiro acesso.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
