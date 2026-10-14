import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Impede fechar por Esc/clique fora (ex.: troca de senha obrigatória). */
  locked?: boolean;
}

const overlay =
  'fixed inset-0 z-40 bg-overlay data-[state=open]:animate-[fade-in_120ms_ease-out] data-[state=closed]:animate-[fade-out_100ms_ease-in]';

function preventWhenLocked(locked?: boolean) {
  return locked ? (event: Event) => event.preventDefault() : undefined;
}

/** Diálogo centralizado para decisões e formulários curtos. */
export function Dialog({ open, onOpenChange, title, description, children, footer, locked, size = 'md' }: BaseProps & { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={locked ? undefined : onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          onEscapeKeyDown={preventWhenLocked(locked)}
          onPointerDownOutside={preventWhenLocked(locked)}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-lg border border-line bg-surface shadow-pop focus:outline-none',
            'data-[state=open]:animate-[dialog-in_140ms_ease-out]',
            size === 'sm' && 'max-w-md',
            size === 'md' && 'max-w-xl',
            size === 'lg' && 'max-w-4xl',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-md font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-ink-2">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            {!locked && (
              <DialogPrimitive.Close className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" aria-label="Fechar">
                <X className="size-4" />
              </DialogPrimitive.Close>
            )}
          </header>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>}
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Painel lateral para formulários longos: mantém a lista visível por trás. */
export function Sheet({ open, onOpenChange, title, description, children, footer, width = 'md' }: BaseProps & { width?: 'md' | 'lg' }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-pop focus:outline-none',
            'data-[state=open]:animate-[sheet-in_180ms_cubic-bezier(0.2,0.8,0.2,1)]',
            width === 'md' ? 'sm:max-w-lg' : 'sm:max-w-2xl',
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-md font-semibold text-ink">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-ink-2">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink" aria-label="Fechar">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-subtle px-5 py-3">{footer}</footer>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
