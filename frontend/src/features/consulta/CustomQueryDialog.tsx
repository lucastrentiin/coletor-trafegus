import { useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Play, Trash2, FileCode2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Checkbox, Switch } from '@/components/ui/choice';
import { SearchInput } from '@/components/ui/controls';
import { Badge, Callout, EmptyState, Kbd, Skeleton } from '@/components/ui/feedback';
import { Menu } from '@/components/ui/menu';
import { useConfirm } from '@/components/ui/confirm';
import { keys, useSavedQueries } from '@/hooks/useData';
import { normalizeSearch } from '@/lib/format';
import { consultaService } from '@/services/consulta';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import type { CustomSource, SavedQuery } from '@/types/api';

const SOURCES: { value: CustomSource; label: string; hint: string }[] = [
  { value: 'CLIENTES', label: 'Bancos dos clientes selecionados', hint: 'Roda o mesmo SELECT em cada cliente escolhido na consulta.' },
  { value: 'ATENDIMENTOS', label: 'Banco de atendimentos', hint: 'Consulta o banco de chamados (estatistica.chamados_bi).' },
  { value: 'CENTRAL', label: 'Banco central do coletor', hint: 'Consulta o banco central configurado em Conexões.' },
];

interface Draft {
  name: string;
  category: string;
  description: string;
  source: CustomSource;
  usesPeriod: boolean;
  sql: string;
  save: boolean;
}

const EMPTY: Draft = { name: '', category: '', description: '', source: 'CLIENTES', usesPeriod: false, sql: '', save: false };

/** Validação local com as mesmas regras do servidor, para responder antes do envio. */
function validateSql(sql: string, usesPeriod: boolean): string | null {
  const s = sql.trim();
  if (!s) return 'Escreva a consulta.';
  if (!/^select\b/i.test(s)) return 'A consulta precisa começar com SELECT.';
  if (/[;\0]/.test(s)) return 'Use um único SELECT, sem ponto e vírgula.';
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|do|call|vacuum|analyze|refresh)\b/i.test(s))
    return 'Comandos de escrita ou manutenção não são permitidos.';
  if (usesPeriod && (!/\$1\b/.test(s) || !/\$2\b/.test(s))) return 'Com período, use $1 (início) e $2 (fim exclusivo).';
  if (!usesPeriod && /\$(1|2)\b/.test(s)) return 'Sem período, a consulta não pode usar $1 ou $2.';
  return null;
}

