import { Link } from 'react-router';
import { Headset } from 'lucide-react';
import { PageHeader, Panel } from '@/components/layout/PageHeader';
import { Callout, EmptyState } from '@/components/ui/feedback';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { formatCount, formatIsoDate } from '@/lib/format';
import { useAuth } from '@/state/auth';
import { useConsulta } from '@/state/consulta';
import { ATTENDANCE_INDICATORS } from '@/features/consulta/indicators';
import type { IndicatorRow } from '@/types/api';

const valueOf = (rows: IndicatorRow[], code: string) => rows.find((r) => r.categoria === 'CHAMADOS' && r.indicador === code);

export function AtendimentosPage() {
  const { result } = useConsulta();
  const { can } = useAuth();

  if (result?.kind !== 'indicators') {
    return (
      <>
        <PageHeader title="Atendimentos" description="Chamados dos clientes no período, vindos do banco de atendimentos." />
        <EmptyState
          icon={<Headset />}
          title="Rode uma consulta primeiro"
          description="Os indicadores de chamados acompanham a última consulta feita nesta sessão."
          action={
            <Link to="/consulta" className="text-sm font-medium text-ink underline underline-offset-4">
              Ir para Consulta
            </Link>
          }
          className="rounded-lg border border-dashed border-line-strong"
        />
      </>
    );
  }

  const { data } = result;
  const unavailable = data.rows.find((r) => r.categoria === 'CHAMADOS' && r.quantidade === null);
  const clients = data.byClient.filter((c) => c.ok || c.rows.some((r) => r.categoria === 'CHAMADOS'));

  return (
    <>
      <PageHeader
        title="Atendimentos"
        description={`Chamados de ${formatIsoDate(data.start)}${data.endInclusive !== data.start ? ` a ${formatIsoDate(data.endInclusive)}` : ''}, da última consulta.`}
      />
      {unavailable && (
        <div className="mb-4">
          <Callout
            tone="warning"
            title="Banco de atendimentos indisponível"
            action={
              can('config.view') && (
                <Link to="/conexoes" className="text-sm font-medium text-ink underline underline-offset-4">
                  Ver conexão
                </Link>
              )
            }
          >
            {unavailable.info || 'Os demais indicadores dos clientes foram consultados normalmente.'}
          </Callout>
        </div>
      )}
      <dl className="mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface lg:grid-cols-4">
        {ATTENDANCE_INDICATORS.map((indicator, index) => (
          <div key={indicator.code} className={cn('border-line px-4 py-3.5', index % 2 === 0 && 'border-r', index < 2 && 'border-b lg:border-b-0', index < 3 && 'lg:border-r')}>
            <dt className="text-xs text-ink-3">{indicator.label}</dt>
            <dd className="mt-1 text-xl font-medium tabular">{formatCount(valueOf(data.rows, indicator.code)?.quantidade)}</dd>
          </div>
        ))}
      </dl>
      <Panel title="Por cliente" description="Cada cliente é identificado pelo nome cadastrado para o banco de atendimentos.">
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                {ATTENDANCE_INDICATORS.map((i) => (
                  <Th key={i.code} className="text-right">
                    {i.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((entry) => (
                <Tr key={entry.client.id}>
                  <Td className="font-medium">{entry.client.name}</Td>
                  {ATTENDANCE_INDICATORS.map((i) => {
                    const value = valueOf(entry.rows, i.code)?.quantidade;
                    return (
                      <Td key={i.code} className={cn('text-right tabular', value == null && 'text-ink-3')}>
                        {formatCount(value)}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      </Panel>
    </>
  );
}
