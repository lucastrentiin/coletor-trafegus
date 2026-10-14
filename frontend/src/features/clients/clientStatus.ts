import { cleanError } from '@/lib/format';
import type { Client } from '@/types/api';

export type ClientHealth = 'erro' | 'desabilitado' | 'ativo';

export interface ClientState {
  health: ClientHealth;
  label: string;
  tone: 'negative' | 'warning' | 'positive';
  reason: string;
}

/** Erro de conexão pesa mais que desabilitado manual; ambos antes dos ativos. */
export function clientState(client: Client, sessionError?: string): ClientState {
  const error = cleanError(sessionError || client.lastError);
  if (error) return { health: 'erro', label: 'Sem conexão', tone: 'negative', reason: error };
  if (!client.enabled) return { health: 'desabilitado', label: 'Desabilitado', tone: 'warning', reason: 'Desabilitado manualmente.' };
  return { health: 'ativo', label: 'Coletando', tone: 'positive', reason: '' };
}

export const HEALTH_ORDER: Record<ClientHealth, number> = { erro: 0, desabilitado: 1, ativo: 2 };

export function connectionLabel(client: Client): string {
  return client.sshEnabled ? `${client.sshHost || client.host} via SSH` : `${client.host}:${client.port}`;
}
