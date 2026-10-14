import { request } from './http';
import type {
  AppUser,
  AuditEntry,
  ClearLogsScope,
  CollectionLog,
  ExternalConfig,
  ExternalType,
  LogEventConfig,
  McpLogEntry,
  Permission,
  Profile,
} from '@/types/api';

export interface ExternalPayload {
  type: ExternalType;
  enabled?: boolean;
  ssl: boolean;
  host: string;
  port: number | string;
  database: string;
  user: string;
  password: string;
}

export const connectionsService = {
  get: () => request<ExternalConfig>('/api/external-config'),
  save: (payload: ExternalPayload) =>
    request<ExternalConfig>('/api/external-config', { method: 'POST', body: payload }),
  test: (payload: ExternalPayload) =>
    request<{ ok: true; message: string }>('/api/test-external-config', { method: 'POST', body: payload }),
};

export const logsService = {
  collection: () => request<CollectionLog>('/api/logs'),
  audit: (limit = 50) =>
    request<{ ok: true; entries: AuditEntry[] }>(`/api/audit-log?limit=${limit}`).then((d) => d.entries),
  mcp: (limit = 100) =>
    request<{ ok: true; entries: McpLogEntry[] }>(`/api/mcp-logs?limit=${limit}`).then((d) => d.entries),
  clear: (escopo: ClearLogsScope) =>
    request<{ ok: true; escopo: ClearLogsScope; arquivos: number; auditoria: number }>(`/api/logs?escopo=${escopo}`, {
      method: 'DELETE',
    }),
  config: () => request<{ ok: true; eventos: LogEventConfig[] }>('/api/log-config').then((d) => d.eventos),
  saveConfig: (eventos: Record<string, boolean>) =>
    request<{ ok: true; eventos: LogEventConfig[] }>('/api/log-config', { method: 'PUT', body: { eventos } }).then(
      (d) => d.eventos,
    ),
};

export interface UserPayload {
  id: AppUser['id'] | null;
  login: string;
  displayName: string;
  email: string;
  active: boolean;
  profileIds: Profile['id'][];
}

export interface ProfilePayload {
  id: Profile['id'] | null;
  code: string;
  name: string;
  description: string;
  active: boolean;
  permissionIds: Permission['id'][];
}

export const usersService = {
  list: () => request<{ ok: true; users: AppUser[] }>('/api/users').then((d) => d.users),
  save: (payload: UserPayload) =>
    request<{ ok: true; id: AppUser['id']; tempPassword: string | null }>('/api/users', {
      method: 'POST',
      body: payload,
    }),
  resetPassword: (id: AppUser['id']) =>
    request<{ ok: true; tempPassword: string }>('/api/users/reset-password', { method: 'POST', body: { id } }),
  remove: (id: AppUser['id']) => request<{ ok: true }>(`/api/users/${id}`, { method: 'DELETE' }),
};

export const profilesService = {
  list: () => request<{ ok: true; profiles: Profile[]; permissions: Permission[] }>('/api/profiles'),
  save: (payload: ProfilePayload) =>
    request<{ ok: true; id: Profile['id'] }>('/api/profiles', { method: 'POST', body: payload }),
  remove: (id: Profile['id']) => request<{ ok: true }>(`/api/profiles/${id}`, { method: 'DELETE' }),
};
