export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Não redireciona para o login em 401 (usado ao checar a sessão). */
  allowUnauthorized?: boolean;
  signal?: AbortSignal;
}

function redirectToLogin() {
  window.location.assign('/login.html');
}

export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, allowUnauthorized = false, signal } = options;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }

  if (response.status === 401 && !allowUnauthorized) {
    redirectToLogin();
    throw new ApiError(401, 'Sessão expirada. Redirecionando para o login…');
  }

  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new ApiError(response.status, data.error || `O servidor respondeu com erro ${response.status}.`);
  }
  return data as T;
}

export interface DownloadResult {
  blob: Blob;
  filename: string;
  headers: Headers;
}

/** POST que devolve arquivo (exportação Excel). */
export async function download(url: string, body: unknown, fallbackName: string): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique a rede e tente novamente.');
  }
  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'Sessão expirada.');
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, data.error || `O servidor respondeu com erro ${response.status}.`);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  return { blob: await response.blob(), filename: match?.[1] ?? fallbackName, headers: response.headers };
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
