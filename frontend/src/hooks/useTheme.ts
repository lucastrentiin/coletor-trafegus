import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemeMode = 'sistema' | 'light' | 'dark';

// Mesma chave usada pela interface anterior, para manter a escolha de cada pessoa.
const STORAGE_KEY = 'trafegus-tema';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'sistema' ? (media().matches ? 'dark' : 'light') : mode;
}

/** Aplica o tema antes da primeira pintura para evitar clarão. */
export function applyTheme(mode: ThemeMode = readMode()) {
  document.documentElement.dataset.theme = resolveTheme(mode);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useTheme() {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'sistema' as ThemeMode);

  useEffect(() => {
    applyTheme(mode);
    if (mode !== 'sistema') return;
    const query = media();
    const onChange = () => applyTheme('sistema');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preferência opcional */
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { mode, resolved: resolveTheme(mode), setMode };
}
