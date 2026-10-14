import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Um único controle; recebe id, aria-describedby e aria-invalid automaticamente. */
  children: ReactElement<Record<string, unknown>>;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || undefined,
      })
    : children;

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink-2">
        {label}
        {required && (
          <span className="ml-0.5 text-negative" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {error ? (
        <p id={errorId} className="text-xs text-negative">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Agrupa campos de um formulário com título e descrição curta à esquerda (em telas largas). */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('border-t border-line pt-5 first:border-t-0 first:pt-0', className)}>
      <legend className="float-left mb-3 w-full">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-xs font-normal text-ink-3">{description}</span>}
      </legend>
      <div className="clear-both grid gap-3">{children}</div>
    </fieldset>
  );
}
