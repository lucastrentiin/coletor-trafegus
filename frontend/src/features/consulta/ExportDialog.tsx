import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { RadioCards } from '@/components/ui/choice';
import { usePersistentState } from '@/hooks/usePersistentState';
import { plural } from '@/lib/format';
import type { ExportDetail, ExportMode } from '@/types/api';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientCount: number;
  periodText: string;
  onExport: (mode: ExportMode, detail: ExportDetail) => void;
}

export function ExportDialog({ open, onOpenChange, clientCount, periodText, onExport }: ExportDialogProps) {
  const [mode, setMode] = usePersistentState<ExportMode>('exportar:modo', 'JUNTO');
  const [detail, setDetail] = usePersistentState<ExportDetail>('exportar:detalhe', 'DETALHADA');
  const [submitted, setSubmitted] = useState(false);
  const single = clientCount === 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setSubmitted(false);
        onOpenChange(next);
      }}
      title="Exportar para Excel"
      description={`${plural(clientCount, 'cliente', 'clientes')}, ${periodText}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={<FileSpreadsheet className="size-4" />}
            disabled={submitted}
            onClick={() => {
              setSubmitted(true);
              onExport(single ? 'JUNTO' : mode, detail);
              onOpenChange(false);
            }}
          >
            Exportar planilha
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {!single && (
          <div className="grid gap-2">
            <p className="text-xs font-medium text-ink-2">Organização dos clientes</p>
            <RadioCards
              label="Organização dos clientes"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'JUNTO', label: 'Somados', description: 'Os clientes viram uma única linha de totais, com aba de detalhamento.' },
                { value: 'SEPARADO', label: 'Uma linha por cliente', description: 'Cada cliente na sua linha, numa aba com o nome do período.' },
              ]}
            />
          </div>
        )}
        <div className="grid gap-2">
          <p className="text-xs font-medium text-ink-2">Nível de detalhe</p>
          <RadioCards
            label="Nível de detalhe"
            value={detail}
            onValueChange={setDetail}
            options={[
              { value: 'DETALHADA', label: 'Completa', description: 'Todas as colunas apuradas na coleta.' },
              { value: 'NORMAL', label: 'Principais', description: 'Só as colunas principais de viagens, terminais, eventos, usuários e chamados.' },
            ]}
          />
        </div>
        <p className="text-xs text-ink-3">A coleta roda de novo em todos os clientes. Com muitos clientes, pode levar alguns minutos.</p>
      </div>
    </Dialog>
  );
}
