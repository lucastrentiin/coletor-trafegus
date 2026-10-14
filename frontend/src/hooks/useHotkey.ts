import { useEffect, useRef } from 'react';

interface HotkeyOptions {
  /** Dispara mesmo com foco em campo de texto (ex.: Ctrl+Enter). */
  allowInInputs?: boolean;
  enabled?: boolean;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Atalho de teclado global. Combinação no formato "mod+enter", "/", "g c".
 * "mod" é Ctrl no Windows/Linux e Cmd no macOS.
 */
export function useHotkey(combo: string, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}) {
  const { allowInInputs = false, enabled = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop();
    const needsMod = parts.includes('mod');
    const needsShift = parts.includes('shift');

    const onKeyDown = (event: KeyboardEvent) => {
      if (!allowInInputs && isTyping(event.target)) return;
      if (event.key.toLowerCase() !== key) return;
      if (needsMod !== (event.ctrlKey || event.metaKey)) return;
      if (needsShift !== event.shiftKey) return;
      event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combo, allowInInputs, enabled]);
}
