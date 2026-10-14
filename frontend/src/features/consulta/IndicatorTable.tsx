import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SortableTh, sortBy, Table, TableContainer, Td, Tr, type SortState } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/format';
import type { IndicatorRow } from '@/types/api';
import { humanizeIndicator, rowKey } from './indicators';
import { IndicatorCell } from './IndicatorCell';

type SortKey = 'indicador' | 'evento' | 'quantidade';

interface IndicatorTableProps {
  title: string;
  rows: IndicatorRow[];
  detailLabel: string;
  collapsible?: boolean;
}

/** Tabela consolidada de uma categoria. Maior quantidade primeiro por padrão. */
export function IndicatorTable({ title, rows, detailLabel, collapsible = true }: IndicatorTableProps) {
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'quantidade', direction: 'desc' });
  const [open, setOpen] = useState(true);
  const hasDetail = rows.some((r) => r.evento);
  const sorted = sortBy(rows, sort, (row, key) =>
    key === 'quantidade' ? row.quantidade : key === 'indicador' ? humanizeIndicator(row.indicador) : row.evento,
  );

  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-ink">
          {title} <span className="ml-1 font-normal text-ink-3">{rows.length}</span>
        </h3>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-ink-2 hover:bg-hover"
          >
            {open ? 'Recolher' : 'Expandir'}
            <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          </button>
        )}
      </header>
      {open && (
        <TableContainer className="border-t border-line">
          <Table>
            <thead>
              <tr>
                <SortableTh sortKey="indicador" sort={sort} onSort={setSort} className="w-[45%]">
                  Indicador
                </SortableTh>
                {hasDetail && (
                  <SortableTh sortKey="evento" sort={sort} onSort={setSort}>
                    {detailLabel}
                  </SortableTh>
                )}
                <SortableTh sortKey="quantidade" sort={sort} onSort={setSort} align="right" className="w-32">
                  Quantidade
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <Tr key={rowKey(row)}>
                  <Td className="max-w-0">
                    <IndicatorCell row={row} />
                  </Td>
                  {hasDetail && <Td className="max-w-72 truncate text-ink-2" title={row.evento ?? ''}>{row.evento || '—'}</Td>}
                  <Td className={cn('text-right font-medium tabular', row.quantidade === null && 'text-ink-3')}>{formatCount(row.quantidade)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}
    </section>
  );
}
