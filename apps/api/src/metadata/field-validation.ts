import {
  FIELD_TYPE_INFO,
  parseFieldConfig,
  validateFieldValue,
  type FieldType,
} from '@bytecontent/contracts';
import { type Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';
import { type Tx } from '../database/tenant-db.service';

export interface FieldInput {
  required: boolean;
  unique: boolean;
  defaultValue: unknown;
  config: unknown;
}

export interface NormalizedField {
  config: Prisma.InputJsonObject;
  defaultValue: Prisma.InputJsonValue | null;
}

type Issue = { path: string; message: string };

function bounds(config: Record<string, unknown>, lo: string, hi: string, issues: Issue[]): void {
  const min = config[lo];
  const max = config[hi];
  if (
    min !== undefined &&
    max !== undefined &&
    (min as number | string) > (max as number | string)
  ) {
    issues.push({ path: `config.${lo}`, message: `${lo} must not exceed ${hi}` });
  }
}

/**
 * Validates a field definition against the field type registry and the
 * tenant's other metadata. Returns the normalized config and default value.
 */
export async function normalizeField(
  tx: Tx,
  tenantId: string,
  type: FieldType,
  input: FieldInput,
): Promise<NormalizedField> {
  const issues: Issue[] = [];
  const info = FIELD_TYPE_INFO[type];

  const parsed = parseFieldConfig(type, input.config);
  if (!parsed.success) {
    throw AppError.validation(
      parsed.error.issues.map((issue) => ({
        path: ['config', ...issue.path].join('.'),
        message: issue.message,
      })),
      'Invalid field configuration',
    );
  }
  const config = parsed.data as Record<string, unknown>;

  bounds(config, 'min', 'max', issues);
  bounds(config, 'minLength', 'maxLength', issues);
  bounds(config, 'minItems', 'maxItems', issues);

  if (input.unique && !info.supportsUnique) {
    issues.push({ path: 'unique', message: `${info.label} fields cannot be unique` });
  }

  if (type === 'relation') {
    const target = await tx.entity.findFirst({
      where: { id: config.targetEntityId as string, tenantId },
      select: { id: true },
    });
    if (!target) issues.push({ path: 'config.targetEntityId', message: 'Target entity not found' });
  }

  let defaultValue: Prisma.InputJsonValue | null = null;
  if (input.defaultValue !== undefined && input.defaultValue !== null) {
    if (!info.supportsDefault) {
      issues.push({ path: 'defaultValue', message: `${info.label} fields have no default value` });
    } else if (input.unique) {
      issues.push({ path: 'defaultValue', message: 'Unique fields cannot have a default value' });
    } else {
      const result = validateFieldValue(
        { key: 'defaultValue', type, required: false, config },
        input.defaultValue,
      );
      if (result.ok) defaultValue = result.value as Prisma.InputJsonValue | null;
      else issues.push({ path: 'defaultValue', message: result.message });
    }
  }

  if (issues.length) throw AppError.validation(issues, 'Invalid field definition');
  return { config: config as Prisma.InputJsonObject, defaultValue };
}
