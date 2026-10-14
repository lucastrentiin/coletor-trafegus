import { useState } from 'react';
import { AlertTriangle, ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/feedback';
import { Table, TableContainer, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { cleanError, formatShortMoment, plural } from '@/lib/format';
import { saveBlob } from '@/services/http';
import type { CellValue, CustomQueryOutput, CustomQueryResult } from '@/types/api';

const MAX_ROWS_RENDERED = 500;

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const NUMERIC = /^-?\d+(\.\d+)?$/;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

/** Valor bruto, usado no CSV (sem perder precisão nem fuso). */
function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Valor para a tela: datas do PostgreSQL chegam em ISO UTC; meia-noite local
 * vira só a data. Contagens (bigint) chegam como texto e são formatadas como número.
 */
const IDENTIFIER_COLUMN = /(codigo|^id$|_id$|cnpj|cpf|numero|placa|telefone|cep)/i;

function cellDisplay(value: CellValue | undefined, column: string): { text: string; numeric: boolean } {
  const raw = cellText(value);
  if (typeof value === 'number' || NUMERIC.test(raw)) {
    // Códigos e documentos ficam como vieram; quantidades ganham separador de milhar.
    const keepRaw = IDENTIFIER_COLUMN.test(column) || /^-?0\d/.test(raw) || !Number.isSafeInteger(Math.trunc(Number(raw)));
    return { text: keepRaw ? raw : Number(raw).toLocaleString('pt-BR'), numeric: true };
  }
  if (ISO_DATETIME.test(raw)) {
    const date = new Date(raw);
    const midnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
    return { text: (midnight ? dateFormat : dateTimeFormat).format(date), numeric: false };
  }
  return { text: raw, numeric: false };
}

/** CSV com ";" e BOM para abrir direto no Excel em português. Protege contra fórmulas injetadas. */
function toCsv(output: CustomQueryOutput): string {
  const escape = (text: string) => {
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [output.columns.map(escape).join(';'), ...output.rows.map((row) => output.columns.map((c) => escape(cellText(row[c]))).join(';'))];
  return '﻿' + lines.join('\r\n');
}

function OutputTable({ output }: { output: CustomQueryOutput }) {
  const [open, setOpen] = useState(true);
  const title = output.clientName || output.source;
  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 items-center gap-2 text-left">
          <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-transform', !open && '-rotate-90')} />
          <span className="truncate text-sm font-semibold text-ink">{title}</span>
          <span className="shrink-0 text-xs text-ink-3">{plural(output.rows.length, 'linha', 'linhas')}</span>
        </button>
        {output.rows.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-3.5" />}
            onClick={() => saveBlob(new Blob([toCsv(output)], { type: 'text/csv;charset=utf-8' }), `${output.query || 'busca'}-${title}.csv`.replace(/[^\w.-]+/g, '_'))}
          >
            CSV
          </Button>
        )}
      </header>
      {open &&
        (output.rows.length ? (
          <TableContainer className="max-h-[60vh] overflow-y-auto border-t border-line">
            <Table>
              <thead>
                <tr>
                  {output.columns.map((column) => (
                    <Th key={column} className="font-mono">
                      {column}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {output.rows.slice(0, MAX_ROWS_RENDERED).map((row, index) => (
                  <Tr key={index}>
                    {output.columns.map((column) => {
                      const { text, numeric } = cellDisplay(row[column], column);
                      return (
                        <Td key={column} className={cn('max-w-80 truncate', !text && 'text-ink-3', numeric && 'text-right tabular')} title={cellText(row[column])}>
                          {text || '—'}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </tbody>
            </Table>
            {output.rows.length > MAX_ROWS_RENDERED && (
              <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
                Mostrando {MAX_ROWS_RENDERED} de {output.rows.length} linhas. Baixe o CSV para ver tudo.
              </p>
            )}
          </TableContainer>
        ) : (
          <p className="border-t border-line px-4 py-6 text-center text-sm text-ink-3">A consulta não retornou registros.</p>
        ))}
    </section>
  );
}

export function CustomResults({ data, name, ranAt }: { data: CustomQueryResult; name: string; ranAt: number }) {
  const outputs = data.results.filter((r) => r.ok !== false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-md font-semibold text-ink">{name}</h2>
          <p className="text-xs text-ink-3">Busca personalizada executada às {formatShortMoment(ranAt)}</p>
        </div>
      </div>
      {data.errors.length > 0 && (
        <Callout tone="warning" title={plural(data.errors.length, 'origem falhou', 'origens falharam')}>
          <ul className="mt-1 space-y-0.5">
            {data.errors.map((e) => (
              <li key={e.name} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                <span>
                  <b className="font-medium text-ink">{e.name}:</b> {cleanError(e.error)}
                </span>
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {outputs.map((output, index) => (
        <OutputTable key={`${output.clientId ?? output.source}-${index}`} output={output} />
      ))}
    </div>
  );
}
