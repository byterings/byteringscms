/**
 * OpenAPI 3.1 documents generated from the shared Zod contracts (ADR-007).
 *
 * - `API_OPERATIONS` is the single registry of every REST operation. A
 *   contract test in the API fails when a route is missing here.
 * - `buildOpenApiDocument()` renders the platform-wide specification.
 * - `buildTenantOpenApiDocument()` adds typed schemas and paths for one
 *   tenant's entities, derived from their field definitions.
 */
import { z } from 'zod';
import { apiKeySchema, createApiKeyRequestSchema, createdApiKeySchema } from './api-keys';
import { auditEventSchema } from './audit';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  sessionSchema,
  setupRequestSchema,
  setupStatusSchema,
  switchTenantRequestSchema,
} from './auth';
import { apiErrorSchema, healthResponseSchema } from './common';
import { configDocumentSchema, configApplyRequestSchema, configPlanSchema } from './config';
import {
  createEntityRequestSchema,
  entitySchema,
  metadataVersionSchema,
  updateEntityRequestSchema,
  type EntityDefinition,
} from './entities';
import {
  createFieldRequestSchema,
  fieldConfigSchemas,
  reorderFieldsRequestSchema,
  updateFieldRequestSchema,
  type FieldDefinition,
} from './fields';
import { mediaSchema, updateMediaRequestSchema } from './media';
import { addMemberRequestSchema, memberSchema, updateMemberRequestSchema } from './members';
import { installTemplateRequestSchema, templateInfoSchema } from './templates';
import { pageMetaSchema } from './pagination';
import { type Permission } from './permissions';
import { createRecordRequestSchema, recordSchema, updateRecordRequestSchema } from './records';
import {
  createTenantRequestSchema,
  tenantSchema,
  updateTenantRequestSchema,
  updateTenantStatusRequestSchema,
} from './tenants';

type JsonSchema = Record<string, unknown>;
type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export interface QueryParam {
  name: string;
  schema: JsonSchema;
  description?: string;
}

export interface OperationSpec {
  method: HttpMethod;
  /** OpenAPI path relative to /api/v1, e.g. /entities/{entityKey}/records */
  path: string;
  tag: string;
  summary: string;
  /** public: no auth; user: browser session only; any: session or API key */
  auth: 'public' | 'user' | 'any' | 'platformAdmin';
  permission?: Permission;
  query?: QueryParam[];
  body?: z.ZodType;
  /** Response payload schema (already including any envelope). */
  response?: z.ZodType;
  status?: number;
  /** Non-JSON response description (e.g. HTML, files). */
  contentType?: string;
}

const data = <T extends z.ZodType>(schema: T) => z.object({ data: schema });
const page = <T extends z.ZodType>(schema: T) =>
  z.object({ data: z.array(schema), meta: pageMetaSchema });

