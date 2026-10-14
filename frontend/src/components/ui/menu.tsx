import { DropdownMenu as MenuPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const panel = 'z-50 rounded-md border border-line bg-surface shadow-pop data-[state=open]:animate-[pop-in_110ms_ease-out]';

export interface MenuAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

interface MenuProps {
  trigger: ReactNode;
  items: (MenuAction | 'separator')[];
  align?: 'start' | 'end';
  label?: ReactNode;
}

/** Menu de ações (três pontos, avatar). Itens desabilitados continuam visíveis. */
export function Menu({ trigger, items, align = 'end', label }: MenuProps) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>{trigger}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content align={align} sideOffset={4} className={cn(panel, 'min-w-48 p-1')}>
          {label && <MenuPrimitive.Label className="px-2 py-1.5 text-xs text-ink-3">{label}</MenuPrimitive.Label>}
          {items.map((item, index) =>
            item === 'separator' ? (
              <MenuPrimitive.Separator key={`sep-${index}`} className="my-1 h-px bg-line" />
            ) : (
              <MenuPrimitive.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  'flex h-8 cursor-default items-center gap-2 rounded px-2 text-sm outline-none select-none',
                  'data-[highlighted]:bg-hover data-[disabled]:opacity-40',
                  item.destructive ? 'text-negative' : 'text-ink',
                )}
              >
                {item.icon && <span className="flex size-4 items-center justify-center [&>svg]:size-4">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <kbd className="text-2xs text-ink-3">{item.shortcut}</kbd>}
              </MenuPrimitive.Item>
            ),
          )}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-xs rounded-md bg-ink px-2.5 py-1.5 text-xs leading-relaxed text-canvas shadow-pop data-[state=delayed-open]:animate-[fade-in_100ms_ease-out]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

interface PopoverProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Popover({ open, onOpenChange, trigger, children, align = 'start', className }: PopoverProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content align={align} sideOffset={4} collisionPadding={8} className={cn(panel, 'focus:outline-none', className)}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
