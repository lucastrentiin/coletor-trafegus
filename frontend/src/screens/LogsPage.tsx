import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { RotateCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { TabPanel, Tabs } from '@/components/ui/controls';
import { useAuth } from '@/state/auth';
import { CollectionLogView } from '@/features/logs/CollectionLogView';
import { AuditTable } from '@/features/logs/AuditTable';
import { McpLogTable } from '@/features/logs/McpLogTable';
import { LogConfigPanel } from '@/features/logs/LogConfigPanel';
import { ClearLogsDialog } from '@/features/logs/ClearLogsDialog';

type Tab = 'coleta' | 'auditoria' | 'mcp' | 'eventos';

export function LogsPage() {
  const { authEnabled, can } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [clearing, setClearing] = useState(false);
  const available: Tab[] = authEnabled ? ['coleta', 'auditoria', 'mcp', 'eventos'] : ['coleta', 'eventos'];
  const requested = params.get('aba') as Tab | null;
  const tab: Tab = requested && available.includes(requested) ? requested : 'coleta';
  const labels: Record<Tab, string> = { coleta: 'Coleta', auditoria: 'Auditoria', mcp: 'Consultas via MCP', eventos: 'O que registrar' };

  return (
    <>
      <PageHeader
        title="Logs e auditoria"
        description="Registros das coletas, das ações das pessoas e das consultas feitas por assistentes de IA pelo MCP."
        actions={
          <>
            <Button icon={<RotateCw className="size-3.5" />} onClick={() => void queryClient.invalidateQueries({ queryKey: ['logs'] })}>
              Atualizar
            </Button>
            {can('logs.manage') && (
              <Button variant="danger-ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setClearing(true)}>
                Limpar logs
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-lg border border-line bg-surface">
        <Tabs
          value={tab}
          onValueChange={(next) => setParams(next === 'coleta' ? {} : { aba: next }, { replace: true })}
          tabs={available.map((value) => ({ value, label: labels[value] }))}
          className="[&>[role=tablist]]:px-3"
        >
          <TabPanel value="coleta">
            <CollectionLogView />
          </TabPanel>
          {authEnabled && (
            <TabPanel value="auditoria">
              <AuditTable />
            </TabPanel>
          )}
          {authEnabled && (
            <TabPanel value="mcp">
              <McpLogTable />
            </TabPanel>
          )}
          <TabPanel value="eventos">
            <LogConfigPanel canManage={can('logs.manage')} />
          </TabPanel>
        </Tabs>
      </div>
      <ClearLogsDialog open={clearing} onOpenChange={setClearing} />
    </>
  );
}
