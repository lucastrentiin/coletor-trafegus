import { download, request } from './http';
import type {
  CustomQueryResult,
  CustomSource,
  ExportDetail,
  ExportMode,
  PeriodPayload,
  QueryResult,
  SavedQuery,
  SkippedClient,
} from '@/types/api';

type ClientIds = (number | string)[];

export interface CustomQueryInput {
  source: CustomSource;
  usesPeriod: boolean;
  name: string;
  category: string;
  description: string;
  sql: string;
  save: boolean;
  clientIds: ClientIds;
  period?: PeriodPayload;
}

export const consultaService = {
  run: (clientIds: ClientIds, period: PeriodPayload) =>
    request<QueryResult>('/api/query', { method: 'POST', body: { ...period, clientIds } }),

  async exportExcel(clientIds: ClientIds, period: PeriodPayload, exportMode: ExportMode, detailLevel: ExportDetail) {
    const result = await download(
      '/api/export',
      { ...period, clientIds, exportMode, detailLevel },
      `coleta_${exportMode.toLowerCase()}.xlsx`,
    );
    let skipped: SkippedClient[] = [];
    const header = result.headers.get('X-Skipped-Clients');
    if (header) {
      try {
        skipped = JSON.parse(decodeURIComponent(header)) as SkippedClient[];
      } catch {
        skipped = [];
      }
    }
    return { ...result, skipped };
  },

  savedQueries: () => request<{ ok: true; queries: SavedQuery[] }>('/api/custom-queries').then((d) => d.queries),

  runCustom: ({ period, ...input }: CustomQueryInput) =>
    request<CustomQueryResult>('/api/custom-query', {
      method: 'POST',
      body: { ...input, ...(input.usesPeriod && period ? period : {}) },
    }),

  removeSaved: (id: SavedQuery['id']) =>
    request<{ ok: true }>(`/api/custom-query/${encodeURIComponent(String(id))}`, { method: 'DELETE' }),
};
