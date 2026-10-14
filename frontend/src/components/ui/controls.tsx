import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { Check, Copy, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { IconButton } from './button';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  shortcutHint?: ReactNode;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, className, shortcutHint, placeholder = 'Buscar…', ...props },
  ref,
) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.stopPropagation();
            onValueChange('');
          }
        }}
        className={cn(
          'h-8 w-full rounded-md border border-line-strong bg-surface pr-8 pl-8 text-sm text-ink placeholder:text-ink-3',
          'hover:border-ink-3 focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/15 focus-visible:outline-none',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...props}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:text-ink"
          aria-label="Limpar busca"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        shortcutHint && <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:block">{shortcutHint}</span>
      )}
    </div>
  );
});

interface SegmentedProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
}

/** Alternância entre poucas opções exclusivas (ex.: Dia / Semana / Mês). */
export function Segmented<T extends string>({ value, onValueChange, options, label, className }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex h-8 rounded-md border border-line-strong bg-subtle p-0.5', className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'flex-1 rounded-[4px] px-3 text-sm whitespace-nowrap transition-colors',
              selected ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line-strong)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface TabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  tabs: { value: T; label: ReactNode; count?: number }[];
  children?: ReactNode;
  className?: string;
}

/** Abas com sublinhado; o conteúdo usa TabPanel com o mesmo value. */
export function Tabs<T extends string>({ value, onValueChange, tabs, children, className }: TabsProps<T>) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)} className={className}>
      <TabsPrimitive.List className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]" aria-label="Seções">
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'relative -mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-sm text-ink-2 transition-colors hover:text-ink',
              'data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="rounded-sm bg-hover px-1 text-2xs tabular text-ink-2">{tab.count}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={value} className={cn('focus-visible:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

export function CopyButton({ value, label = 'Copiar' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      label={copied ? 'Copiado' : label}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
    </IconButton>
  );
}
