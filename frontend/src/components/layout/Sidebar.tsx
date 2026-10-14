import { NavLink } from 'react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/state/auth';
import { Tooltip } from '@/components/ui/menu';
import { Logo } from './Logo';
import { NAVIGATION, type NavItem } from './navigation';

function useVisibleNavigation() {
  const { can } = useAuth();
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.permission, { requiresAuth: item.requiresAuth })),
  })).filter((group) => group.items.length);
}

function NavEntry({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
          isActive ? 'bg-sidebar-2 text-white' : 'text-sidebar-ink hover:bg-sidebar-2/60 hover:text-white',
          collapsed && 'justify-center px-0',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-r bg-signal" aria-hidden />}
          <item.icon className={cn('size-4 shrink-0', isActive ? 'text-signal' : 'text-sidebar-ink-2 group-hover:text-sidebar-ink')} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = useVisibleNavigation();
  const { authEnabled } = useAuth();
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Principal">
        {groups.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!collapsed && <p className="mb-1.5 px-2.5 text-2xs text-sidebar-ink-2">{group.label}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavEntry item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {!collapsed && (
        <div className="border-t border-sidebar-line px-5 py-3 text-2xs text-sidebar-ink-2">
          <span className="flex items-center gap-1.5">
            <span className={cn('size-1.5 rounded-full', authEnabled ? 'bg-positive' : 'bg-signal')} aria-hidden />
            {authEnabled ? 'Banco de aplicação' : 'Modo local, sem login'}
          </span>
        </div>
      )}
    </>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onMobileOpenChange }: SidebarProps) {
  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-line bg-sidebar transition-[width] duration-150 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 items-center border-b border-sidebar-line', collapsed ? 'justify-center' : 'justify-between px-5')}>
          <Logo collapsed={collapsed} />
          {!collapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="flex size-7 items-center justify-center rounded-md text-sidebar-ink-2 hover:bg-sidebar-2 hover:text-white"
              aria-label="Recolher menu"
              title="Recolher menu ( [ )"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>
        <SidebarContent collapsed={collapsed} />
        {collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mx-auto mb-3 flex size-8 items-center justify-center rounded-md text-sidebar-ink-2 hover:bg-sidebar-2 hover:text-white"
            aria-label="Expandir menu"
            title="Expandir menu ( [ )"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar data-[state=open]:animate-[drawer-in_180ms_ease-out] lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navegação principal</DialogPrimitive.Description>
            <div className="flex h-14 items-center justify-between border-b border-sidebar-line px-5">
              <Logo />
              <DialogPrimitive.Close className="flex size-8 items-center justify-center rounded-md text-sidebar-ink-2 hover:bg-sidebar-2 hover:text-white" aria-label="Fechar menu">
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <SidebarContent collapsed={false} onNavigate={() => onMobileOpenChange(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
