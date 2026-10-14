import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { consultaService, type CustomQueryInput } from '@/services/consulta';
import { saveBlob } from '@/services/http';
import { keys, useClients } from '@/hooks/useData';
import { usePersistentState } from '@/hooks/usePersistentState';
import { defaultPeriod, periodError, toPayload, type PeriodState } from '@/lib/period';
import { plural } from '@/lib/format';
import type { CustomQueryResult, ExportDetail, ExportMode, PeriodType, QueryResult, SkippedClient } from '@/types/api';

export type ConsultaResult =
  | { kind: 'indicators'; data: QueryResult; ranAt: number }
  | { kind: 'custom'; data: CustomQueryResult; name: string; ranAt: number };

type Running = 'query' | 'export' | 'custom' | null;

interface ConsultaState {
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  toggleClient: (id: string) => void;
  period: PeriodState;
  setPeriod: (next: PeriodState) => void;
  result: ConsultaResult | null;
  clearResult: () => void;
  running: Running;
  /** Erros de conexão vistos nesta sessão, por cliente. */
  clientErrors: Record<string, string>;
  run: () => Promise<void>;
  exportExcel: (mode: ExportMode, detail: ExportDetail) => Promise<void>;
  runCustom: (input: Omit<CustomQueryInput, 'clientIds' | 'period'>) => Promise<boolean>;
}

const ConsultaContext = createContext<ConsultaState | null>(null);

