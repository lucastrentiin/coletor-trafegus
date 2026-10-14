import { useCallback, useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { SearchInput, Segmented, Tabs } from '@/components/ui/controls';
import { EmptyState } from '@/components/ui/feedback';
import { usePersistentState } from '@/hooks/usePersistentState';
import { normalizeSearch } from '@/lib/format';
import type { IndicatorRow, QueryResult } from '@/types/api';
import { CATEGORY_LABEL, CATEGORY_TABS, detailLabel, humanizeIndicator, tabFor, type CategoryTab } from './indicators';
import { IndicatorTable } from './IndicatorTable';
import { ClientMatrix } from './ClientMatrix';

type View = 'consolidado' | 'clientes';

export function IndicatorResults({ data }: { data: QueryResult }) {
  const [tab, setTab] = useState<CategoryTab>('TODOS');
  const [search, setSearch] = useState('');
  const [view, setView] = usePersistentState<View>('consulta:visao', 'consolidado');
  const multiClient = data.byClient.filter((c) => c.ok).length > 1;

  const include = useCallback(
    (row: IndicatorRow) => {
      if (tab !== 'TODOS' && tabFor(row) !== tab) return false;
      const term = normalizeSearch(search);
      if (!term) return true;
      return normalizeSearch(`${humanizeIndicator(row.indicador)} ${row.indicador} ${row.evento ?? ''} ${row.categoria} ${row.escopo ?? ''}`).includes(term);
    },
    [tab, search],
  );

  const counts = useMemo(() => {
    const map = new Map<CategoryTab, number>([['TODOS', data.rows.length]]);
    for (const row of data.rows) map.set(tabFor(row), (map.get(tabFor(row)) ?? 0) + 1);
    return map;
  }, [data.rows]);

  const groups = useMemo(() => {
    const filtered = data.rows.filter(include);
    const byTab = new Map<Exclude<CategoryTab, 'TODOS'>, IndicatorRow[]>();
    for (const row of filtered) {
      const key = tabFor(row);
      byTab.set(key, [...(byTab.get(key) ?? []), row]);
    }
    return CATEGORY_TABS.filter((t): t is Exclude<CategoryTab, 'TODOS'> => t !== 'TODOS' && byTab.has(t)).map((t) => ({ tab: t, rows: byTab.get(t)! }));
  }, [data.rows, include]);

  return (
    <div className="min-w-0">
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={CATEGORY_TABS.filter((t) => counts.get(t)).map((t) => ({ value: t, label: CATEGORY_LABEL[t], count: counts.get(t) }))}
      />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onValueChange={setSearch} placeholder="Filtrar indicador ou evento" className="w-full sm:w-72" />
        {multiClient && (
          <Segmented
            label="Visualização"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'consolidado', label: 'Consolidado' },
              { value: 'clientes', label: 'Por cliente' },
            ]}
            className="ml-auto"
          />
        )}
      </div>

      {view === 'clientes' && multiClient ? (
        <ClientMatrix byClient={data.byClient} include={include} />
      ) : groups.length ? (
        <div className="grid gap-3">
          {groups.map((group) => (
            <IndicatorTable key={group.tab} title={CATEGORY_LABEL[group.tab]} rows={group.rows} detailLabel={detailLabel(group.tab)} collapsible={groups.length > 1} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="Nenhum indicador encontrado"
          description={search ? `Nada corresponde a "${search}" nesta categoria.` : 'A consulta não retornou linhas para esta categoria.'}
          className="rounded-lg border border-line bg-surface"
        />
      )}
    </div>
  );
}
