import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { readPreference, writePreference } from '@/lib/storage';

/** useState que lembra o valor no navegador (filtros, abas, colunas). */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readPreference(key, initial));
  useEffect(() => {
    writePreference(key, value);
  }, [key, value]);
  return [value, setValue];
}
