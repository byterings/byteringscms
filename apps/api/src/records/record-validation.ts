import { type FieldType, roleAtLeast, type Role, validateFieldValue } from '@bytecontent/contracts';
import { type Field } from '@prisma/client';
import { HttpStatus } from '@nestjs/common';
import { AppError } from '../common/app-error';

export type RecordData = Record<string, unknown>;

export function canRead(field: Pick<Field, 'readMinRole'>, role: Role): boolean {
  return roleAtLeast(role, field.readMinRole);
}

export function canWrite(field: Pick<Field, 'writeMinRole'>, role: Role): boolean {
  return roleAtLeast(role, field.writeMinRole);
}

/**
 * Validates a create/update payload against field metadata and field-level
 * write permissions. Returns normalized values for the provided keys (null
 * means "clear") plus defaults for missing fields on create.
 */
export function validateRecordInput(
  fields: Field[],
  input: RecordData,
  opts: { mode: 'create' | 'update'; role: Role },
): { values: RecordData; changedKeys: string[] } {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const issues: { path: string; message: string }[] = [];
  const forbidden: string[] = [];
  const values: RecordData = {};

  for (const [key, raw] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) {
      issues.push({ path: `data.${key}`, message: 'Unknown field' });
      continue;
    }
    if (!canWrite(field, opts.role)) {
      forbidden.push(key);
      continue;
    }
    const result = validateFieldValue(
      {
        key,
        type: field.type as FieldType,
        required: field.required,
        config: field.config as Record<string, unknown>,
      },
      raw,
    );
    if (result.ok) values[key] = result.value;
    else issues.push({ path: `data.${key}`, message: result.message });
  }

  if (forbidden.length) {
    throw new AppError(
      'FIELD_FORBIDDEN',
      `You may not write these fields: ${forbidden.join(', ')}`,
      HttpStatus.FORBIDDEN,
      forbidden.map((key) => ({ path: `data.${key}`, message: 'Not writable for your role' })),
    );
  }

  if (opts.mode === 'create') {
    for (const field of fields) {
      // Provided keys were already validated (and reported) above.
      if (Object.hasOwn(input, field.key)) continue;
      if (field.defaultValue !== null && field.defaultValue !== undefined) {
        values[field.key] = field.defaultValue;
      } else if (field.required) {
        issues.push({ path: `data.${field.key}`, message: 'This field is required' });
      }
    }
  }

  if (issues.length) throw AppError.validation(issues);
  return { values, changedKeys: Object.keys(input).filter((k) => byKey.has(k)) };
}

/** Merges validated values into stored data; null removes the key (nulls are not stored). */
export function mergeData(existing: RecordData, values: RecordData): RecordData {
  const merged: RecordData = { ...existing };
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** Canonical string used to enforce unique values (text is case-insensitive). */
export function uniqueValueKey(type: string, value: unknown): string {
  return type === 'text' ? String(value).trim().toLowerCase() : String(value);
}

/** Keeps only fields the role may read, optionally narrowed to a selection. */
export function serializeData(
  fields: Field[],
  data: RecordData,
  role: Role,
  selection?: Set<string>,
): RecordData {
  const out: RecordData = {};
  for (const field of fields) {
    if (!canRead(field, role)) continue;
    if (selection && !selection.has(field.key)) continue;
    out[field.key] = data[field.key] ?? null;
  }
  return out;
}