const pageParams: QueryParam[] = [
  { name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'pageSize', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

const recordListParams: QueryParam[] = [
  ...pageParams,
  {
    name: 'sort',
    schema: { type: 'string' },
    description: 'Comma-separated field keys; prefix "-" for descending, e.g. -price,name',
  },
  {
    name: 'fields',
    schema: { type: 'string' },
    description: 'Comma-separated field keys to return',
  },
  {
    name: 'search',
    schema: { type: 'string' },
    description: 'Case-insensitive match on text fields',
  },
  {
    name: 'expand',
    schema: { type: 'string' },
    description: 'Comma-separated relation fields to expand (depth 1)',
  },
  {
    name: 'filter',
    schema: { type: 'object', additionalProperties: true },
    description:
      'Deep-object filters: filter[field]=value or filter[field][op]=value with op in eq, ne, gt, gte, lt, lte, in, contains, startsWith, isNull',
  },
  {
    name: 'deleted',
    schema: { type: 'string', enum: ['true', 'false'] },
    description: 'Admins: list soft-deleted records',
  },
];

/** Every REST operation of API v1. Keep in sync with the controllers. */
export const API_OPERATIONS: OperationSpec[] = [
  // Health and docs
  {
    method: 'get',
    path: '/health',
    tag: 'System',
    summary: 'Liveness check',
    auth: 'public',
    response: healthResponseSchema,
  },
  {
    method: 'get',
    path: '/health/ready',
    tag: 'System',
    summary: 'Readiness check (database)',
    auth: 'public',
    response: healthResponseSchema,
  },
  {
    method: 'get',
    path: '/openapi.json',
    tag: 'System',
    summary: 'This OpenAPI document',
    auth: 'public',
    contentType: 'application/json',
  },
  {
    method: 'get',
    path: '/openapi/tenant.json',
    tag: 'System',
    summary: 'OpenAPI document including the current tenant’s entities',
    auth: 'any',
    permission: 'metadata:read',
    contentType: 'application/json',
  },
  {
    method: 'get',
    path: '/docs',
    tag: 'System',
    summary: 'Interactive API documentation',
    auth: 'public',
    contentType: 'text/html',
  },

  // Setup and authentication
  {
    method: 'get',
    path: '/setup/status',
    tag: 'Setup',
    summary: 'Whether the installation is initialized',
    auth: 'public',
    response: data(setupStatusSchema),
  },
  {
    method: 'post',
    path: '/setup',
    tag: 'Setup',
    summary: 'First-run setup: create the first tenant and owner',
    auth: 'public',
    body: setupRequestSchema,
    response: data(sessionSchema),
    status: 201,
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Sign in (sets a session cookie)',
    auth: 'public',
    body: loginRequestSchema,
    response: data(sessionSchema),
  },
  {
    method: 'get',
    path: '/auth/session',
    tag: 'Auth',
    summary: 'Current session',
    auth: 'user',
    response: data(sessionSchema),
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'Sign out',
    auth: 'user',
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/switch-tenant',
    tag: 'Auth',
    summary: 'Switch the active tenant',
    auth: 'user',
    body: switchTenantRequestSchema,
    response: data(sessionSchema),
  },
  {
    method: 'post',
    path: '/auth/password',
    tag: 'Auth',
    summary: 'Change own password',
    auth: 'user',
    body: changePasswordRequestSchema,
    status: 204,
  },

  // Tenants
  {
    method: 'get',
    path: '/tenant',
    tag: 'Tenant',
    summary: 'Current tenant',
    auth: 'any',
    permission: 'metadata:read',
    response: data(tenantSchema),
  },
  {
    method: 'patch',
    path: '/tenant',
    tag: 'Tenant',
    summary: 'Rename the current tenant',
    auth: 'any',
    permission: 'tenant:manage',
    body: updateTenantRequestSchema,
    response: data(tenantSchema),
  },
  {
    method: 'get',
    path: '/platform/tenants',
    tag: 'Platform',
    summary: 'List all tenants',
    auth: 'platformAdmin',
    response: data(z.array(tenantSchema)),
  },
  {
    method: 'post',
    path: '/platform/tenants',
    tag: 'Platform',
    summary: 'Provision a tenant and its owner',
    auth: 'platformAdmin',
    body: createTenantRequestSchema,
    response: data(tenantSchema),
    status: 201,
  },
  {
    method: 'patch',
    path: '/platform/tenants/{id}/status',
    tag: 'Platform',
    summary: 'Suspend or reactivate a tenant',
    auth: 'platformAdmin',
    body: updateTenantStatusRequestSchema,
    response: data(tenantSchema),
  },

  // Members, API keys, audit
  {
    method: 'get',
    path: '/admin/members',
    tag: 'Members',
    summary: 'List members',
    auth: 'user',
    permission: 'members:manage',
    response: data(z.array(memberSchema)),
  },
  {
    method: 'post',
    path: '/admin/members',
    tag: 'Members',
    summary: 'Add a member',
    auth: 'user',
    permission: 'members:manage',
    body: addMemberRequestSchema,
    response: data(memberSchema),
    status: 201,
  },
  {
    method: 'patch',
    path: '/admin/members/{id}',
    tag: 'Members',
    summary: 'Change a member’s role',
    auth: 'user',
    permission: 'members:manage',
    body: updateMemberRequestSchema,
    response: data(memberSchema),
  },
  {
    method: 'delete',
    path: '/admin/members/{id}',
    tag: 'Members',
    summary: 'Remove a member',
    auth: 'user',
    permission: 'members:manage',
    status: 204,
  },
  {
    method: 'get',
    path: '/admin/api-keys',
    tag: 'API keys',
    summary: 'List API keys',
    auth: 'user',
    permission: 'apikeys:manage',
    response: data(z.array(apiKeySchema)),
  },
  {
    method: 'post',
    path: '/admin/api-keys',
    tag: 'API keys',
    summary: 'Create an API key (secret returned once)',
    auth: 'user',
    permission: 'apikeys:manage',
    body: createApiKeyRequestSchema,
    response: data(createdApiKeySchema),
    status: 201,
  },
  {
    method: 'delete',
    path: '/admin/api-keys/{id}',
    tag: 'API keys',
    summary: 'Revoke an API key',
    auth: 'user',
    permission: 'apikeys:manage',
    status: 204,
  },
  {
    method: 'get',
    path: '/admin/audit-events',
    tag: 'Audit',
    summary: 'List audit events',
    auth: 'any',
    permission: 'audit:read',
    query: [
      ...pageParams,
      { name: 'action', schema: { type: 'string' } },
      { name: 'targetType', schema: { type: 'string' } },
      { name: 'targetId', schema: { type: 'string' } },
    ],
    response: page(auditEventSchema),
  },

  // Metadata
  {
    method: 'get',
    path: '/admin/field-types',
    tag: 'Metadata',
    summary: 'Field type registry',
    auth: 'any',
    permission: 'metadata:read',
  },
  {
    method: 'get',
    path: '/admin/entities',
    tag: 'Metadata',
    summary: 'List entities',
    auth: 'any',
    permission: 'metadata:read',
    response: data(z.array(entitySchema)),
  },
  {
    method: 'post',
    path: '/admin/entities',
    tag: 'Metadata',
    summary: 'Create an entity',
    auth: 'any',
    permission: 'metadata:write',
    body: createEntityRequestSchema,
    response: data(entitySchema),
    status: 201,
  },
  {
    method: 'get',
    path: '/admin/entities/{entityId}',
    tag: 'Metadata',
    summary: 'Get an entity',
    auth: 'any',
    permission: 'metadata:read',
    response: data(entitySchema),
  },
  {
    method: 'patch',
    path: '/admin/entities/{entityId}',
    tag: 'Metadata',
    summary: 'Update entity settings',
    auth: 'any',
    permission: 'metadata:write',
    body: updateEntityRequestSchema,
    response: data(entitySchema),
  },
  {
    method: 'delete',
    path: '/admin/entities/{entityId}',
    tag: 'Metadata',
    summary: 'Delete an entity without live records',
    auth: 'any',
    permission: 'metadata:write',
    status: 204,
  },
  {
    method: 'get',
    path: '/admin/entities/{entityId}/versions',
    tag: 'Metadata',
    summary: 'Metadata version history',
    auth: 'any',
    permission: 'metadata:read',
    response: data(z.array(metadataVersionSchema)),
  },
  {
    method: 'post',
    path: '/admin/entities/{entityId}/fields',
    tag: 'Metadata',
    summary: 'Add a field',
    auth: 'any',
    permission: 'metadata:write',
    body: createFieldRequestSchema,
    response: data(entitySchema),
    status: 201,
  },
  {
    method: 'patch',
    path: '/admin/entities/{entityId}/fields/{fieldId}',
    tag: 'Metadata',
    summary: 'Update a field',
    auth: 'any',
    permission: 'metadata:write',
    body: updateFieldRequestSchema,
    response: data(entitySchema),
  },
  {
    method: 'delete',
    path: '/admin/entities/{entityId}/fields/{fieldId}',
    tag: 'Metadata',
    summary: 'Delete a field and its values',
    auth: 'any',
    permission: 'metadata:write',
    response: data(entitySchema),
  },
  {
    method: 'post',
    path: '/admin/entities/{entityId}/fields/reorder',
    tag: 'Metadata',
    summary: 'Reorder fields',
    auth: 'any',
    permission: 'metadata:write',
    body: reorderFieldsRequestSchema,
    response: data(entitySchema),
  },

  // Configuration as code (ADR-010)
  {
    method: 'get',
    path: '/admin/config/export',
    tag: 'Config',
    summary: 'Export metadata as a portable document',
    auth: 'any',
    permission: 'metadata:read',
    response: data(configDocumentSchema),
  },
  {
    method: 'post',
    path: '/admin/config/diff',
    tag: 'Config',
    summary: 'Plan changes needed to reach a document (read-only)',
    auth: 'any',
    permission: 'metadata:write',
    query: [
      {
        name: 'prune',
        schema: { type: 'string', enum: ['true', 'false'] },
        description: 'Include deletions of undeclared entities and fields',
      },
    ],
    body: configDocumentSchema,
    response: data(configPlanSchema),
  },
  {
    method: 'post',
    path: '/admin/config/apply',
    tag: 'Config',
    summary: 'Apply a document atomically',
    auth: 'any',
    permission: 'metadata:write',
    body: configApplyRequestSchema,
    response: data(configPlanSchema),
  },

  // Records
  {
    method: 'get',
    path: '/entities/{entityKey}/records',
    tag: 'Records',
    summary: 'List records',
    auth: 'any',
    permission: 'records:read',
    query: recordListParams,
    response: page(recordSchema),
  },
  {
    method: 'post',
    path: '/entities/{entityKey}/records',
    tag: 'Records',
    summary: 'Create a record',
    auth: 'any',
    permission: 'records:write',
    body: createRecordRequestSchema,
    response: data(recordSchema),
    status: 201,
  },
  {
    method: 'get',
    path: '/entities/{entityKey}/records/{id}',
    tag: 'Records',
    summary: 'Get a record',
    auth: 'any',
    permission: 'records:read',
    query: [recordListParams[3]!, recordListParams[5]!],
    response: data(recordSchema),
  },
  {
    method: 'patch',
    path: '/entities/{entityKey}/records/{id}',
    tag: 'Records',
    summary: 'Update a record (optionally with version check)',
    auth: 'any',
    permission: 'records:write',
    body: updateRecordRequestSchema,
    response: data(recordSchema),
  },
  {
    method: 'delete',
    path: '/entities/{entityKey}/records/{id}',
    tag: 'Records',
    summary: 'Move a record to the trash',
    auth: 'any',
    permission: 'records:write',
    status: 204,
  },
  {
    method: 'post',
    path: '/entities/{entityKey}/records/{id}/restore',
    tag: 'Records',
    summary: 'Restore a deleted record (admins)',
    auth: 'any',
    permission: 'records:write',
    response: data(recordSchema),
  },
  {
    method: 'delete',
    path: '/entities/{entityKey}/records/{id}/permanent',
    tag: 'Records',
    summary: 'Permanently delete a trashed record (admins)',
    auth: 'any',
    permission: 'records:write',
    status: 204,
  },

  // Media (ADR-023)
  {
    method: 'post',
    path: '/media',
    tag: 'Media',
    summary: 'Upload a file (multipart/form-data: file, alt)',
    auth: 'any',
    permission: 'media:write',
    response: data(mediaSchema),
    status: 201,
    contentType: 'application/json',
  },
  {
    method: 'get',
    path: '/media',
    tag: 'Media',
    summary: 'List media',
    auth: 'any',
    permission: 'media:read',
    query: [
      ...pageParams,
      { name: 'kind', schema: { type: 'string', enum: ['image', 'video', 'audio', 'document'] } },
      { name: 'search', schema: { type: 'string' } },
    ],
    response: page(mediaSchema),
  },
  {
    method: 'get',
    path: '/media/{id}',
    tag: 'Media',
    summary: 'Get media metadata',
    auth: 'any',
    permission: 'media:read',
    response: data(mediaSchema),
  },
  {
    method: 'get',
    path: '/media/{id}/file',
    tag: 'Media',
    summary: 'Download the file',
    auth: 'any',
    permission: 'media:read',
    contentType: 'application/octet-stream',
  },
  {
    method: 'patch',
    path: '/media/{id}',
    tag: 'Media',
    summary: 'Update alt text or file name',
    auth: 'any',
    permission: 'media:write',
    body: updateMediaRequestSchema,
    response: data(mediaSchema),
  },
  {
    method: 'delete',
    path: '/media/{id}',
    tag: 'Media',
    summary: 'Delete media',
    auth: 'any',
    permission: 'media:write',
    status: 204,
  },

  // Templates (ADR-009)
  {
    method: 'get',
    path: '/admin/templates',
    tag: 'Templates',
    summary: 'Available and installed templates',
    auth: 'any',
    permission: 'templates:manage',
    response: data(z.array(templateInfoSchema)),
  },
  {
    method: 'post',
    path: '/admin/templates/{templateId}/install',
    tag: 'Templates',
    summary: 'Install a template',
    auth: 'any',
    permission: 'templates:manage',
    body: installTemplateRequestSchema,
    response: data(templateInfoSchema),
    status: 201,
  },

  // Public content API (ADR-025)
  {
    method: 'get',
    path: '/public/{tenantSlug}/entities/{entityKey}/records',
    tag: 'Public',
    summary: 'List published public records',
    auth: 'public',
    query: recordListParams.filter((p) => p.name !== 'deleted'),
    response: page(recordSchema),
  },
  {
    method: 'get',
    path: '/public/{tenantSlug}/entities/{entityKey}/records/{id}',
    tag: 'Public',
    summary: 'Get a published public record',
    auth: 'public',
    query: [recordListParams[3]!, recordListParams[5]!],
    response: data(recordSchema),
  },
  {
    method: 'get',
    path: '/public/{tenantSlug}/media/{id}/file',
    tag: 'Public',
    summary: 'Download a file referenced by published public content',
    auth: 'public',
    contentType: 'application/octet-stream',
  },
];

// ---------------------------------------------------------------------------

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  return rest;
}

const ERROR_RESPONSES: Record<string, string> = {
  '400': 'Bad request (invalid filter, sort or parameters)',
  '401': 'Authentication required or invalid credentials',
  '403': 'Forbidden (missing permission, CSRF token or tenant access)',
  '404': 'Not found (also returned for resources of other tenants)',
  '409': 'Conflict (uniqueness, version or state)',
  '422': 'Validation failed (details list each invalid path)',
  '429': 'Rate limit exceeded',
};

function security(auth: OperationSpec['auth']): Record<string, string[]>[] | undefined {
  if (auth === 'public') return [];
  if (auth === 'any') return [{ sessionCookie: [], csrfToken: [] }, { apiKey: [] }];
  return [{ sessionCookie: [], csrfToken: [] }];
}

function operationObject(
  op: OperationSpec,
  overrides: { response?: JsonSchema; body?: JsonSchema } = {},
) {
  const pathParams = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const status = String(op.status ?? 200);
  const success: Record<string, unknown> = { description: 'Success' };
  const responseSchema =
    overrides.response ?? (op.response ? jsonSchema(op.response, 'output') : undefined);
  if (responseSchema) success.content = { 'application/json': { schema: responseSchema } };
  else if (op.contentType) success.content = { [op.contentType]: {} };
  const responses: Record<string, unknown> = { [status]: success };
  for (const [code, description] of Object.entries(ERROR_RESPONSES)) {
    if (op.auth === 'public' && (code === '401' || code === '403')) continue;
    responses[code] = {
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
    };
  }
  const bodySchema = overrides.body ?? (op.body ? jsonSchema(op.body, 'input') : undefined);
  return {
    tags: [op.tag],
    summary: op.summary,
    operationId: `${op.method}${op.path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
    ...(op.permission ? { description: `Requires permission \`${op.permission}\`.` } : {}),
    security: security(op.auth),
    parameters: [
      ...pathParams.map((name) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })),
      ...(op.query ?? []).map((q) => ({
        name: q.name,
        in: 'query',
        required: false,
        schema: q.schema,
        ...(q.description ? { description: q.description } : {}),
        ...(q.name === 'filter' ? { style: 'deepObject', explode: true } : {}),
      })),
    ],
    ...(bodySchema
      ? { requestBody: { required: true, content: { 'application/json': { schema: bodySchema } } } }
      : {}),
    responses,
  };
}

