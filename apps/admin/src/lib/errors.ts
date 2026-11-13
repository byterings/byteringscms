import { ApiRequestError } from './api-client';

/** Human-readable message for any error thrown by the API client. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

/**
 * Maps API validation details (`[{ path: 'data.price', message }]`) to a
 * `{ price: message }` object for form fields.
 */
export function fieldErrors(error: unknown, prefix = ''): Record<string, string> {
  if (!(error instanceof ApiRequestError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const detail of error.details as { path?: unknown; message?: unknown }[]) {
    if (typeof detail?.path !== 'string' || typeof detail.message !== 'string') continue;
    const key =
      prefix && detail.path.startsWith(prefix) ? detail.path.slice(prefix.length) : detail.path;
    out[key] ??= detail.message;
  }
  return out;
}
