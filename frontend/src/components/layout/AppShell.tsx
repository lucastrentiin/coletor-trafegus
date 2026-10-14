import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { usePersistentState } from '@/hooks/usePersistentState';
import { useHotkey } from '@/hooks/useHotkey';
import { useAuth } from '@/state/auth';
import { ChangePasswordDialog } from '@/features/account/ChangePasswordDialog';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Atalhos "g + letra" para trocar de página sem mouse. */
function useGoShortcuts() {
  const navigate = useNavigate();
  const [armed, setArmed] = useState(false);
  useHotkey('g', () => {
    setArmed(true);
    window.setTimeout(() => setArmed(false), 1200);
  });
  useHotkey('p', () => navigate('/'), { enabled: armed });
  useHotkey('c', () => navigate('/consulta'), { enabled: armed });
  useHotkey('l', () => navigate('/clientes'), { enabled: armed });
}

export function AppShell() {
  const [collapsed, setCollapsed] = usePersistentState('menu-recolhido', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  useHotkey('[', () => setCollapsed((c) => !c));
  useGoShortcuts();

  return (
    <div className="flex min-h-dvh">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main id="conteudo" className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </main>
      </div>
      {/* Senha temporária ou vencida: troca obrigatória antes de continuar. */}
      {user?.mustChangePassword && <ChangePasswordDialog open forced onOpenChange={() => undefined} />}
    </div>
  );
}
