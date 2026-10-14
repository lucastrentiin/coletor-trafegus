import { useQuery } from '@tanstack/react-query';
import { request } from './http';

export type VpnState = 'LIGADA' | 'DESLIGADA' | 'DEGRADADA' | 'ERRO' | string;
export interface Vpn {
  nome: string;
  tun: string | null;
  status: VpnState;
  pid: number | null;
  ip: string | null;
  /** Vigia religa sozinho quando cair. */
  manter?: boolean;
  /** VPN que precisa estar ligada antes desta. */
  depende?: string | null;
  /** VPNs que dependem desta. */
  dependentes?: string[];
  vigia?: { falhas: number; evento: string | null; proxima: string | null };
}
export type VpnAcao = 'up' | 'down' | 'restart';

export interface VpnAcaoResult {
  ok: true;
  output: string;
  vpn: Vpn | null;
  ligouAntes?: string[];
  manterDesativado?: boolean;
}

export const vpnService = {
  list: () => request<{ ok: true; vpns: Vpn[] }>('/api/vpns').then((d) => d.vpns),
  action: (nome: string, acao: VpnAcao) =>
    request<VpnAcaoResult>(`/api/vpns/${encodeURIComponent(nome)}/${acao}`, { method: 'POST' }),
  config: (nome: string, body: { manter?: boolean; depende?: string | null }) =>
    request<{ ok: true }>(`/api/vpns/${encodeURIComponent(nome)}/config`, { method: 'PUT', body }),
  log: (nome: string) => request<{ ok: true; log: string }>(`/api/vpns/${encodeURIComponent(nome)}/log`).then((d) => d.log),
};

export const vpnKey = ['vpns'] as const;

/** Mesmo cache para a tela VPNs e o card flutuante. */
export const useVpns = (enabled = true) =>
  useQuery({ queryKey: vpnKey, queryFn: vpnService.list, refetchInterval: 15_000, enabled });

export const vpnTone = (s: VpnState) =>
  s === 'LIGADA' ? 'positive' : s === 'DESLIGADA' ? 'neutral' : s === 'DEGRADADA' ? 'warning' : 'negative';
