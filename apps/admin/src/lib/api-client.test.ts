import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './api-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient', () => {
  it('returns parsed JSON for successful requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: { ok: true } }));
    const client = new ApiClient('/api/v1', fetchImpl);
    await expect(client.request('/health')).resolves.toEqual({ data: { ok: true } });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('throws ApiRequestError with the API error code', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(422, { error: { code: 'VALIDATION_FAILED', message: 'bad' } }),
      );
    const client = new ApiClient('/api/v1', fetchImpl);
    await expect(client.request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
    });
    await expect(client.request('/x')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('sends the CSRF token only on state-changing requests', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, {})));
    const client = new ApiClient('/api/v1', fetchImpl);
    client.setCsrfToken('tok');
    await client.request('/a');
    await client.request('/b', { method: 'POST', body: { x: 1 } });
    const getHeaders = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const postHeaders = fetchImpl.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(getHeaders['x-csrf-token']).toBeUndefined();
    expect(postHeaders['x-csrf-token']).toBe('tok');
  });

  it('serializes query parameters and skips empty values', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const client = new ApiClient('/api/v1', fetchImpl);
    await client.request('/r', { query: { page: 2, q: '', sort: '-name' } });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/r?page=2&sort=-name');
  });
});
