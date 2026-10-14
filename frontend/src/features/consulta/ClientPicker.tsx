import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Popover, Tooltip } from '@/components/ui/menu';
import { SearchInput } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { normalizeSearch, plural } from '@/lib/format';
import type { Client } from '@/types/api';

interface ClientPickerProps {
  clients: Client[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
}

const VISIBLE_CHIPS = 6;

/** Seleção múltipla de bases com busca. Só clientes habilitados podem ser consultados. */
export function ClientPicker({ clients, selectedIds, onChange, loading }: ClientPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showAllChips, setShowAllChips] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const enabled = useMemo(() => clients.filter((c) => c.enabled).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [clients]);
  const disabledCount = clients.length - enabled.length;
  const filtered = useMemo(() => {
    const term = normalizeSearch(search);
    if (!term) return enabled;
    return enabled.filter((c) => normalizeSearch(`${c.name} ${c.database} ${c.host}`).includes(term));
  }, [enabled, search]);

  const selected = new Set(selectedIds);
  const selectedClients = enabled.filter((c) => selected.has(String(c.id)));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(String(c.id)));

  const toggle = (id: string) => onChange(selected.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const toggleFiltered = () => {
    const ids = filtered.map((c) => String(c.id));
    onChange(allFilteredSelected ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
  };

  const chips = showAllChips ? selectedClients : selectedClients.slice(0, VISIBLE_CHIPS);

  return (
    <div className="min-w-0">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch('');
        }}
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
        trigger={
          <button
            type="button"
            disabled={loading}
            className={cn(
              'flex h-8 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-left text-sm',
              'hover:border-ink-3 disabled:opacity-60',
            )}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className={cn('truncate', !selectedClients.length && 'text-ink-3')}>
              {loading
                ? 'Carregando clientes…'
                : selectedClients.length === 0
                  ? 'Escolha os clientes'
                  : selectedClients.length === enabled.length
                    ? `Todos os ${enabled.length} clientes habilitados`
                    : selectedClients.length === 1
                      ? selectedClients[0].name
                      : plural(selectedClients.length, 'cliente selecionado', 'clientes selecionados')}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          </button>
        }
      >
        <div className="border-b border-line p-2">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Buscar por nome, banco ou host"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
              }
              if (event.key === 'Enter' && filtered.length === 1) {
                event.preventDefault();
                toggle(String(filtered[0].id));
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-xs">
          <span className="text-ink-3">
            {selectedClients.length} de {enabled.length} selecionados
          </span>
          <span className="flex gap-3">
            <button type="button" className="font-medium text-ink hover:underline disabled:opacity-40" disabled={!filtered.length} onClick={toggleFiltered}>
              {allFilteredSelected ? 'Desmarcar' : 'Marcar'} {search ? 'encontrados' : 'todos'}
            </button>
            <button type="button" className="text-ink-2 hover:underline disabled:opacity-40" disabled={!selectedIds.length} onClick={() => onChange([])}>
              Limpar
            </button>
          </span>
        </div>
        <ul
          ref={listRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Clientes"
          className="max-h-72 overflow-y-auto p-1 scrollbar-thin"
          onKeyDown={(event) => {
            const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              buttons[Math.max(index - 1, 0)]?.focus();
            }
          }}
        >
          {filtered.map((client) => {
            const id = String(client.id);
            const isSelected = selected.has(id);
            return (
              <li key={id} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-sm border',
                      isSelected ? 'border-primary bg-primary text-primary-ink' : 'border-line-strong',
                    )}
                    aria-hidden
                  >
                    {isSelected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{client.name}</span>
                    <span className="block truncate font-mono text-2xs text-ink-3">
                      {client.database} em {client.sshEnabled ? `${client.sshHost} (SSH)` : `${client.host}:${client.port}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!filtered.length && <li className="px-3 py-6 text-center text-sm text-ink-3">Nenhum cliente habilitado com esse nome.</li>}
        </ul>
        {disabledCount > 0 && (
          <p className="border-t border-line px-3 py-2 text-xs text-ink-3">
            {plural(disabledCount, 'cliente desabilitado não aparece', 'clientes desabilitados não aparecem')} aqui. Reative em Clientes.
          </p>
        )}
      </Popover>

      {selectedClients.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Clientes selecionados">
          {chips.map((client) => (
            <li key={client.id}>
              <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-subtle pr-0.5 pl-2 text-xs text-ink">
                <span className="max-w-40 truncate">{client.name}</span>
                <Tooltip content={`Remover ${client.name}`}>
                  <button
                    type="button"
                    onClick={() => toggle(String(client.id))}
                    className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
                    aria-label={`Remover ${client.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </Tooltip>
              </span>
            </li>
          ))}
          {selectedClients.length > VISIBLE_CHIPS && (
            <li>
              <button type="button" onClick={() => setShowAllChips((v) => !v)} className="h-6 rounded-sm px-2 text-xs font-medium text-ink-2 hover:bg-hover">
                {showAllChips ? 'Mostrar menos' : `+${selectedClients.length - VISIBLE_CHIPS}`}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
