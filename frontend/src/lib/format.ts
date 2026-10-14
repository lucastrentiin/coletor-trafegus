const numberFormat = new Intl.NumberFormat('pt-BR');
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayMonthFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

/** Quantidade de indicador: nulo significa "não coletado" e aparece como travessão. */
export function formatCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? numberFormat.format(n) : String(value);
}

/** 2026-07-14 → 14/07/2026, sem passar por fuso horário. */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormat.format(date);
}

/** Hoje mostra a hora; outros dias mostram "14 de jul." — o suficiente para listas. */
export function formatShortMoment(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Date().toDateString() === date.toDateString()
    ? timeFormat.format(date)
    : dayMonthFormat.format(date).replace('.', '');
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
];

export function formatRelative(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = (date.getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'agora';
}

export function initials(name: string): string {
  const letters = name.match(/\p{L}[\p{L}'-]*/gu) ?? [];
  return (
    letters
      .map((word) => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function plural(count: number, one: string, many: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? one : many}`;
}

/** O backend grava alguns erros já com "Erro: " no começo; evita "Erro: Erro: ...". */
export function cleanError(message: string | null | undefined): string {
  return String(message || '')
    .replace(/^(erro:\s*)+/i, '')
    .trim();
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
