import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/controls';
import { formatIsoDate } from '@/lib/format';
import { daysBetween, monthLabel, PERIOD_LABELS, periodError, resolveRange, todayIso, type PeriodState } from '@/lib/period';
import type { PeriodType } from '@/types/api';

interface PeriodPickerProps {
  value: PeriodState;
  onChange: (next: PeriodState) => void;
}

const TYPES: PeriodType[] = ['DIA', 'SEMANA', 'MES', 'PERIODO'];

export function PeriodPicker({ value, onChange }: PeriodPickerProps) {
  const set = (patch: Partial<PeriodState>) => onChange({ ...value, ...patch });
  const range = resolveRange(value);
  const error = periodError(value);
  const today = todayIso();

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Segmented
        label="Tipo de período"
        value={value.type}
        onValueChange={(type) => set({ type })}
        options={TYPES.map((type) => ({ value: type, label: PERIOD_LABELS[type] }))}
        className="w-full sm:w-auto"
      />
      <div className="flex flex-wrap items-center gap-2">
        {(value.type === 'DIA' || value.type === 'SEMANA') && (
          <label className="flex items-center gap-2 text-xs text-ink-2">
            {value.type === 'SEMANA' ? 'Início' : 'Data'}
            <Input type="date" value={value.date} max={today} onChange={(e) => set({ date: e.target.value })} className="w-40" />
          </label>
        )}
        {value.type === 'MES' && (
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Mês
            <Input type="month" value={value.month} max={today.slice(0, 7)} onChange={(e) => set({ month: e.target.value })} className="w-44" />
          </label>
        )}
        {value.type === 'PERIODO' && (
          <>
            <label className="flex items-center gap-2 text-xs text-ink-2">
              De
              <Input type="date" value={value.startDate} max={today} onChange={(e) => set({ startDate: e.target.value })} className="w-40" />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-2">
              até
              <Input
                type="date"
                value={value.endDate}
                min={value.startDate}
                max={today}
                onChange={(e) => set({ endDate: e.target.value })}
                className="w-40"
                aria-invalid={Boolean(error) || undefined}
              />
            </label>
          </>
        )}
      </div>
      <p className="text-xs text-ink-3" aria-live="polite">
        {error ? (
          <span className="text-negative">{error}</span>
        ) : range ? (
          <>
            {value.type === 'MES' ? `${monthLabel(value.month)}: ` : ''}
            {formatIsoDate(range.start)}
            {range.start !== range.endInclusive && ` a ${formatIsoDate(range.endInclusive)}`}
            <span className="text-ink-3"> ({daysBetween(range.start, range.endInclusive)} {daysBetween(range.start, range.endInclusive) === 1 ? 'dia' : 'dias'})</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
