import { useState } from 'react';
import { useLocation } from 'react-router';
import { KeyRound, LogOut, Menu as MenuIcon, Monitor, Moon, Sun, WifiOff } from 'lucide-react';
import { IconButton } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';
import { ChangePasswordDialog } from '@/features/account/ChangePasswordDialog';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useTheme, type ThemeMode } from '@/hooks/useTheme';
import { initials } from '@/lib/format';
import { authService } from '@/services/auth';
import { useAuth } from '@/state/auth';
import { findNavItem } from './navigation';

const THEME_LABEL: Record<ThemeMode, string> = { sistema: 'Automático', light: 'Claro', dark: 'Escuro' };

function ThemeMenu() {
  const { mode, resolved, setMode } = useTheme();
  const Icon = mode === 'sistema' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <Menu
      label="Tema"
      trigger={
        <IconButton label={`Tema: ${THEME_LABEL[mode]}`}>
          <Icon className="size-4" />
        </IconButton>
      }
      items={(['sistema', 'light', 'dark'] as ThemeMode[]).map((option) => ({
        label: `${THEME_LABEL[option]}${option === mode ? ' (atual)' : ''}`,
        icon: option === 'sistema' ? <Monitor /> : option === 'dark' ? <Moon /> : <Sun />,
        onSelect: () => setMode(option),
      }))}
    />
  );
}

function UserMenu() {
  const { user, profiles } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  if (!user) return null;
  const name = user.displayName || user.login;
  return (
    <>
      <Menu
        label={
          <span className="block">
            <span className="block text-sm font-medium text-ink">{name}</span>
            <span className="block text-xs text-ink-3">{profiles.map((p) => p.name).join(', ') || 'Sem perfil'}</span>
          </span>
        }
        trigger={
          <button
            type="button"
            className="flex h-8 items-center gap-2 rounded-md pr-2 pl-1 hover:bg-hover"
            aria-label={`Conta de ${name}`}
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-ink text-2xs font-semibold text-canvas">{initials(name)}</span>
            <span className="hidden max-w-40 truncate text-sm text-ink-2 md:block">{name}</span>
          </button>
        }
        items={[
          { label: 'Trocar senha', icon: <KeyRound />, onSelect: () => setChangingPassword(true) },
          'separator',
          {
            label: 'Sair',
            icon: <LogOut />,
            onSelect: async () => {
              await authService.logout().catch(() => undefined);
              window.location.assign('/login.html');
            },
          },
        ]}
      />
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </>
  );
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { pathname } = useLocation();
  const online = useOnlineStatus();
  const current = findNavItem(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur-sm lg:px-6">
      <IconButton label="Abrir menu" className="lg:hidden" onClick={onOpenMenu}>
        <MenuIcon className="size-4" />
      </IconButton>
      <nav aria-label="Você está em" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm">
          <li className="hidden text-ink-3 sm:block">Coletor</li>
          <li className="hidden text-line-strong sm:block" aria-hidden>
            /
          </li>
          <li className="truncate font-medium text-ink" aria-current="page">
            {current?.label ?? 'Página não encontrada'}
          </li>
        </ol>
      </nav>
      {!online && (
        <span className="flex items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-xs text-warning" role="status">
          <WifiOff className="size-3.5" /> Sem conexão
        </span>
      )}
      <ThemeMenu />
      <UserMenu />
    </header>
  );
}
