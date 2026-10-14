import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm';
import { keys } from '@/hooks/useData';
import { cleanError } from '@/lib/format';
import { clientsService, payloadFromClient } from '@/services/clients';
import type { Client } from '@/types/api';

/**
 * Ações sobre um cliente já cadastrado, compartilhadas entre Painel e Clientes.
 * Habilitar sempre testa a conexão antes; se o teste falhar, o cliente
 * continua desabilitado e o motivo aparece na tela.
 */
export function useClientActions() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.clients }),
      queryClient.invalidateQueries({ queryKey: keys.dashboard }),
      queryClient.invalidateQueries({ queryKey: keys.groups }),
    ]);
  }, [queryClient]);

  const setEnabled = useCallback(
    async (client: Client, enabled: boolean) => {
      setPendingId(String(client.id));
      const pending = enabled ? toast.loading(`Testando conexão com ${client.name}…`) : undefined;
      try {
        if (enabled) await clientsService.test(payloadFromClient(client));
        await clientsService.save(payloadFromClient(client, { enabled }));
        toast.success(enabled ? `${client.name} habilitado` : `${client.name} desabilitado`, {
          id: pending,
          description: enabled ? 'Conexão testada com sucesso.' : 'Não entra mais nas consultas até ser reativado.',
        });
      } catch (error) {
        toast.error(enabled ? `Não foi possível habilitar ${client.name}` : 'Não foi possível desabilitar', {
          id: pending,
          description: cleanError((error as Error).message),
        });
      } finally {
        setPendingId(null);
        await refresh();
      }
    },
    [refresh],
  );

  const test = useCallback(async (client: Client) => {
    setPendingId(String(client.id));
    const pending = toast.loading(`Testando conexão com ${client.name}…`);
    try {
      const result = await clientsService.test(payloadFromClient(client));
      toast.success(result.message || 'Conexão realizada com sucesso.', { id: pending });
    } catch (error) {
      toast.error(`Falha ao conectar em ${client.name}`, { id: pending, description: cleanError((error as Error).message) });
    } finally {
      setPendingId(null);
      await refresh();
    }
  }, [refresh]);

  const remove = useCallback(
    async (client: Client) => {
      const ok = await confirm({
        title: `Excluir ${client.name}?`,
        description: 'O cadastro e as credenciais próprias deste cliente são apagados. Consultas e exportações já feitas não são afetadas.',
        confirmLabel: 'Excluir cliente',
        destructive: true,
      });
      if (!ok) return false;
      try {
        await clientsService.remove(client.id);
        toast.success(`${client.name} excluído`);
        await refresh();
        return true;
      } catch (error) {
        toast.error('Não foi possível excluir', { description: (error as Error).message });
        return false;
      }
    },
    [confirm, refresh],
  );

  return { setEnabled, test, remove, pendingId, refresh };
}
