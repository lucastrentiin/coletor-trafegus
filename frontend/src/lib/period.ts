import type { PeriodPayload, PeriodType } from '@/types/api';

/*
  Regras de período espelham o web/server.js (periodRange):
  - DIA: a data escolhida.
  - SEMANA: a data escolhida é o início e o intervalo termina 7 dias depois, inclusive.
  - MES: do dia 1 ao último dia do mês.
  - PERIODO: início e fim escolhidos, inclusive.
*/

export interface PeriodState {
  type: PeriodType;
  date: string;
  month: string;
  startDate: string;
  endDate: string;
}

export const PERIOD_LABELS: Record<PeriodType, string> = {
  DIA: 'Dia',
  SEMANA: 'Semana',
  MES: 'Mês',
  PERIODO: 'Período',
};

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthEnd(month: string): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1] ?? month} de ${year}`;
}

export function defaultPeriod(): PeriodState {
  const yesterday = addDays(todayIso(), -1);
  return {
    type: 'DIA',
    date: yesterday,
    month: yesterday.slice(0, 7),
    startDate: addDays(yesterday, -6),
    endDate: yesterday,
  };
}

export function isValidIso(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export interface ResolvedRange {
  start: string;
  endInclusive: string;
}

/** Intervalo resolvido para prévia; null quando o formulário ainda está incompleto. */
export function resolveRange(p: PeriodState): ResolvedRange | null {
  switch (p.type) {
    case 'MES':
      return /^\d{4}-\d{2}$/.test(p.month) ? { start: `${p.month}-01`, endInclusive: monthEnd(p.month) } : null;
    case 'PERIODO':
      return isValidIso(p.startDate) && isValidIso(p.endDate) ? { start: p.startDate, endInclusive: p.endDate } : null;
    case 'SEMANA':
      return isValidIso(p.date) ? { start: p.date, endInclusive: addDays(p.date, 7) } : null;
    default:
      return isValidIso(p.date) ? { start: p.date, endInclusive: p.date } : null;
  }
}

export function periodError(p: PeriodState): string | null {
  const range = resolveRange(p);
  if (!range) return 'Informe uma data válida.';
  if (p.type === 'PERIODO' && p.endDate < p.startDate) return 'A data final não pode ser anterior à inicial.';
  return null;
}

export function toPayload(p: PeriodState): PeriodPayload {
  switch (p.type) {
    case 'MES':
      return { period: 'MES', month: p.month };
    case 'PERIODO':
      return { period: 'PERIODO', startDate: p.startDate, endDate: p.endDate };
    default:
      return { period: p.type, date: p.date };
  }
}

export function daysBetween(start: string, endInclusive: string): number {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${endInclusive}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}