export function ConsultaProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: clients } = useClients();
  const [selectedIds, setSelectedIds] = usePersistentState<string[]>('consulta:clientes', []);
  const [periodType, setPeriodType] = usePersistentState<PeriodType>('consulta:tipo', 'DIA');
  const [period, setPeriodState] = useState<PeriodState>(() => ({ ...defaultPeriod(), type: periodType }));
  const [result, setResult] = useState<ConsultaResult | null>(null);
  const [running, setRunning] = useState<Running>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const setPeriod = useCallback(
    (next: PeriodState) => {
      setPeriodState(next);
      setPeriodType(next.type);
    },
    [setPeriodType],
  );

  // Clientes desabilitados (manualmente ou por falha) saem da seleção sozinhos.
  useEffect(() => {
    if (!clients) return;
    const enabled = new Set(clients.filter((c) => c.enabled).map((c) => String(c.id)));
    setSelectedIds((current) => {
      const next = current.filter((id) => enabled.has(id));
      return next.length === current.length ? current : next;
    });
  }, [clients, setSelectedIds]);

  const toggleClient = useCallback(
    (id: string) => setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id])),
    [setSelectedIds],
  );

  const refreshClientData = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.clients });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  }, [queryClient]);

  const handleSkipped = useCallback(
    (skipped: SkippedClient[]) => {
      if (!skipped.length) return;
      setClientErrors((current) => ({ ...current, ...Object.fromEntries(skipped.map((c) => [String(c.id), c.error])) }));
      setSelectedIds((current) => current.filter((id) => !skipped.some((c) => String(c.id) === id)));
      toast.warning(`${plural(skipped.length, 'cliente desabilitado foi ignorado', 'clientes desabilitados foram ignorados')}`, {
        description: skipped.map((c) => c.name).join(', '),
      });
    },
    [setSelectedIds],
  );

  const validate = useCallback((): boolean => {
    if (!selectedIds.length) {
      toast.error('Selecione pelo menos um cliente.');
      return false;
    }
    const error = periodError(period);
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  }, [selectedIds, period]);

  const run = useCallback(async () => {
    if (running || !validate()) return;
    setRunning('query');
    const pending = toast.loading(`Consultando ${plural(selectedIds.length, 'cliente', 'clientes')}…`);
    try {
      const data = await consultaService.run(selectedIds, toPayload(period));
      handleSkipped(data.skippedClients);
      const failed = data.clients.filter((c) => !c.ok);
      if (failed.length) {
        setClientErrors((current) => ({ ...current, ...Object.fromEntries(failed.map((c) => [String(c.id), c.error || 'Falha na consulta.'])) }));
        setSelectedIds((current) => current.filter((id) => !failed.some((c) => String(c.id) === id)));
      }
      setResult({ kind: 'indicators', data, ranAt: Date.now() });
      if (failed.length) {
        toast.warning(`Consulta concluída com ${plural(failed.length, 'falha', 'falhas')}`, {
          id: pending,
          description: 'Clientes com erro de conexão foram desabilitados. Veja o motivo no resultado.',
        });
      } else {
        toast.success(`Consulta concluída em ${plural(data.clients.length, 'cliente', 'clientes')}`, { id: pending });
      }
    } catch (error) {
      toast.error('A consulta não foi concluída', { id: pending, description: (error as Error).message });
    } finally {
      setRunning(null);
      refreshClientData();
    }
  }, [running, validate, selectedIds, period, handleSkipped, setSelectedIds, refreshClientData]);

  const exportExcel = useCallback(
    async (mode: ExportMode, detail: ExportDetail) => {
      if (running || !validate()) return;
      setRunning('export');
      const pending = toast.loading('Gerando planilha… isso pode levar alguns minutos.');
      try {
        const { blob, filename, skipped } = await consultaService.exportExcel(selectedIds, toPayload(period), mode, detail);
        handleSkipped(skipped);
        saveBlob(blob, filename);
        toast.success('Planilha exportada', { id: pending, description: filename });
      } catch (error) {
        toast.error('A exportação falhou', { id: pending, description: (error as Error).message });
      } finally {
        setRunning(null);
        refreshClientData();
      }
    },
    [running, validate, selectedIds, period, handleSkipped, refreshClientData],
  );

  const runCustom = useCallback<ConsultaState['runCustom']>(
    async (input) => {
      if (running) return false;
      if (input.source === 'CLIENTES' && !selectedIds.length) {
        toast.error('Selecione pelo menos um cliente para consultar os bancos dos clientes.');
        return false;
      }
      if (input.usesPeriod) {
        const error = periodError(period);
        if (error) {
          toast.error(error);
          return false;
        }
      }
      setRunning('custom');
      const pending = toast.loading('Executando busca personalizada…');
      try {
        const data = await consultaService.runCustom({ ...input, clientIds: selectedIds, period: toPayload(period) });
        handleSkipped(data.skippedClients);
        setResult({ kind: 'custom', data, name: input.name, ranAt: Date.now() });
        if (input.save) void queryClient.invalidateQueries({ queryKey: keys.savedQueries });
        if (data.failed) {
          toast.warning(`Busca concluída com ${plural(data.errors.length, 'falha', 'falhas')}`, { id: pending });
        } else {
          toast.success(input.save ? 'Busca executada e salva' : 'Busca executada', { id: pending });
        }
        return true;
      } catch (error) {
        toast.error('A busca não foi executada', { id: pending, description: (error as Error).message });
        return false;
      } finally {
        setRunning(null);
        if (input.source === 'CLIENTES') refreshClientData();
      }
    },
    [running, selectedIds, period, handleSkipped, queryClient, refreshClientData],
  );

  const value = useMemo<ConsultaState>(
    () => ({
      selectedIds,
      setSelectedIds,
      toggleClient,
      period,
      setPeriod,
      result,
      clearResult: () => setResult(null),
      running,
      clientErrors,
      run,
      exportExcel,
      runCustom,
    }),
    [selectedIds, setSelectedIds, toggleClient, period, setPeriod, result, running, clientErrors, run, exportExcel, runCustom],
  );

  return <ConsultaContext.Provider value={value}>{children}</ConsultaContext.Provider>;
}

export function useConsulta(): ConsultaState {
  const context = useContext(ConsultaContext);
  if (!context) throw new Error('useConsulta precisa estar dentro de ConsultaProvider');
  return context;
}
