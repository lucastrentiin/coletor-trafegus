import { Cable, Network, Database, Gauge, Headset, ScrollText, Search, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import type { PermissionCode } from '@/types/api';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionCode;
  /** Só existe quando há login (banco de aplicação configurado). */
  requiresAuth?: boolean;
  shortcut?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Painel', icon: Gauge, permission: 'dashboard.view', shortcut: 'g p' },
      { to: '/consulta', label: 'Consulta', icon: Search, permission: 'consulta.view', shortcut: 'g c' },
      { to: '/atendimentos', label: 'Atendimentos', icon: Headset, permission: 'attendance.view' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Database, permission: 'clients.view', shortcut: 'g l' },
      { to: '/conexoes', label: 'Conexões', icon: Cable, permission: 'config.view' },
      { to: '/vpns', label: 'VPNs', icon: Network, permission: 'config.view' },
    ],
  },
  {
    label: 'Administração',
    items: [
      { to: '/logs', label: 'Logs e auditoria', icon: ScrollText, permission: 'logs.view' },
      { to: '/usuarios', label: 'Usuários', icon: Users, permission: 'users.view', requiresAuth: true },
      { to: '/perfis', label: 'Perfis de acesso', icon: ShieldCheck, permission: 'profiles.view', requiresAuth: true },
    ],
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAVIGATION.flatMap((group) => group.items).find((item) =>
    item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
}
