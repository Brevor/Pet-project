const TOKEN_KEY = 'studioflow.token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export interface ApiFailure {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof Blob)) {
    headers.set('content-type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api/v1${path}`, { ...init, headers });

  if (response.status === 401) {
    setToken(null);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiFailure;

  if (!response.ok) {
    throw new ApiError(
      data.error?.message ?? `Запрос не выполнен (${response.status})`,
      data.error?.code ?? 'UNKNOWN',
      response.status
    );
  }

  return data;
}
