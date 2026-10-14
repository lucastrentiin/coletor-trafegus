import { Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/menu';
import { cn } from '@/lib/cn';
import type { IndicatorRow } from '@/types/api';
import { humanizeIndicator, indicatorInfo } from './indicators';

export function ScopeTag({ scope }: { scope?: IndicatorRow['escopo'] }) {
  const system = scope === 'SISTEMA';
  return (
    <span
      className={cn(
        'inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-2xs',
        system ? 'border border-line-strong text-ink-2' : 'bg-info-soft text-info',
      )}
      title={system ? 'Total histórico, sem filtro de data' : 'Somente o intervalo escolhido'}
    >
      {system ? 'Sistema' : 'Período'}
    </span>
  );
}

/** Nome legível do indicador, com o código original e a regra no tooltip. */
export function IndicatorCell({ row }: { row: IndicatorRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ScopeTag scope={row.escopo} />
      <span className="truncate text-ink">{humanizeIndicator(row.indicador)}</span>
      <Tooltip
        content={
          <>
            <span className="mb-1 block font-mono text-2xs opacity-70">
              {row.categoria}.{row.indicador}
            </span>
            {indicatorInfo(row)}
          </>
        }
      >
        <button type="button" className="shrink-0 rounded text-ink-3 hover:text-ink" aria-label={`Como é calculado: ${humanizeIndicator(row.indicador)}`}>
          <Info className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}
