/*
  Preferências por navegador (tema, última seleção, colunas). Nunca guarda
  dados sensíveis. Qualquer falha de acesso (modo privado, cota) é ignorada
  e a interface segue com o valor padrão.
*/
const PREFIX = 'coletor:';

export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writePreference<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* preferências são opcionais */
  }
}
