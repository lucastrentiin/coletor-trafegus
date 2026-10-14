import { Link } from 'react-router';
import { ArrowRight, History, Search } from 'lucide-react';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Tooltip } from '@/components/ui/menu';
import { useAuditLog, useDashboard } from '@/hooks/useData';
import { cn } from '@/lib/cn';
import { formatCount, formatDateTime, formatIsoDate, formatShortMoment } from '@/lib/format';
import { PERIOD_LABELS } from '@/lib/period';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import { AttentionList } from '@/features/dashboard/AttentionList';
import { auditSentence } from '@/features/logs/auditLabels';

function StatusStrip() {
  const { data, isLoading, isError, error, refetch } = useDashboard();
  if (isError) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} className="rounded-lg border border-line bg-surface" />;
  const items = [
    { label: 'Bases coletando', value: data?.enabled, hint: 'Clientes habilitados entram na coleta diária e nas consultas.' },
    { label: 'Desabilitadas', value: data?.disabled, hint: 'Manualmente ou por falha de conexão.' },
    { label: 'Com erro de conexão', value: data?.withError, hint: 'Último acesso falhou. Veja o motivo na lista abaixo.', alert: (data?.withError ?? 0) > 0 },
    { label: 'Consultas em paralelo', value: data?.batch, hint: 'Quantos clientes são coletados ao mesmo tempo (CONCURRENCY).' },
  ];
  return (
    <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface lg:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn('border-line px-4 py-3.5', index % 2 === 0 && 'border-r', index < 2 && 'border-b lg:border-b-0', index < 3 && 'lg:border-r')}
        >
          <Tooltip content={item.hint}>
            <dt className="w-fit cursor-help text-xs text-ink-3">{item.label}</dt>
          </Tooltip>
          <dd className={cn('mt-1 text-xl font-medium tabular', item.alert ? 'text-negative' : 'text-ink')}>
            {isLoading ? <Skeleton className="mt-1 h-6 w-12" /> : formatCount(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RecentActivity() {
  const { data, isLoading, isError } = useAuditLog(10);
  return (
    <Panel
      title="Atividade recente"
      actions={
        <Link to="/logs?aba=auditoria" className="text-xs font-medium text-ink-2 hover:text-ink">
          Ver auditoria
        </Link>
      }
    >
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      ) : isError ? (
        <p className="px-4 py-6 text-sm text-ink-3">Não foi possível carregar a auditoria.</p>
      ) : !data?.length ? (
        <EmptyState icon={<History />} title="Sem registros ainda" className="py-8" />
      ) : (
        <ol className="divide-y divide-line">
          {data.map((entry, index) => {
            const { who, what } = auditSentence(entry);
            const refused = entry.status !== 'OK';
            return (
            <li key={`${entry.at}-${index}`} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-ink">{who}</span>{' '}
                <span className={refused ? 'text-negative' : 'text-ink-2'}>{what}</span>
              </span>
              <time dateTime={entry.at} title={formatDateTime(entry.at)} className="shrink-0 text-xs text-ink-3 tabular">
                {formatShortMoment(entry.at)}
              </time>
            </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

function LastQuery() {
  const { result } = useConsulta();
  if (result?.kind !== 'indicators') {
    return (
      <Panel title="Última consulta">
        <EmptyState
          icon={<Search />}
          title="Nenhuma consulta nesta sessão"
          action={
            <Link to="/consulta" className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:underline">
              Abrir consulta <ArrowRight className="size-3.5" />
            </Link>
          }
          className="py-8"
        />
      </Panel>
    );
  }
  const { data, ranAt } = result;
  return (
    <Panel
      title="Última consulta"
      description={`${PERIOD_LABELS[data.mode]} de ${formatIsoDate(data.start)}${data.endInclusive !== data.start ? ` a ${formatIsoDate(data.endInclusive)}` : ''}, às ${formatShortMoment(ranAt)}`}
      actions={
        <Link to="/consulta" className="text-xs font-medium text-ink-2 hover:text-ink">
          Abrir
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-px bg-line">
        {[
          ['Viagens', data.totals.viagens],
          ['Terminais ativos', data.totals.terminaisAtivos],
          ['Eventos', data.totals.eventosGerados],
          ['Acessos', data.totals.acessosTotal],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-3">{label}</dt>
            <dd className="mt-0.5 text-md font-medium tabular">{formatCount(value)}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function DashboardPage() {
  const { can, authEnabled, user } = useAuth();
  const firstName = user?.displayName?.split(' ')[0];
  return (
    <>
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : 'Painel'}
        description="Estado das bases de clientes e o que aconteceu por último."
        actions={
          can('consulta.view') && (
            <Link to="/consulta" className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-ink hover:bg-primary-hover">
              <Search className="size-3.5" /> Nova consulta
            </Link>
          )
        }
      />
      <div className="grid gap-5">
        <StatusStrip />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <AttentionList />
          <div className="grid content-start gap-5">
            {can('consulta.view') && <LastQuery />}
            {authEnabled && can('logs.view') && <RecentActivity />}
          </div>
        </div>
      </div>
    </>
  );
}
