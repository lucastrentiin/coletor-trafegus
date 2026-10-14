import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Minus, Network } from 'lucide-react';
import { Status } from '@/components/ui/feedback';
import { useAuth } from '@/state/auth';
import { cn } from '@/lib/cn';
import { useVpns, vpnTone } from '@/services/vpns';

/**
 * Card flutuante "Status VPNs" (canto inferior direito) para o Painel e a Consulta.
 * Minimizado vira uma pílula com o placar (ex.: 2/3); clicando abre a lista.
 * Lembra se ficou aberto ou fechado por navegador.
 */
export function VpnStatusWidget() {
  const { can } = useAuth();
  const allowed = can('config.view');
  const [open, setOpenState] = useState<boolean>(() => {
    try { return localStorage.getItem('vpn-widget-open') === '1'; } catch { return false; }
  });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    try { localStorage.setItem('vpn-widget-open', v ? '1' : '0'); } catch { /* sem storage */ }
  };
  const [hidden, setHidden] = useState(false);
  const { data, isLoading, isError } = useVpns(allowed);
  if (!allowed || hidden) return null;

  const total = data?.length ?? 0;
  const on = data?.filter((v) => v.status === 'LIGADA').length ?? 0;
  const tone = isError ? 'negative' : total && on === total ? 'positive' : on === 0 ? 'negative' : 'warning';
  const resumo = isLoading ? '…' : isError ? 'erro' : `${on}/${total}`;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 inline-flex h-9 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-sm text-ink shadow-lg hover:bg-hover"
        aria-label="Abrir status das VPNs"
      >
        <Network className="size-4" />
        Status VPNs
        <Status tone={tone}>{resumo}</Status>
      </button>
    );
  }

  return (
    <section className="fixed right-4 bottom-4 z-40 w-72 rounded-lg border border-line-strong bg-surface shadow-lg" aria-label="Status das VPNs">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={() => setOpen(false)} className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Network className="size-4" />
          Status VPNs
          <Status tone={tone}>{resumo}</Status>
        </button>
        <div className="flex items-center gap-1 text-ink-3">
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-hover" aria-label="Minimizar">
            <ChevronDown className="size-4" />
          </button>
          <button type="button" onClick={() => setHidden(true)} className="rounded p-1 hover:bg-hover" aria-label="Esconder até recarregar">
            <Minus className="size-4" />
          </button>
        </div>
      </header>
      <ul className="max-h-64 overflow-auto py-1">
        {isError && <li className="px-3 py-2 text-sm text-negative">Não foi possível ler o status.</li>}
        {data?.map((v) => (
          <li key={v.nome} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{v.nome}</span>
              <span className="block font-mono text-2xs text-ink-3">{v.ip ?? v.tun ?? '—'}</span>
            </span>
            <span className={cn(v.status === 'LIGADA' && 'font-medium')}>
              <Status tone={vpnTone(v.status)}>{v.status}</Status>
            </span>
          </li>
        ))}
      </ul>
      <footer className="border-t border-line px-3 py-2 text-right">
        <Link to="/vpns" className="text-xs font-medium text-ink underline underline-offset-4">
          Ligar / desligar
        </Link>
      </footer>
    </section>
  );
}
