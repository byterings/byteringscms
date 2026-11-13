/**
 * Builds safe, parameterized SQL fragments for record listing.
 *
 * Every field key, operator and value is validated against the entity's
 * metadata before it reaches SQL; keys and values are always bound as
 * parameters - never interpolated (developmentPlan §6.7, §7.7).
 */
import { FIELD_TYPE_INFO, type FieldType, type FilterOperator } from '@byteringscms/contracts';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';

export interface QueryField {
  key: string;
  type: FieldType;
  config: Record<string, unknown>;
}

export interface RecordQueryInput {
  tenantId: string;
  entityId: string;
  /** Fields the caller may read; only these can be filtered, sorted or searched. */
  fields: QueryField[];
  filter?: Record<string, unknown>;
  sort?: string;
  search?: string;
  deleted?: boolean;
  /** Additional trusted conditions (e.g. the public publish rule). */
  extra?: Prisma.Sql[];
}

export interface BuiltRecordQuery {
  where: Prisma.Sql;
  orderBy: Prisma.Sql;
}

const MAX_FILTERS = 20;
const MAX_SORT = 5;
const MAX_IN = 100;
const MAX_FILTER_VALUE = 500;

type SystemKey = 'id' | 'createdAt' | 'updatedAt';
const SYSTEM_COLUMNS: Record<SystemKey, Prisma.Sql> = {
  id: Prisma.sql`r.id`,
  createdAt: Prisma.sql`r.created_at`,
  updatedAt: Prisma.sql`r.updated_at`,
};
const SYSTEM_OPERATORS: Record<SystemKey, readonly FilterOperator[]> = {
  id: ['eq', 'in'],
  createdAt: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  updatedAt: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const INTEGER_RE = /^-?\d{1,15}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function invalidFilter(message: string, path: string): AppError {
  return AppError.badRequest('INVALID_FILTER', message, [{ path, message }]);
}

/** Text value of a field: data ->> key. */
function textExpr(key: string): Prisma.Sql {
  return Prisma.sql`(r.data ->> ${key}::text)`;
}

function valueExpr(field: QueryField): Prisma.Sql {
  switch (field.type) {
    case 'integer':
    case 'decimal':
      return Prisma.sql`(r.data ->> ${field.key}::text)::numeric`;
    case 'boolean':
      return Prisma.sql`(r.data ->> ${field.key}::text)::boolean`;
    default:
      return textExpr(field.key);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Parses one filter value from the query string into a typed SQL parameter. */
function parseValue(
  type: FieldType | 'uuid' | 'timestamp',
  raw: unknown,
  path: string,
): Prisma.Sql {
  if (typeof raw !== 'string') throw invalidFilter('Filter values must be strings', path);
  if (raw.length > MAX_FILTER_VALUE) throw invalidFilter('Filter value is too long', path);
  switch (type) {
    case 'integer':
      if (!INTEGER_RE.test(raw)) throw invalidFilter('Expected an integer', path);
      return Prisma.sql`${raw}::numeric`;
    case 'decimal':
      if (!DECIMAL_RE.test(raw)) throw invalidFilter('Expected a decimal number', path);
      return Prisma.sql`${raw}::numeric`;
    case 'boolean':
      if (raw !== 'true' && raw !== 'false') throw invalidFilter('Expected true or false', path);
      return Prisma.sql`${raw === 'true'}`;
    case 'date':
      if (!DATE_RE.test(raw)) throw invalidFilter('Expected a date (YYYY-MM-DD)', path);
      return Prisma.sql`${raw}::text`;
    case 'datetime': {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw invalidFilter('Expected an ISO date-time', path);
      return Prisma.sql`${date.toISOString()}::text`;
    }
    case 'timestamp': {
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw invalidFilter('Expected an ISO date-time', path);
      return Prisma.sql`${date.toISOString()}::timestamptz`;
    }
    case 'uuid':
    case 'relation':
    case 'media':
      if (!UUID_RE.test(raw)) throw invalidFilter('Expected a UUID', path);
      return Prisma.sql`${raw.toLowerCase()}::text`;
    default:
      return Prisma.sql`${raw}::text`;
  }
}

function listValues(raw: unknown, path: string): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null;
  if (!values || values.length === 0) throw invalidFilter('Expected a comma-separated list', path);
  if (values.length > MAX_IN) throw invalidFilter(`At most ${MAX_IN} values`, path);
  return values.map((v) => String(v).trim());
}

function comparison(expr: Prisma.Sql, op: FilterOperator, value: Prisma.Sql): Prisma.Sql {
  switch (op) {
    case 'eq':
      return Prisma.sql`${expr} = ${value}`;
    case 'ne':
      return Prisma.sql`${expr} IS DISTINCT FROM ${value}`;
    case 'gt':
      return Prisma.sql`${expr} > ${value}`;
    case 'gte':
      return Prisma.sql`${expr} >= ${value}`;
    case 'lt':
      return Prisma.sql`${expr} < ${value}`;
    case 'lte':
      return Prisma.sql`${expr} <= ${value}`;
    default:
      throw new Error(`unsupported comparison ${op}`);
  }
}

function systemCondition(
  key: SystemKey,
  op: FilterOperator,
  raw: unknown,
  path: string,
): Prisma.Sql {
  if (!SYSTEM_OPERATORS[key].includes(op)) {
    throw invalidFilter(`Operator "${op}" is not supported for ${key}`, path);
  }
  const column = SYSTEM_COLUMNS[key];
  if (key === 'id') {
    if (op === 'in') {
      const ids = listValues(raw, path).map((v) => parseValue('uuid', v, path));
      return Prisma.sql`r.id::text IN (${Prisma.join(ids)})`;
    }
    return Prisma.sql`r.id::text = ${parseValue('uuid', raw, path)}`;
  }
  return comparison(column, op, parseValue('timestamp', raw, path));
}

function fieldCondition(
  field: QueryField,
  op: FilterOperator,
  raw: unknown,
  path: string,
): Prisma.Sql {
  const info = FIELD_TYPE_INFO[field.type];
  if (!info.operators.includes(op)) {
    throw invalidFilter(`Operator "${op}" is not supported for ${info.label} fields`, path);
  }
  const many =
    field.type === 'multiselect' ||
    (field.type === 'relation' && field.config.cardinality === 'many') ||
    (field.type === 'media' && field.config.multiple === true);

  switch (op) {
    case 'isNull': {
      if (raw !== 'true' && raw !== 'false') throw invalidFilter('Expected true or false', path);
      // Null values are never stored, so "null" means "key absent".
      return raw === 'true'
        ? Prisma.sql`NOT jsonb_exists(r.data, ${field.key}::text)`
        : Prisma.sql`jsonb_exists(r.data, ${field.key}::text)`;
    }
    case 'contains': {
      if (many) {
        const elementType = field.type === 'multiselect' ? 'text' : 'uuid';
        return Prisma.sql`jsonb_exists(r.data -> ${field.key}::text, ${parseValue(elementType, raw, path)})`;
      }
      if (field.type === 'relation') throw invalidFilter('Use eq for single relations', path);
      if (typeof raw !== 'string') throw invalidFilter('Filter values must be strings', path);
      return Prisma.sql`${textExpr(field.key)} ILIKE ${`%${escapeLike(raw)}%`} ESCAPE '\\'`;
    }
    case 'startsWith': {
      if (typeof raw !== 'string') throw invalidFilter('Filter values must be strings', path);
      return Prisma.sql`${textExpr(field.key)} ILIKE ${`${escapeLike(raw)}%`} ESCAPE '\\'`;
    }
    case 'in': {
      const values = listValues(raw, path).map((v) => parseValue(field.type, v, path));
      return Prisma.sql`${valueExpr(field)} IN (${Prisma.join(values)})`;
    }
    case 'eq':
      if (many) throw invalidFilter('Use contains for multi-value fields', path);
      return comparison(valueExpr(field), op, parseValue(field.type, raw, path));
    default:
      return comparison(valueExpr(field), op, parseValue(field.type, raw, path));
  }
}

function buildFilters(input: RecordQueryInput): Prisma.Sql[] {
  if (!input.filter) return [];
  const byKey = new Map(input.fields.map((f) => [f.key, f]));
  const conditions: Prisma.Sql[] = [];
  for (const [key, spec] of Object.entries(input.filter)) {
    const clauses: [FilterOperator, unknown][] =
      typeof spec === 'object' && spec !== null && !Array.isArray(spec)
        ? (Object.entries(spec) as [FilterOperator, unknown][])
        : [['eq', spec]];
    for (const [op, raw] of clauses) {
      const path = `filter.${key}.${op}`;
      if (conditions.length >= MAX_FILTERS) {
        throw invalidFilter(`At most ${MAX_FILTERS} filter conditions`, path);
      }
      if (key in SYSTEM_COLUMNS) {
        conditions.push(systemCondition(key as SystemKey, op, raw, path));
        continue;
      }
      const field = byKey.get(key);
      if (!field) throw invalidFilter(`Unknown or unreadable field "${key}"`, path);
      conditions.push(fieldCondition(field, op, raw, path));
    }
  }
  return conditions;
}

function buildSearch(input: RecordQueryInput): Prisma.Sql | null {
  if (!input.search) return null;
  const textFields = input.fields.filter((f) => f.type === 'text');
  if (textFields.length === 0) return null;
  const pattern = `%${escapeLike(input.search)}%`;
  const ors = textFields.map((f) => Prisma.sql`${textExpr(f.key)} ILIKE ${pattern} ESCAPE '\\'`);
  return Prisma.sql`(${Prisma.join(ors, ' OR ')})`;
}

function buildOrderBy(input: RecordQueryInput): Prisma.Sql {
  const byKey = new Map(input.fields.map((f) => [f.key, f]));
  const parts: Prisma.Sql[] = [];
  const tokens = (input.sort ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.length > MAX_SORT) {
    throw AppError.badRequest('INVALID_SORT', `At most ${MAX_SORT} sort fields`);
  }
  for (const token of tokens) {
    const desc = token.startsWith('-');
    const key = desc ? token.slice(1) : token;
    const direction = desc ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    if (key in SYSTEM_COLUMNS) {
      parts.push(Prisma.sql`${SYSTEM_COLUMNS[key as SystemKey]} ${direction}`);
      continue;
    }
    const field = byKey.get(key);
    if (!field || !FIELD_TYPE_INFO[field.type].sortable) {
      throw AppError.badRequest('INVALID_SORT', `Cannot sort by "${key}"`, [
        { path: 'sort', message: `Unknown, unreadable or unsortable field "${key}"` },
      ]);
    }
    parts.push(Prisma.sql`${valueExpr(field)} ${direction} NULLS LAST`);
  }
  if (parts.length === 0) parts.push(Prisma.sql`r.created_at DESC`);
  parts.push(Prisma.sql`r.id ASC`);
  return Prisma.join(parts, ', ');
}

export function buildRecordQuery(input: RecordQueryInput): BuiltRecordQuery {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`r.tenant_id = ${input.tenantId}::uuid`,
    Prisma.sql`r.entity_id = ${input.entityId}::uuid`,
    input.deleted ? Prisma.sql`r.deleted_at IS NOT NULL` : Prisma.sql`r.deleted_at IS NULL`,
    ...buildFilters(input),
    ...(input.extra ?? []),
  ];
  const search = buildSearch(input);
  if (search) conditions.push(search);
  return { where: Prisma.join(conditions, ' AND '), orderBy: buildOrderBy(input) };
}
