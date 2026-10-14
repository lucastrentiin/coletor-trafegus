import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Power, PowerOff, RefreshCw, RotateCw, ScrollText } from 'lucide-react';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Callout, ErrorState, Skeleton, Status } from '@/components/ui/feedback';
import { Switch } from '@/components/ui/choice';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/state/auth';
import { useVpns, vpnKey, vpnService, vpnTone as toneOf, type Vpn, type VpnAcao as Acao } from '@/services/vpns';

const verbo: Record<Acao, string> = { up: 'ligar', down: 'desligar', restart: 'reiniciar' };
const feito: Record<Acao, string> = { up: 'ligada', down: 'desligada', restart: 'reiniciada' };

export function VpnsPage() {
  const { can } = useAuth();
  const canManage = can('connections.manage');
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [logOf, setLogOf] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useVpns();

  const logQuery = useQuery({
    queryKey: ['vpns', 'log', logOf],
    queryFn: () => vpnService.log(logOf as string),
    enabled: !!logOf,
  });

  const mutation = useMutation({
    mutationFn: ({ nome, acao }: { nome: string; acao: Acao }) => vpnService.action(nome, acao),
    onMutate: ({ nome }) => setBusy(nome),
    onSuccess: (r, { nome, acao }) => {
      const extras: string[] = [];
      if (r.ligouAntes?.length) extras.push(`Antes foi ligada: ${r.ligouAntes.join(', ')}.`);
      if (r.manterDesativado) extras.push('"Manter ligada" foi desativado para ela não religar sozinha.');
      toast.success(`VPN ${nome} ${feito[acao]}`, extras.length ? { description: extras.join(' ') } : undefined);
    },
    onError: (e, { nome, acao }) => toast.error(`Não foi possível ${verbo[acao]} a VPN ${nome}`, { description: (e as Error).message }),
    onSettled: () => {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: vpnKey });
    },
  });

  const manterMutation = useMutation({
    mutationFn: ({ nome, manter }: { nome: string; manter: boolean }) => vpnService.config(nome, { manter }),
    onSuccess: (_r, { nome, manter }) =>
      toast.success(manter ? `VPN ${nome} será mantida ligada` : `VPN ${nome} não será mais religada sozinha`),
    onError: (e) => toast.error('Não foi possível salvar', { description: (e as Error).message }),
    onSettled: () => void qc.invalidateQueries({ queryKey: vpnKey }),
  });

  async function run(v: Vpn, acao: Acao) {
    if (acao !== 'up') {
      const ligadosDependentes = (v.dependentes ?? []).filter((d) => data?.find((x) => x.nome === d)?.status === 'LIGADA');
      const partes = ['As coletas e consultas dos clientes que usam essa VPN vão falhar enquanto ela estiver fora.'];
      if (ligadosDependentes.length) partes.push(`Também depende dela: ${ligadosDependentes.join(', ')}.`);
      if (acao === 'down' && v.manter) partes.push('O "manter ligada" dela será desativado.');
      const ok = await confirm({
        title: `${acao === 'down' ? 'Desligar' : 'Reiniciar'} a VPN ${v.nome}?`,
        description: partes.join(' '),
        confirmLabel: acao === 'down' ? 'Desligar' : 'Reiniciar',
        destructive: acao === 'down',
      });
      if (!ok) return;
    }
    mutation.mutate({ nome: v.nome, acao });
  }

  const ligadas = data?.filter((v) => v.status === 'LIGADA').length ?? 0;

  return (
    <>
      <PageHeader
        title="VPNs"
        description='Perfis OpenVPN do servidor. Com "Manter ligada", o servidor religa a VPN sozinho quando ela cair (confere a cada minuto).'
        actions={
          <Button icon={<RefreshCw />} loading={isFetching && !isLoading} onClick={() => void refetch()}>
            Atualizar
          </Button>
        }
      />
      {!canManage && (
        <div className="mb-4">
          <Callout tone="info">Você pode ver as VPNs, mas só quem tem a permissão "Gerenciar conexões" pode ligar, desligar ou mudar o "manter ligada".</Callout>
        </div>
      )}
      {isLoading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : isError || !data ? (
        <ErrorState message={(error as Error)?.message ?? 'Sem dados.'} onRetry={() => void refetch()} className="rounded-lg border border-line bg-surface" />
      ) : (
        <Panel title={`${ligadas} de ${data.length} ligadas`}>
          <TableContainer>
            <Table>
              <thead>
                <Tr>
                  <Th>VPN</Th>
                  <Th>Status</Th>
                  <Th>Manter ligada</Th>
                  <Th>Interface</Th>
                  <Th>IP</Th>
                  <Th className="text-right">Ações</Th>
                </Tr>
              </thead>
              <tbody>
                {data.map((v) => {
                  const on = v.status === 'LIGADA' || v.status === 'DEGRADADA';
                  const working = busy === v.nome;
                  const disabled = !canManage || busy !== null;
                  const evento = v.vigia?.evento;
                  return (
                    <Tr key={v.nome}>
                      <Td>
                        <span className="block font-medium text-ink">{v.nome}</span>
                        {v.depende && <span className="block text-2xs text-ink-3">depende de {v.depende}</span>}
                      </Td>
                      <Td>
                        <Status tone={toneOf(v.status)}>{working ? 'Processando…' : v.status}</Status>
                        {evento && (
                          <span className={`mt-0.5 block text-2xs ${v.vigia?.falhas ? 'text-warning' : 'text-ink-3'}`}>{evento}</span>
                        )}
                      </Td>
                      <Td>
                        <Switch
                          checked={!!v.manter}
                          onCheckedChange={(manter) => manterMutation.mutate({ nome: v.nome, manter })}
                          disabled={!canManage || manterMutation.isPending}
                          label={<span className="text-xs text-ink-2">{v.manter ? 'Sim' : 'Não'}</span>}
                          className="w-24"
                        />
                      </Td>
                      <Td className="font-mono text-xs">{v.tun ?? '—'}</Td>
                      <Td className="font-mono text-xs">{v.ip ?? '—'}</Td>
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          {on ? (
                            <Button size="sm" variant="danger-ghost" icon={<PowerOff />} loading={working && mutation.variables?.acao === 'down'} disabled={disabled} onClick={() => void run(v, 'down')}>
                              Desligar
                            </Button>
                          ) : (
                            <Button size="sm" variant="primary" icon={<Power />} loading={working && mutation.variables?.acao === 'up'} disabled={disabled} onClick={() => void run(v, 'up')}>
                              Ligar
                            </Button>
                          )}
                          {on && (
                            <Button size="sm" variant="ghost" icon={<RotateCw />} loading={working && mutation.variables?.acao === 'restart'} disabled={disabled} onClick={() => void run(v, 'restart')}>
                              Reiniciar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" icon={<ScrollText />} onClick={() => setLogOf(v.nome)}>
                            Log
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </TableContainer>
        </Panel>
      )}
      <Dialog open={!!logOf} onOpenChange={(o) => !o && setLogOf(null)} title={`Log da VPN ${logOf ?? ''}`} description="Últimas 60 linhas do openvpn.log" size="lg">
        {logQuery.isLoading ? (
          <Skeleton className="h-64" />
        ) : (
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-hover p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap text-ink-2">
            {logQuery.isError ? (logQuery.error as Error).message : logQuery.data}
          </pre>
        )}
      </Dialog>
    </>
  );
}
