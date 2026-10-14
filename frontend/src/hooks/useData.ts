import { useQuery } from '@tanstack/react-query';
import { clientsService } from '@/services/clients';
import { consultaService } from '@/services/consulta';
import { connectionsService, logsService, profilesService, usersService } from '@/services/admin';

/** Chaves centralizadas para invalidar dados relacionados após mutações. */
export const keys = {
  clients: ['clients'] as const,
  groups: ['credential-groups'] as const,
  dashboard: ['dashboard'] as const,
  savedQueries: ['saved-queries'] as const,
  connections: ['external-config'] as const,
  collectionLog: ['logs', 'collection'] as const,
  audit: (limit: number) => ['logs', 'audit', limit] as const,
  mcp: ['logs', 'mcp'] as const,
  logConfig: ['logs', 'config'] as const,
  users: ['users'] as const,
  profiles: ['profiles'] as const,
};

export const useClients = (enabled = true) =>
  useQuery({ queryKey: keys.clients, queryFn: clientsService.list, enabled });

export const useCredentialGroups = (enabled = true) =>
  useQuery({ queryKey: keys.groups, queryFn: clientsService.groups, enabled });

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: clientsService.dashboard, refetchInterval: 60_000 });

export const useSavedQueries = (enabled = true) =>
  useQuery({ queryKey: keys.savedQueries, queryFn: consultaService.savedQueries, enabled });

export const useConnections = (enabled = true) =>
  useQuery({ queryKey: keys.connections, queryFn: connectionsService.get, enabled });

export const useCollectionLog = () => useQuery({ queryKey: keys.collectionLog, queryFn: logsService.collection });

export const useAuditLog = (limit: number, enabled = true) =>
  useQuery({ queryKey: keys.audit(limit), queryFn: () => logsService.audit(limit), enabled });

export const useMcpLog = (enabled = true) => useQuery({ queryKey: keys.mcp, queryFn: () => logsService.mcp(100), enabled });

export const useLogConfig = (enabled = true) => useQuery({ queryKey: keys.logConfig, queryFn: logsService.config, enabled });

export const useUsers = (enabled = true) => useQuery({ queryKey: keys.users, queryFn: usersService.list, enabled });

export const useProfiles = (enabled = true) => useQuery({ queryKey: keys.profiles, queryFn: profilesService.list, enabled });
