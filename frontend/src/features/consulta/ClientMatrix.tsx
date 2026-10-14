import { Fragment, useMemo } from 'react';
import { Table, TableContainer, Td, Th } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import type { IndicatorRow, QueryResult } from '@/types/api';
import { CATEGORY_LABEL, CATEGORY_TABS, rowKey, tabFor } from './indicators';
import { IndicatorCell } from './IndicatorCell';

interface ClientMatrixProps {
  byClient: QueryResult['byClient'];
  /** Filtro aplicado às linhas (aba + busca), o mesmo da visão consolidada. */
  include: (row: IndicatorRow) => boolean;
}

/**
 * Indicadores nas linhas, clientes nas colunas. É a leitura que o gerente de
 * contas faz na planilha: comparar clientes lado a lado.
 */
export function ClientMatrix({ byClient, include }: ClientMatrixProps) {
  const clients = useMemo(() => byClient.filter((c) => c.ok), [byClient]);
  const { sections, values } = useMemo(() => {
    const lines = new Map<string, IndicatorRow>();
    const values = new Map<string, Map<string, number | null>>();
    for (const entry of clients) {
      const clientId = String(entry.client.id);
      for (const row of entry.rows) {
        if (!include(row)) continue;
        const key = rowKey(row);
        if (!lines.has(key)) lines.set(key, row);
        if (!values.has(key)) values.set(key, new Map());
        const current = values.get(key)!.get(clientId);
        const add = row.quantidade === null ? null : Number(row.quantidade);
        values.get(key)!.set(clientId, current == null ? add : add == null ? current : current + add);
      }
    }
    // Agrupa por categoria, na mesma ordem das abas.
    const sections = CATEGORY_TABS.filter((t) => t !== 'TODOS')
      .map((tab) => ({ tab, lines: [...lines.entries()].filter(([, row]) => tabFor(row) === tab) }))
      .filter((section) => section.lines.length);
    return { sections, values };
  }, [clients, include]);

  if (!clients.length) return <p className="px-4 py-8 text-center text-sm text-ink-3">Nenhum cliente respondeu à consulta.</p>;
  if (!sections.length) return <p className="px-4 py-8 text-center text-sm text-ink-3">Nenhum indicador para o filtro atual.</p>;

  const columnCount = clients.length + 2;

  return (
    <div className="rounded-lg border border-line bg-surface">
      <TableContainer className="max-h-[70vh] overflow-y-auto">
        <Table>
          <thead>
            <tr>
              <Th className="sticky left-0 z-[2] min-w-72 bg-subtle">Indicador</Th>
              {clients.map((c) => (
                <Th key={c.client.id} className="max-w-36 text-right">
                  <span className="block truncate" title={c.client.name}>
                    {c.client.name}
                  </span>
                </Th>
              ))}
              <Th className="text-right text-ink">Total</Th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.tab}>
                <tr>
                  <th colSpan={columnCount} scope="colgroup" className="sticky left-0 border-b border-line bg-canvas px-4 py-1.5 text-left text-xs font-medium text-ink-2">
                    {CATEGORY_LABEL[section.tab]}
                  </th>
                </tr>
                {section.lines.map(([key, row]) => {
                  const perClient = values.get(key)!;
                  const numbers = [...perClient.values()].filter((v): v is number => v !== null);
                  const total = numbers.length ? numbers.reduce((a, b) => a + b, 0) : null;
                  return (
                    <tr key={key} className="group">
                      <Td className="sticky left-0 z-[1] max-w-80 bg-surface group-hover:bg-subtle">
                        <IndicatorCell row={row} />
                        {row.evento && <span className="mt-0.5 block truncate pl-12 text-xs text-ink-3">{row.evento}</span>}
                      </Td>
                      {clients.map((c) => {
                        const value = perClient.get(String(c.client.id));
                        return (
                          <Td key={c.client.id} className={cn('text-right tabular group-hover:bg-subtle', value == null && 'text-ink-3')}>
                            {formatCount(value)}
                          </Td>
                        );
                      })}
                      <Td className="text-right font-medium tabular group-hover:bg-subtle">{formatCount(total)}</Td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </TableContainer>
    </div>
  );
}
