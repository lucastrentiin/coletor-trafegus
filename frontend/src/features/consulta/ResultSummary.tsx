import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/menu';
import { cleanError, formatCount, formatIsoDate, formatShortMoment, plural } from '@/lib/format';
import { PERIOD_LABELS } from '@/lib/period';
import type { QueryResult } from '@/types/api';

const KPIS: { key: keyof QueryResult['totals']; label: string; scope: 'período' | 'sistema' }[] = [
  { key: 'viagens', label: 'Viagens cadastradas', scope: 'período' },
  { key: 'terminaisAtivos', label: 'Terminais ativos', scope: 'sistema' },
  { key: 'eventosGerados', label: 'Eventos gerados', scope: 'período' },
  { key: 'usuariosConectados', label: 'Usuários conectados', scope: 'período' },
  { key: 'acessosTotal', label: 'Acessos', scope: 'período' },
];

export function ResultSummary({ data, ranAt }: { data: QueryResult; ranAt: number }) {
  const failed = data.clients.filter((c) => !c.ok);
  const ok = data.clients.length - failed.length;
  return (
    <div className="rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {PERIOD_LABELS[data.mode]} de {formatIsoDate(data.start)}
            {data.endInclusive !== data.start && ` a ${formatIsoDate(data.endInclusive)}`}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-3" title={data.clients.map((c) => c.name).join(', ')}>
            {data.clients.length === 1 ? data.clients[0].name : plural(data.clients.length, 'cliente', 'clientes')}. Consultado às {formatShortMoment(ranAt)}
          </p>
        </div>
        {failed.length ? (
          <span className="flex items-center gap-1.5 text-sm text-warning">
            <AlertTriangle className="size-4" /> {ok} de {data.clients.length} responderam
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-positive">
            <CheckCircle2 className="size-4" /> Todos responderam
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {KPIS.map((kpi) => (
          <div key={kpi.key} className="border-line px-4 py-3 not-last:border-b lg:border-b-0">
            <dt className="text-xs text-ink-3">
              {kpi.label} <span className="text-ink-3/80">({kpi.scope})</span>
            </dt>
            <dd className="mt-1 text-xl font-medium tabular text-ink">{formatCount(data.totals[kpi.key])}</dd>
          </div>
        ))}
      </dl>
      {failed.length > 0 && (
        <div className="border-t border-line bg-warning-soft/40 px-4 py-3">
          <p className="text-xs font-medium text-warning">Sem resposta, desabilitados automaticamente</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
            {failed.map((c) => (
              <li key={c.id} className="text-sm">
                <Tooltip content={cleanError(c.error) || 'Falha na consulta.'}>
                  <span className="cursor-help border-b border-dotted border-ink-3 text-ink">{c.name}</span>
                </Tooltip>
                <span className="ml-2 text-xs text-ink-3">{cleanError(c.error).slice(0, 60)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
