import { cn } from '@/lib/cn';

/** Marca: três barras de coleta, a mais alta no amarelo de sinalização. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden="true">
      <rect x="2" y="13" width="5" height="9" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="9.5" y="8" width="5" height="14" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="17" y="2" width="5" height="20" rx="1" fill="var(--signal)" />
    </svg>
  );
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-white">
      <LogoMark />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight">Coletor</span>
          <span className="block text-2xs text-sidebar-ink-2">Indicadores Trafegus</span>
        </span>
      )}
    </span>
  );
}
