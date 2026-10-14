import { request } from './http';
import type {
  Client,
  ClientPayload,
  CredentialGroup,
  CredentialGroupPayload,
  DashboardSummary,
} from '@/types/api';

export const clientsService = {
  dashboard: () => request<DashboardSummary>('/api/dashboard'),

  list: () => request<{ ok: true; clients: Client[] }>('/api/clients').then((d) => d.clients),

  save: (payload: ClientPayload) =>
    request<{ ok: true; clients: Client[] }>('/api/config/client', { method: 'POST', body: payload }).then(
      (d) => d.clients,
    ),

  test: (payload: ClientPayload) =>
    request<{ ok: true; message: string }>('/api/config/client/test', { method: 'POST', body: payload }),

  remove: (id: Client['id']) => request<{ ok: true }>(`/api/config/client/${id}`, { method: 'DELETE' }),

  groups: () => request<{ ok: true; groups: CredentialGroup[] }>('/api/credentials').then((d) => d.groups),

  saveGroup: (payload: CredentialGroupPayload) =>
    request<{ ok: true }>('/api/config/credentials', { method: 'POST', body: payload }),

  removeGroup: (id: string) =>
    request<{ ok: true }>(`/api/config/credentials/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Monta o corpo esperado pelo backend a partir de um cliente já salvo (habilitar/desabilitar). */
export function payloadFromClient(c: Client, overrides: Partial<ClientPayload> = {}): ClientPayload {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    database: c.database,
    credentialGroup: c.credentialGroup,
    dbUser: c.dbUser,
    attendanceName: c.attendanceName || c.name,
    enabled: c.enabled,
    sshEnabled: c.sshEnabled,
    sshHost: c.sshHost,
    sshPort: c.sshPort,
    sshCredentialGroup: c.sshCredentialGroup,
    sshUser: c.sshUser,
    sshDbHost: c.sshDbHost,
    sshDbPort: c.sshDbPort,
    ...overrides,
  };
}