function SavedQueriesList({ onRun, onEdit }: { onRun: (q: SavedQuery) => void; onEdit: (q: SavedQuery) => void }) {
  const { data, isLoading } = useSavedQueries();
  const [search, setSearch] = useState('');
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    const term = normalizeSearch(search);
    return (data ?? []).filter((q) => !term || normalizeSearch(`${q.name} ${q.category} ${q.description}`).includes(term));
  }, [data, search]);

  const remove = async (q: SavedQuery) => {
    const ok = await confirm({
      title: `Excluir "${q.name}"?`,
      description: 'A busca salva deixa de aparecer para todos os usuários.',
      confirmLabel: 'Excluir busca',
      destructive: true,
    });
    if (!ok) return;
    try {
      await consultaService.removeSaved(q.id);
      await queryClient.invalidateQueries({ queryKey: keys.savedQueries });
      toast.success('Busca excluída');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <SearchInput value={search} onValueChange={setSearch} placeholder="Buscar buscas salvas" />
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon={<FileCode2 />}
            title={search ? 'Nada encontrado' : 'Nenhuma busca salva'}
            description={search ? undefined : 'Marque "Salvar para reutilizar" ao executar uma consulta.'}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((q) => (
              <li key={q.id} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{q.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                    <Badge>{q.category || 'Personalizada'}</Badge>
                    {SOURCES.find((s) => s.value === q.source)?.label.replace(' selecionados', '')}
                    {q.usesPeriod && <Badge tone="info">Com período</Badge>}
                  </p>
                  {q.description && <p className="mt-1 line-clamp-2 text-xs text-ink-2">{q.description}</p>}
                </div>
                <IconButton label={`Executar ${q.name}`} size="sm" onClick={() => onRun(q)}>
                  <Play className="size-3.5" />
                </IconButton>
                <Menu
                  trigger={
                    <IconButton label="Mais ações" size="sm">
                      <MoreHorizontal className="size-3.5" />
                    </IconButton>
                  }
                  items={[
                    { label: 'Abrir no editor', icon: <PencilLine />, onSelect: () => onEdit(q) },
                    { label: 'Excluir', icon: <Trash2 />, destructive: true, onSelect: () => void remove(q) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CustomQueryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { runCustom, running, selectedIds } = useConsulta();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const sqlError = validateSql(draft.sql, draft.usesPeriod);
  const nameError = draft.name.trim() ? null : 'Dê um nome para identificar o resultado.';
  const { can } = useAuth();

  const execute = async (input: Draft) => {
    const ok = await runCustom({
      source: input.source,
      usesPeriod: input.usesPeriod,
      name: input.name.trim(),
      category: input.category.trim() || 'PERSONALIZADA',
      description: input.description.trim(),
      sql: input.sql.trim(),
      save: input.save,
    });
    if (ok) {
      setDraft(EMPTY);
      setTouched(false);
      onOpenChange(false);
    }
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setTouched(true);
    if (sqlError || nameError) return;
    void execute(draft);
  };

  const fromSaved = (q: SavedQuery): Draft => ({
    name: q.name,
    category: q.category,
    description: q.description,
    source: q.source,
    usesPeriod: q.usesPeriod,
    sql: q.sql,
    save: false,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Busca SQL personalizada"
      description="Somente SELECT. O resultado aparece na tela de Consulta e fica registrado na auditoria."
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-xs text-ink-3 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd> executa
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="custom-query" variant="primary" icon={<Play className="size-3.5" />} loading={running === 'custom'}>
            Executar busca
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <aside className="order-2 flex max-h-96 min-h-0 flex-col border-t border-line pt-4 md:order-1 md:max-h-[32rem] md:border-t-0 md:border-r md:pt-0 md:pr-6">
          <h3 className="mb-2 text-xs font-medium text-ink-2">Buscas salvas</h3>
          <SavedQueriesList
            onEdit={(q) => setDraft(fromSaved(q))}
            onRun={(q) => {
              if (q.source === 'CLIENTES' && !selectedIds.length) {
                toast.error('Selecione pelo menos um cliente antes de executar esta busca.');
                return;
              }
              void execute(fromSaved(q));
            }}
          />
        </aside>

        <form
          id="custom-query"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(event);
          }}
          className="order-1 grid min-w-0 gap-3 md:order-2"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" required error={touched ? nameError : null}>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Viagens sem início" maxLength={120} />
            </Field>
            <Field label="Categoria" hint="Agrupa as buscas salvas.">
              <Input value={draft.category} onChange={(e) => set('category', e.target.value)} placeholder="PERSONALIZADA" maxLength={60} />
            </Field>
          </div>
          <Field label="Origem dos dados" hint={SOURCES.find((s) => s.value === draft.source)?.hint}>
            <Select value={draft.source} onChange={(e) => set('source', e.target.value as CustomSource)}>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                  {s.value === 'CLIENTES' ? ` (${selectedIds.length})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {draft.source === 'CLIENTES' && !selectedIds.length && (
            <Callout tone="warning">Nenhum cliente selecionado. Feche este diálogo e escolha os clientes na consulta.</Callout>
          )}
          <Field label="SQL" required error={touched ? sqlError : null} hint={draft.usesPeriod ? '$1 = início do período, $2 = fim exclusivo.' : undefined}>
            <Textarea
              value={draft.sql}
              onChange={(e) => set('sql', e.target.value)}
              spellCheck={false}
              rows={9}
              className="font-mono text-xs leading-5"
              placeholder={'SELECT viag_codigo, viag_data_cadastro\nFROM viag_viagem\nWHERE viag_data_cadastro >= $1 AND viag_data_cadastro < $2'}
            />
          </Field>
          <Switch
            checked={draft.usesPeriod}
            onCheckedChange={(v) => set('usesPeriod', v)}
            label="Usar o período da consulta"
            description="Envia início e fim do período escolhido como $1 e $2."
          />
          <Field label="Descrição" hint="Opcional. Ajuda quem for reutilizar.">
            <Input value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={300} />
          </Field>
          {can('query.custom') && (
            <Checkbox checked={draft.save} onCheckedChange={(v) => set('save', v)} label="Salvar para reutilizar" description="Fica disponível para todos na lista de buscas salvas." />
          )}
        </form>
      </div>
    </Dialog>
  );
}
