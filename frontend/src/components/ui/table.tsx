import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export function TableContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full overflow-x-auto scrollbar-thin', className)}>{children}</div>;
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-[1] h-9 border-b border-line bg-subtle px-3 text-left text-xs font-medium whitespace-nowrap text-ink-3 first:pl-4 last:pr-4',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-10 border-b border-line px-3 align-middle text-ink first:pl-4 last:pr-4', className)} {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-subtle', className)} {...props} />;
}

export type SortDirection = 'asc' | 'desc';
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

interface SortableThProps<K extends string> extends ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: K;
  sort: SortState<K>;
  onSort: (next: SortState<K>) => void;
  align?: 'left' | 'right';
}

/** Cabeçalho ordenável: primeiro clique ordena, segundo inverte. */
export function SortableTh<K extends string>({ sortKey, sort, onSort, align = 'left', children, className, ...props }: SortableThProps<K>) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(align === 'right' && 'text-right', className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' })}
        className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink', active && 'text-ink', align === 'right' && 'flex-row-reverse')}
      >
        {children}
        <Icon className={cn('size-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </Th>
  );
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

export function sortBy<T, K extends string>(rows: T[], sort: SortState<K>, pick: (row: T, key: K) => unknown): T[] {
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((x, y) => compareValues(pick(x, sort.key), pick(y, sort.key)) * factor);
}
