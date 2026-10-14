import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/choice';
import { Sheet } from '@/components/ui/dialog';
import { Field, FormSection } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProfilePayload } from '@/services/admin';
import type { Permission, Profile } from '@/types/api';

const AREA_LABELS: Record<string, string> = {
  dashboard: 'Painel',
  consulta: 'Consulta',
  clientes: 'Clientes',
  configuracao: 'Conexões',
  atendimentos: 'Atendimentos',
  usuarios: 'Usuários',
  perfis: 'Perfis',
  logs: 'Logs',
};

const AREA_ORDER = Object.keys(AREA_LABELS);

interface ProfileFormSheetProps {
  profile: Profile | null;
  permissions: Permission[];
  onClose: () => void;
  onSubmit: (payload: ProfilePayload) => Promise<boolean>;
}

/** Montar com key do perfil. */
export function ProfileFormSheet({ profile, permissions, onClose, onSubmit }: ProfileFormSheetProps) {
  const [code, setCode] = useState(profile?.code ?? '');
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [active, setActive] = useState(profile?.active ?? true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set((profile?.permissionIds ?? []).map(String)));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const areas = useMemo(() => {
    const map = new Map<string, Permission[]>();
    permissions.forEach((p) => map.set(p.area, [...(map.get(p.area) ?? []), p]));
    return [...map.entries()].sort(([a], [b]) => (AREA_ORDER.indexOf(a) + 1 || 99) - (AREA_ORDER.indexOf(b) + 1 || 99));
  }, [permissions]);

  const errors = { code: !code.trim() ? 'Informe o código.' : null, name: !name.trim() ? 'Informe o nome.' : null };

  const toggle = (ids: string[], checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (errors.code || errors.name) return;
    setSaving(true);
    const ok = await onSubmit({
      id: profile?.id ?? null,
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      active,
      permissionIds: permissions.filter((p) => selected.has(String(p.id))).map((p) => p.id),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      width="lg"
      onOpenChange={(open) => !open && onClose()}
      title={profile ? `Editar ${profile.name}` : 'Novo perfil de acesso'}
      description="As permissões marcadas valem imediatamente para todos os usuários com este perfil."
      footer={
        <>
          <span className="mr-auto text-xs text-ink-3">{selected.size} de {permissions.length} permissões</span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="profile-form" variant="primary" loading={saving}>
            {profile ? 'Salvar alterações' : 'Criar perfil'}
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={submit} className="grid gap-6" noValidate>
        <FormSection title="Identificação">
          <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Field label="Código" required error={touched ? errors.code : null} hint="Maiúsculas, sem espaços.">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))} className="font-mono" />
            </Field>
            <Field label="Nome" required error={touched ? errors.name : null}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <Field label="Descrição">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Gerentes de contas, só consulta e exportação" />
          </Field>
          <Switch checked={active} onCheckedChange={setActive} label="Perfil ativo" />
        </FormSection>

        <FormSection title="Permissões">
          <div className="divide-y divide-line rounded-md border border-line">
            {areas.map(([area, items]) => {
              const ids = items.map((p) => String(p.id));
              const count = ids.filter((id) => selected.has(id)).length;
              return (
                <div key={area} className="px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Checkbox
                      checked={count === 0 ? false : count === ids.length ? true : 'indeterminate'}
                      onCheckedChange={(checked) => toggle(ids, checked)}
                      label={<span className="font-medium">{AREA_LABELS[area] ?? area}</span>}
                    />
                    <span className="text-xs text-ink-3 tabular">
                      {count}/{ids.length}
                    </span>
                  </div>
                  <div className="mt-2.5 grid gap-2 pl-6 sm:grid-cols-2">
                    {items.map((permission) => (
                      <Checkbox
                        key={permission.id}
                        checked={selected.has(String(permission.id))}
                        onCheckedChange={(checked) => toggle([String(permission.id)], checked)}
                        label={permission.name}
                        description={<span className="font-mono">{permission.code}</span>}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </FormSection>
      </form>
    </Sheet>
  );
}
