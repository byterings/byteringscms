import type { ApiError } from '@byteringscms/contracts';

/** Error thrown for any non-2xx API response, carrying the stable error code. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Minimal typed client for the platform API. All requests go to the
 * same-origin `/api/v1` proxy; session cookies are sent automatically and
 * the CSRF token is attached to state-changing requests.
 */
export class ApiClient {
  private csrfToken: string | null = null;

  constructor(
    private readonly baseUrl = '/api/v1',
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && this.csrfToken) headers['x-csrf-token'] = this.csrfToken;

    const response = await this.fetchImpl(this.buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });

    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (payload as ApiError | null)?.error;
      throw new ApiRequestError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed with status ${response.status}`,
        error?.details,
      );
    }
    return payload as T;
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const url = `${this.baseUrl}${path}`;
    if (!query) return url;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${url}?${qs}` : url;
  }
}

export const api = new ApiClient();
