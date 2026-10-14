import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/choice';
import { Sheet } from '@/components/ui/dialog';
import { Field, FormSection } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Callout } from '@/components/ui/feedback';
import type { UserPayload } from '@/services/admin';
import type { AppUser, Profile } from '@/types/api';

interface UserFormSheetProps {
  user: AppUser | null;
  profiles: Profile[];
  onClose: () => void;
  onSubmit: (payload: UserPayload) => Promise<boolean>;
}

/** Montar com key do usuário. Perfis vêm como códigos na listagem e são convertidos para ids. */
export function UserFormSheet({ user, profiles, onClose, onSubmit }: UserFormSheetProps) {
  const [login, setLogin] = useState(user?.login ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [active, setActive] = useState(user?.active ?? true);
  const [profileIds, setProfileIds] = useState<Profile['id'][]>(() =>
    profiles.filter((p) => (user?.profiles ?? []).includes(p.code)).map((p) => p.id),
  );
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = {
    login: !login.trim() ? 'Informe o login.' : null,
    displayName: !displayName.trim() ? 'Informe o nome.' : null,
    email: email && !/^\S+@\S+\.\S+$/.test(email) ? 'E-mail inválido.' : null,
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    const ok = await onSubmit({ id: user?.id ?? null, login: login.trim(), displayName: displayName.trim(), email: email.trim(), active, profileIds });
    setSaving(false);
    if (ok) onClose();
  };

  const toggleProfile = (id: Profile['id'], checked: boolean) =>
    setProfileIds((current) => (checked ? [...current, id] : current.filter((x) => String(x) !== String(id))));

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={user ? `Editar ${user.displayName}` : 'Novo usuário'}
      description={user ? undefined : 'Uma senha temporária é gerada ao salvar e precisa ser trocada no primeiro acesso.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" variant="primary" loading={saving}>
            {user ? 'Salvar alterações' : 'Criar usuário'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="grid gap-6" noValidate>
        <FormSection title="Dados de acesso">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Login" required error={touched ? errors.login : null}>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" autoFocus={!user} />
            </Field>
            <Field label="Nome" required error={touched ? errors.displayName : null}>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
          </div>
          <Field label="E-mail" error={touched ? errors.email : null}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Switch checked={active} onCheckedChange={setActive} label="Usuário ativo" description="Inativos não conseguem entrar, mas o histórico é mantido." />
        </FormSection>
        <FormSection title="Perfis de acesso" description="As permissões vêm da soma dos perfis marcados.">
          {profiles.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {profiles.map((profile) => (
                <Checkbox
                  key={profile.id}
                  checked={profileIds.some((id) => String(id) === String(profile.id))}
                  onCheckedChange={(checked) => toggleProfile(profile.id, checked)}
                  label={profile.name}
                  description={`${profile.permissionIds.length} permissões${profile.active ? '' : ', inativo'}`}
                />
              ))}
            </div>
          ) : (
            <Callout tone="warning">Nenhum perfil cadastrado. Crie um em Perfis de acesso.</Callout>
          )}
        </FormSection>
      </form>
    </Sheet>
  );
}
