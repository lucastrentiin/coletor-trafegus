import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

type Tone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'signal';

const tones: Record<Tone, string> = {
  neutral: 'bg-hover text-ink-2',
  positive: 'bg-positive-soft text-positive',
  negative: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  signal: 'bg-signal-soft text-signal-ink',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const dotTones: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  positive: 'bg-positive',
  negative: 'bg-negative',
  warning: 'bg-warning',
  info: 'bg-info',
  signal: 'bg-signal',
};

/** Estado em texto com ponto colorido — lê bem em tabelas densas. */
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-2">
      <span className={cn('size-1.5 rounded-full', dotTones[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-hover', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-line" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-4 py-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-40' : 'w-20', c === columns - 1 && 'ml-auto')} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-ink-3 [&>svg]:size-6">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)} role="alert">
      <AlertTriangle className="mb-3 size-5 text-negative" aria-hidden />
      <p className="text-sm font-medium text-ink">Não foi possível carregar</p>
      <p className="mt-1 max-w-md text-sm text-ink-3">{message}</p>
      {onRetry && (
        <Button className="mt-4" size="sm" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

/** Aviso em linha, dentro do fluxo da página. */
export function Callout({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cn('flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md px-3.5 py-3 text-sm', tones[tone])} role={tone === 'negative' ? 'alert' : 'status'}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div className={cn(title && 'mt-0.5', 'text-ink-2')}>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-subtle px-1 font-mono text-2xs text-ink-2">
      {children}
    </kbd>
  );
}
