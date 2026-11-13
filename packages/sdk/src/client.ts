import type {
  ApiError,
  ConfigDocument,
  ConfigPlan,
  CreateEntityRequest,
  EntityDefinition,
  FilterOperator,
  PageMeta,
  RecordItem,
  Tenant,
  UpdateEntityRequest,
} from '@byteringscms/contracts';

export interface ClientOptions {
  /** API origin, e.g. https://cms.example.com (the /api/v1 prefix is added). */
  baseUrl: string;
  /** Tenant API key (Authorization: Bearer). */
  apiKey?: string;
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

/** Error returned by the API, carrying its stable error code. */
export class PlatformError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export type TypedRecord<T> = Omit<RecordItem, 'data'> & { data: T };

export type FilterValue = string | number | boolean | Array<string | number>;
export type Filter = Record<string, FilterValue | Partial<Record<FilterOperator, FilterValue>>>;

export interface ListOptions {
  page?: number;
  pageSize?: number;
  /** e.g. ['-price', 'name'] */
  sort?: string[];
  fields?: string[];
  search?: string;
  expand?: string[];
  filter?: Filter;
  deleted?: boolean;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

type Query = Record<string, string | undefined>;

function filterValue(value: FilterValue): string {
  return Array.isArray(value) ? value.join(',') : String(value);
}

/** Serializes list options to the API's query syntax. */
export function listQuery(options: ListOptions = {}): Query {
  const query: Query = {
    page: options.page?.toString(),
    pageSize: options.pageSize?.toString(),
    sort: options.sort?.join(','),
    fields: options.fields?.join(','),
    search: options.search,
    expand: options.expand?.join(','),
    deleted: options.deleted ? 'true' : undefined,
  };
  for (const [key, spec] of Object.entries(options.filter ?? {})) {
    if (typeof spec === 'object' && !Array.isArray(spec)) {
      for (const [op, value] of Object.entries(spec)) {
        if (value !== undefined) query[`filter[${key}][${op}]`] = filterValue(value);
      }
    } else {
      query[`filter[${key}]`] = filterValue(spec);
    }
  }
  return query;
}

export class PlatformClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ClientOptions) {
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/api/v1`;
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  async request<T>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
    const headers: Record<string, string> = { accept: 'application/json', ...this.options.headers };
    if (this.options.apiKey) headers.authorization = `Bearer ${this.options.apiKey}`;
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (error) {
      throw new PlatformError(
        0,
        'NETWORK_ERROR',
        `Cannot reach the API at ${url.origin} (${error instanceof Error ? error.message : 'network error'})`,
      );
    }
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (payload as ApiError | null)?.error;
      throw new PlatformError(
        response.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `Request failed with status ${response.status}`,
        error?.details,
      );
    }
    return payload as T;
  }

  /** Current tenant. */
  async tenant(): Promise<Tenant> {
    return (await this.request<{ data: Tenant }>('GET', '/tenant')).data;
  }

  /** Entity (metadata) management. */
  readonly entities = {
    list: async (): Promise<EntityDefinition[]> =>
      (await this.request<{ data: EntityDefinition[] }>('GET', '/admin/entities')).data,
    get: async (id: string): Promise<EntityDefinition> =>
      (await this.request<{ data: EntityDefinition }>('GET', `/admin/entities/${id}`)).data,
    create: async (input: CreateEntityRequest): Promise<EntityDefinition> =>
      (await this.request<{ data: EntityDefinition }>('POST', '/admin/entities', { body: input }))
        .data,
    update: async (id: string, input: UpdateEntityRequest): Promise<EntityDefinition> =>
      (
        await this.request<{ data: EntityDefinition }>('PATCH', `/admin/entities/${id}`, {
          body: input,
        })
      ).data,
    remove: async (id: string): Promise<void> => this.request('DELETE', `/admin/entities/${id}`),
  };

  /** Configuration as code. */
  readonly config = {
    export: async (): Promise<ConfigDocument> =>
      (await this.request<{ data: ConfigDocument }>('GET', '/admin/config/export')).data,
    diff: async (document: ConfigDocument, opts: { prune?: boolean } = {}): Promise<ConfigPlan> =>
      (
        await this.request<{ data: ConfigPlan }>('POST', '/admin/config/diff', {
          body: document,
          query: { prune: opts.prune ? 'true' : undefined },
        })
      ).data,
    apply: async (
      document: ConfigDocument,
      opts: { prune?: boolean; confirmDestructive?: boolean } = {},
    ): Promise<ConfigPlan> =>
      (
        await this.request<{ data: ConfigPlan }>('POST', '/admin/config/apply', {
          body: {
            ...document,
            prune: opts.prune ?? false,
            confirmDestructive: opts.confirmDestructive ?? false,
          },
        })
      ).data,
  };

  /** OpenAPI documents. */
  readonly openapi = {
    platform: (): Promise<Record<string, unknown>> => this.request('GET', '/openapi.json'),
    tenant: (): Promise<Record<string, unknown>> => this.request('GET', '/openapi/tenant.json'),
  };

  /** Records of one entity. Pass a type for typed `data`. */
  records<T extends Record<string, unknown> = Record<string, unknown>>(entityKey: string) {
    const base = `/entities/${encodeURIComponent(entityKey)}/records`;
    return {
      list: (options: ListOptions = {}): Promise<Page<TypedRecord<T>>> =>
        this.request('GET', base, { query: listQuery(options) }),
      get: async (
        id: string,
        opts: { fields?: string[]; expand?: string[] } = {},
      ): Promise<TypedRecord<T>> =>
        (
          await this.request<{ data: TypedRecord<T> }>('GET', `${base}/${id}`, {
            query: { fields: opts.fields?.join(','), expand: opts.expand?.join(',') },
          })
        ).data,
      create: async (data: Partial<T>): Promise<TypedRecord<T>> =>
        (await this.request<{ data: TypedRecord<T> }>('POST', base, { body: { data } })).data,
      update: async (
        id: string,
        data: Partial<T>,
        opts: { version?: number } = {},
      ): Promise<TypedRecord<T>> =>
        (
          await this.request<{ data: TypedRecord<T> }>('PATCH', `${base}/${id}`, {
            body: { data, ...(opts.version !== undefined ? { version: opts.version } : {}) },
          })
        ).data,
      delete: (id: string): Promise<void> => this.request('DELETE', `${base}/${id}`),
      restore: async (id: string): Promise<TypedRecord<T>> =>
        (await this.request<{ data: TypedRecord<T> }>('POST', `${base}/${id}/restore`)).data,
    };
  }

  /** Async iterator over all matching records of an entity. */
  async *iterate<T extends Record<string, unknown> = Record<string, unknown>>(
    entityKey: string,
    options: Omit<ListOptions, 'page'> = {},
  ): AsyncGenerator<TypedRecord<T>> {
    const pageSize = options.pageSize ?? 100;
    for (let page = 1; ; page++) {
      const result = await this.records<T>(entityKey).list({ ...options, page, pageSize });
      yield* result.data;
      if (page >= result.meta.totalPages) return;
    }
  }
}

export function createClient(options: ClientOptions): PlatformClient {
  return new PlatformClient(options);
}