function baseDocument(serverUrl: string, version: string, title: string) {
  return {
    openapi: '3.1.0',
    info: {
      title,
      version,
      license: { name: 'AGPL-3.0-only', identifier: 'AGPL-3.0-only' },
      description:
        'REST API of the metadata-driven application platform. Errors use `{ error: { code, message, details? } }`. ' +
        'Browser clients authenticate with the session cookie and send the CSRF token from the session in `x-csrf-token` on state-changing requests. ' +
        'Machine clients send `Authorization: Bearer <api key>`.',
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'bcms_session' },
        csrfToken: { type: 'apiKey', in: 'header', name: 'x-csrf-token' },
        apiKey: { type: 'http', scheme: 'bearer', description: 'Tenant API key (bcms_...)' },
      },
      schemas: { ApiError: jsonSchema(apiErrorSchema, 'output') } as Record<string, JsonSchema>,
    },
    paths: {} as Record<string, Record<string, unknown>>,
  };
}

export function buildOpenApiDocument(opts: { serverUrl?: string; version?: string } = {}) {
  const doc = baseDocument(opts.serverUrl ?? '/api/v1', opts.version ?? '1.0.0', 'Platform API');
  for (const op of API_OPERATIONS) {
    doc.paths[op.path] ??= {};
    doc.paths[op.path]![op.method] = operationObject(op);
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Tenant-specific documents
// ---------------------------------------------------------------------------

/** JSON Schema of one field's value (nullable unless required). */
export function fieldValueJsonSchema(
  field: Pick<FieldDefinition, 'type' | 'config' | 'required' | 'label' | 'description'>,
): JsonSchema {
  const c = field.config as Record<string, unknown>;
  let schema: JsonSchema;
  switch (field.type) {
    case 'text': {
      const parsed = fieldConfigSchemas.text.parse(c);
      schema = { type: 'string', maxLength: parsed.maxLength };
      if (parsed.minLength !== undefined) schema.minLength = parsed.minLength;
      if (parsed.format === 'email') schema.format = 'email';
      if (parsed.format === 'url') schema.format = 'uri';
      if (parsed.format === 'slug') schema.pattern = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
      break;
    }
    case 'longtext':
      schema = { type: 'string', maxLength: fieldConfigSchemas.longtext.parse(c).maxLength };
      break;
    case 'integer': {
      const parsed = fieldConfigSchemas.integer.parse(c);
      schema = {
        type: 'integer',
        ...(parsed.min !== undefined ? { minimum: parsed.min } : {}),
        ...(parsed.max !== undefined ? { maximum: parsed.max } : {}),
      };
      break;
    }
    case 'decimal':
      schema = {
        type: 'string',
        pattern: '^-?\\d+(\\.\\d+)?$',
        description: 'Decimal number as a string',
      };
      break;
    case 'boolean':
      schema = { type: 'boolean' };
      break;
    case 'date':
      schema = { type: 'string', format: 'date' };
      break;
    case 'datetime':
      schema = { type: 'string', format: 'date-time' };
      break;
    case 'select':
      schema = {
        type: 'string',
        enum: fieldConfigSchemas.select.parse(c).options.map((o) => o.value),
      };
      break;
    case 'multiselect':
      schema = {
        type: 'array',
        items: {
          type: 'string',
          enum: fieldConfigSchemas.multiselect.parse(c).options.map((o) => o.value),
        },
        uniqueItems: true,
      };
      break;
    case 'relation':
      schema =
        fieldConfigSchemas.relation.parse(c).cardinality === 'many'
          ? { type: 'array', items: { type: 'string', format: 'uuid' }, uniqueItems: true }
          : { type: 'string', format: 'uuid' };
      break;
    case 'media':
      schema = fieldConfigSchemas.media.parse(c).multiple
        ? { type: 'array', items: { type: 'string', format: 'uuid' }, uniqueItems: true }
        : { type: 'string', format: 'uuid' };
      break;
  }
  const described = {
    title: field.label,
    ...(field.description ? { description: field.description } : {}),
    ...schema,
  };
  return field.required ? described : { anyOf: [described, { type: 'null' }], title: field.label };
}

function pascal(key: string): string {
  return key
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');
}

/** OpenAPI document with typed record schemas and paths for each entity. */
export function buildTenantOpenApiDocument(
  entities: EntityDefinition[],
  opts: { serverUrl?: string; version?: string; tenantName?: string } = {},
) {
  const doc = buildOpenApiDocument(opts);
  doc.info.title = `Platform API${opts.tenantName ? ` — ${opts.tenantName}` : ''}`;
  const recordOps = API_OPERATIONS.filter((op) => op.path.startsWith('/entities/{entityKey}'));
  for (const entity of entities) {
    const name = pascal(entity.key);
    const properties: Record<string, JsonSchema> = {};
    for (const field of entity.fields) properties[field.key] = fieldValueJsonSchema(field);
    doc.components.schemas[`${name}Data`] = {
      type: 'object',
      properties,
      additionalProperties: false,
    };
    doc.components.schemas[`${name}Input`] = {
      type: 'object',
      properties,
      required: entity.fields
        .filter((f) => f.required && f.defaultValue === null)
        .map((f) => f.key),
      additionalProperties: false,
    };
    const record = {
      type: 'object',
      properties: {
        ...(jsonSchema(recordSchema, 'output').properties as Record<string, unknown>),
        data: { $ref: `#/components/schemas/${name}Data` },
      },
    };
    doc.components.schemas[`${name}Record`] = record;
    const ref = { $ref: `#/components/schemas/${name}Record` };
    for (const op of recordOps) {
      const path = op.path.replace('{entityKey}', entity.key);
      const response =
        op.response === undefined
          ? undefined
          : op.method === 'get' && !op.path.endsWith('{id}')
            ? {
                type: 'object',
                properties: {
                  data: { type: 'array', items: ref },
                  meta: jsonSchema(pageMetaSchema, 'output'),
                },
              }
            : { type: 'object', properties: { data: ref } };
      const body =
        op.method === 'post' && op.body
          ? {
              type: 'object',
              properties: { data: { $ref: `#/components/schemas/${name}Input` } },
              required: ['data'],
            }
          : op.method === 'patch'
            ? {
                type: 'object',
                properties: {
                  data: { type: 'object', properties, additionalProperties: false },
                  version: { type: 'integer' },
                },
                required: ['data'],
              }
            : undefined;
      doc.paths[path] ??= {};
      doc.paths[path]![op.method] = {
        ...operationObject({ ...op, path, tag: entity.pluralName }, { response, body }),
        operationId: `${op.method}${name}${op.path.endsWith('{id}') ? 'ById' : ''}${op.path.endsWith('restore') ? 'Restore' : ''}${op.path.endsWith('permanent') ? 'Permanent' : ''}`,
      };
    }
  }
  return doc;
}
