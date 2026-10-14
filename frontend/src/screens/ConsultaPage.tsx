import { useState } from 'react';
import { Link } from 'react-router';
import { Code2, FileSpreadsheet, Play, Search } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Kbd, Skeleton } from '@/components/ui/feedback';
import { Tooltip } from '@/components/ui/menu';
import { useClients } from '@/hooks/useData';
import { useHotkey } from '@/hooks/useHotkey';
import { formatIsoDate, plural } from '@/lib/format';
import { resolveRange } from '@/lib/period';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import { ClientPicker } from '@/features/consulta/ClientPicker';
import { PeriodPicker } from '@/features/consulta/PeriodPicker';
import { ExportDialog } from '@/features/consulta/ExportDialog';
import { CustomQueryDialog } from '@/features/consulta/CustomQueryDialog';
import { ResultSummary } from '@/features/consulta/ResultSummary';
import { IndicatorResults } from '@/features/consulta/IndicatorResults';
import { CustomResults } from '@/features/consulta/CustomResults';

function RunningState({ clientCount }: { clientCount: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4" role="status" aria-live="polite">
      <p className="text-sm text-ink-2">
        Consultando {plural(clientCount, 'cliente', 'clientes')}. Bases acessadas por túnel SSH costumam levar mais tempo.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    </div>
  );
}

export function ConsultaPage() {
  const { can } = useAuth();
  const clientsQuery = useClients();
  const { selectedIds, setSelectedIds, period, setPeriod, result, running, run, exportExcel } = useConsulta();
  const [exportOpen, setExportOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

  const canQuery = can('query.execute');
  const canExport = can('export.execute');
  const canCustom = can('query.custom');
  const busy = running !== null;
  const range = resolveRange(period);
  const periodText = range ? `${formatIsoDate(range.start)}${range.endInclusive !== range.start ? ` a ${formatIsoDate(range.endInclusive)}` : ''}` : 'período inválido';

  useHotkey('mod+enter', () => canQuery && void run(), { allowInInputs: true, enabled: !customOpen && !exportOpen });

  return (
    <>
      <PageHeader title="Consulta" description="Escolha os clientes e o período. O resultado soma os indicadores de todos os clientes que responderem." />

      <section aria-label="Parâmetros da consulta" className="mb-5 rounded-lg border border-line bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-start">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-ink-2">Clientes</p>
            {clientsQuery.isError ? (
              <p className="text-sm text-negative">Não foi possível carregar os clientes. {(clientsQuery.error as Error).message}</p>
            ) : (
              <ClientPicker clients={clientsQuery.data ?? []} selectedIds={selectedIds} onChange={setSelectedIds} loading={clientsQuery.isLoading} />
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-ink-2">Período</p>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <div className="flex flex-wrap gap-2 lg:mt-5 lg:flex-col lg:items-stretch">
            {canQuery && (
              <Tooltip content={<span className="flex items-center gap-1">Atalho <Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></span>}>
                <Button variant="primary" icon={<Play className="size-3.5" />} loading={running === 'query'} disabled={busy && running !== 'query'} onClick={() => void run()}>
                  Consultar
                </Button>
              </Tooltip>
            )}
            {canExport && (
              <Button
                icon={<FileSpreadsheet className="size-4" />}
                loading={running === 'export'}
                disabled={busy && running !== 'export'}
                onClick={() => (selectedIds.length ? setExportOpen(true) : toast.error('Selecione pelo menos um cliente para exportar.'))}
              >
                Exportar Excel
              </Button>
            )}
            {canCustom && (
              <Button variant="ghost" icon={<Code2 className="size-4" />} disabled={busy} onClick={() => setCustomOpen(true)}>
                SQL personalizado
              </Button>
            )}
          </div>
        </div>
      </section>

      {running === 'query' ? (
        <RunningState clientCount={selectedIds.length} />
      ) : result?.kind === 'indicators' ? (
        <div className="grid gap-5">
          <ResultSummary data={result.data} ranAt={result.ranAt} />
          <IndicatorResults data={result.data} />
        </div>
      ) : result?.kind === 'custom' ? (
        <CustomResults data={result.data} name={result.name} ranAt={result.ranAt} />
      ) : clientsQuery.isError ? (
        <ErrorState message="Sem a lista de clientes não é possível consultar." onRetry={() => void clientsQuery.refetch()} className="rounded-lg border border-line bg-surface" />
      ) : clientsQuery.data && !clientsQuery.data.some((c) => c.enabled) ? (
        <EmptyState
          icon={<Search />}
          title="Nenhum cliente habilitado"
          description="Cadastre ou reative um cliente para começar a consultar."
          action={
            <Link to="/clientes" className="text-sm font-medium text-ink underline underline-offset-4">
              Ir para Clientes
            </Link>
          }
          className="rounded-lg border border-dashed border-line-strong"
        />
      ) : (
        <EmptyState
          icon={<Search />}
          title="Nenhuma consulta nesta sessão"
          description={
            selectedIds.length
              ? `${plural(selectedIds.length, 'cliente pronto', 'clientes prontos')} para consultar. Clique em Consultar ou use Ctrl+Enter.`
              : 'Escolha os clientes e o período acima. A seleção fica salva para a próxima vez.'
          }
          className="rounded-lg border border-dashed border-line-strong"
        />
      )}

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} clientCount={selectedIds.length} periodText={periodText} onExport={(mode, detail) => void exportExcel(mode, detail)} />
      <CustomQueryDialog open={customOpen} onOpenChange={setCustomOpen} />
    </>
  );
}
