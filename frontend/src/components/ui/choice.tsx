import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

export function Checkbox({ checked, onCheckedChange, label, description, disabled, id, className, ...rest }: CheckboxProps) {
  const labelId = useId();
  const descriptionId = useId();
  const box = (
    <CheckboxPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      aria-label={rest['aria-label']}
      aria-labelledby={label ? labelId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border border-line-strong bg-surface transition-colors',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-ink',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-ink',
        'disabled:opacity-50',
      )}
    >
      <CheckboxPrimitive.Indicator>
        {checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
  if (!label) return box;
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm', disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="pt-0.5">{box}</span>
      <span className="min-w-0">
        <span id={labelId} className="text-ink">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block text-xs text-ink-3">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <label className={cn('flex cursor-pointer items-start justify-between gap-4', disabled && 'cursor-not-allowed opacity-60', className)}>
      <span className="min-w-0">
        <span id={labelId} className="text-sm text-ink">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="mt-0.5 block text-xs text-ink-3">
            {description}
          </span>
        )}
      </span>
      <SwitchPrimitive.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border border-transparent bg-line-strong transition-colors data-[state=checked]:bg-positive"
      >
        <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
    </label>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
}

interface RadioCardsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: RadioOption<T>[];
  label: string;
  columns?: 1 | 2 | 3;
}

/** Opções mutuamente exclusivas mostradas como cartões selecionáveis. */
export function RadioCards<T extends string>({ value, onValueChange, options, label, columns = 2 }: RadioCardsProps<T>) {
  return (
    <RadioPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      aria-label={label}
      className={cn('grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}
    >
      {options.map((option) => (
        <RadioPrimitive.Item
          key={option.value}
          value={option.value}
          className={cn(
            'group flex items-start gap-2.5 rounded-md border border-line-strong bg-surface p-3 text-left transition-colors hover:bg-hover',
            'data-[state=checked]:border-ink data-[state=checked]:bg-subtle',
          )}
        >
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-line-strong group-data-[state=checked]:border-ink">
            <RadioPrimitive.Indicator className="size-2 rounded-full bg-ink" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">{option.label}</span>
            {option.description && <span className="mt-0.5 block text-xs text-ink-3">{option.description}</span>}
          </span>
        </RadioPrimitive.Item>
      ))}
    </RadioPrimitive.Root>
  );
}
