/**
 * Field type registry (developmentPlan §7.5). Every field type defines its
 * configuration schema, value validation/normalization, filter operators and
 * sort support here, once, for the API, Admin Studio and SDK.
 */
import { z } from 'zod';
import { roleSchema } from './permissions';

export const FIELD_TYPES = [
  'text',
  'longtext',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'select',
  'multiselect',
  'relation',
  'media',
] as const;
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const FILTER_OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'contains',
  'startsWith',
  'isNull',
] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** Field keys: camelCase identifiers. */
export const fieldKeySchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-zA-Z0-9_]*$/, 'Start with a lower-case letter; use letters, digits, _');

/** Keys reserved for record system attributes. */
export const RESERVED_FIELD_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
  'version',
  'deletedAt',
  'entity',
  'tenant',
]);

// ---------------------------------------------------------------------------
// Per-type configuration
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  value: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, 'Option values use letters, digits, _ . -'),
  label: z.string().trim().min(1).max(200),
});

const optionsSchema = z
  .array(optionSchema)
  .min(1)
  .max(200)
  .refine((opts) => new Set(opts.map((o) => o.value)).size === opts.length, {
    message: 'Option values must be unique',
  });

export const TEXT_FORMATS = ['plain', 'email', 'url', 'slug'] as const;
export const MEDIA_KINDS = ['image', 'video', 'audio', 'document'] as const;

const MAX_SAFE_DECIMAL = 1e15;

export const fieldConfigSchemas = {
  text: z
    .object({
      minLength: z.number().int().min(0).max(10_000).optional(),
      maxLength: z.number().int().min(1).max(10_000).default(255),
      format: z.enum(TEXT_FORMATS).default('plain'),
    })
    .strict(),
  longtext: z
    .object({
      maxLength: z.number().int().min(1).max(1_000_000).default(100_000),
      markdown: z.boolean().default(false),
    })
    .strict(),
  integer: z
    .object({
      min: z.number().int().safe().optional(),
      max: z.number().int().safe().optional(),
    })
    .strict(),
  decimal: z
    .object({
      min: z.number().min(-MAX_SAFE_DECIMAL).max(MAX_SAFE_DECIMAL).optional(),
      max: z.number().min(-MAX_SAFE_DECIMAL).max(MAX_SAFE_DECIMAL).optional(),
      scale: z.number().int().min(0).max(10).default(2),
    })
    .strict(),
  boolean: z.object({}).strict(),
  date: z
    .object({
      min: z.iso.date().optional(),
      max: z.iso.date().optional(),
    })
    .strict(),
  datetime: z.object({}).strict(),
  select: z.object({ options: optionsSchema }).strict(),
  multiselect: z
    .object({
      options: optionsSchema,
      minItems: z.number().int().min(0).max(200).optional(),
      maxItems: z.number().int().min(1).max(200).optional(),
    })
    .strict(),
  relation: z
    .object({
      /** Stable id of the target entity (same tenant). */
      targetEntityId: z.uuid(),
      cardinality: z.enum(['one', 'many']).default('one'),
      maxItems: z.number().int().min(1).max(100).default(100),
    })
    .strict(),
  media: z
    .object({
      multiple: z.boolean().default(false),
      accept: z.array(z.enum(MEDIA_KINDS)).min(1).optional(),
      maxItems: z.number().int().min(1).max(100).default(20),
    })
    .strict(),
} as const satisfies Record<FieldType, z.ZodType>;

export type FieldConfig<T extends FieldType = FieldType> = z.infer<(typeof fieldConfigSchemas)[T]>;

export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  description: string;
  supportsUnique: boolean;
  supportsDefault: boolean;
  sortable: boolean;
  operators: readonly FilterOperator[];
}

const SCALAR_OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'isNull'] as const;

export const FIELD_TYPE_INFO: Readonly<Record<FieldType, FieldTypeInfo>> = {
  text: {
    type: 'text',
    label: 'Text',
    description: 'Single line of text (optionally email, URL or slug).',
    supportsUnique: true,
    supportsDefault: true,
    sortable: true,
    operators: ['eq', 'ne', 'in', 'contains', 'startsWith', 'isNull'],
  },
  longtext: {
    type: 'longtext',
    label: 'Long text',
    description: 'Multi-line text or Markdown.',
    supportsUnique: false,
    supportsDefault: true,
    sortable: false,
    operators: ['contains', 'isNull'],
  },
  integer: {
    type: 'integer',
    label: 'Integer',
    description: 'Whole number.',
    supportsUnique: true,
    supportsDefault: true,
    sortable: true,
    operators: SCALAR_OPS,
  },
  decimal: {
    type: 'decimal',
    label: 'Decimal',
    description: 'Exact decimal number, returned as a string (e.g. "19.99").',
    supportsUnique: true,
    supportsDefault: true,
    sortable: true,
    operators: SCALAR_OPS,
  },
  boolean: {
    type: 'boolean',
    label: 'Boolean',
    description: 'True or false.',
    supportsUnique: false,
    supportsDefault: true,
    sortable: true,
    operators: ['eq', 'ne', 'isNull'],
  },
  date: {
    type: 'date',
    label: 'Date',
    description: 'Calendar date (YYYY-MM-DD).',
    supportsUnique: true,
    supportsDefault: true,
    sortable: true,
    operators: SCALAR_OPS,
  },
  datetime: {
    type: 'datetime',
    label: 'Date and time',
    description: 'Point in time, stored in UTC (ISO 8601).',
    supportsUnique: true,
    supportsDefault: false,
    sortable: true,
    operators: SCALAR_OPS,
  },
  select: {
    type: 'select',
    label: 'Select',
    description: 'One value from a fixed list of options.',
    supportsUnique: false,
    supportsDefault: true,
    sortable: true,
    operators: ['eq', 'ne', 'in', 'isNull'],
  },
  multiselect: {
    type: 'multiselect',
    label: 'Multi-select',
    description: 'Several values from a fixed list of options.',
    supportsUnique: false,
    supportsDefault: true,
    sortable: false,
    operators: ['contains', 'isNull'],
  },
  relation: {
    type: 'relation',
    label: 'Relation',
    description: 'Reference to one or more records of another entity.',
    supportsUnique: false,
    supportsDefault: false,
    sortable: false,
    operators: ['eq', 'in', 'contains', 'isNull'],
  },
  media: {
    type: 'media',
    label: 'Media',
    description: 'Reference to one or more uploaded files.',
    supportsUnique: false,
    supportsDefault: false,
    sortable: false,
    operators: ['isNull'],
  },
};

// ---------------------------------------------------------------------------
// Field definitions
// ---------------------------------------------------------------------------

export const fieldOwnerSchema = z
  .string()
  .regex(/^(tenant|template:[a-z0-9-]+|plugin:[a-z0-9-]+)$/);

export const fieldSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  description: z.string().nullable(),
  required: z.boolean(),
  unique: z.boolean(),
  isPublic: z.boolean(),
  readMinRole: roleSchema,
  writeMinRole: roleSchema,
  defaultValue: z.unknown().nullable(),
  config: z.record(z.string(), z.unknown()),
  position: z.number().int(),
  owner: z.string(),
  overridden: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FieldDefinition = z.infer<typeof fieldSchema>;

/** Field attributes that may change after creation (key and type are immutable). */
const mutableFieldAttributes = {
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  readMinRole: roleSchema.optional(),
  writeMinRole: roleSchema.optional(),
  defaultValue: z.unknown().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
};

export const createFieldRequestSchema = z.object({
  key: fieldKeySchema.refine((key) => !RESERVED_FIELD_KEYS.has(key), 'This key is reserved'),
  type: fieldTypeSchema,
  ...mutableFieldAttributes,
});
export type CreateFieldRequest = z.infer<typeof createFieldRequestSchema>;

export const updateFieldRequestSchema = z.object({
  ...mutableFieldAttributes,
  label: mutableFieldAttributes.label.optional(),
});
export type UpdateFieldRequest = z.infer<typeof updateFieldRequestSchema>;

export const reorderFieldsRequestSchema = z.object({
  fieldIds: z.array(z.uuid()).min(1).max(500),
});
export type ReorderFieldsRequest = z.infer<typeof reorderFieldsRequestSchema>;

/** Parses and defaults a field's type-specific configuration. */
export function parseFieldConfig(
  type: FieldType,
  config: unknown,
): ReturnType<(typeof fieldConfigSchemas)[FieldType]['safeParse']> {
  return fieldConfigSchemas[type].safeParse(config ?? {});
}

// ---------------------------------------------------------------------------
// Value validation (shared by API record validation and Admin Studio forms)
// ---------------------------------------------------------------------------

/** Minimal field shape needed to validate values. */
export interface ValueFieldShape {
  key: string;
  type: FieldType;
  required: boolean;
  config: Record<string, unknown>;
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function decimalSchema(config: FieldConfig<'decimal'>) {
  return z.union([z.number().finite(), z.string().trim()]).transform((input, ctx) => {
    const text = typeof input === 'number' ? String(input) : input;
    if (!DECIMAL_RE.test(text)) {
      ctx.addIssue({ code: 'custom', message: 'Must be a decimal number' });
      return z.NEVER;
    }
    const [whole = '0', fraction = ''] = text.replace(/^-/, '').split('.');
    if (fraction.length > config.scale) {
      ctx.addIssue({
        code: 'custom',
        message: `At most ${config.scale} decimal places`,
      });
      return z.NEVER;
    }
    const value = Number(text);
    if (Math.abs(value) >= MAX_SAFE_DECIMAL) {
      ctx.addIssue({ code: 'custom', message: 'Number is too large' });
      return z.NEVER;
    }
    if (config.min !== undefined && value < config.min) {
      ctx.addIssue({ code: 'custom', message: `Must be at least ${config.min}` });
      return z.NEVER;
    }
    if (config.max !== undefined && value > config.max) {
      ctx.addIssue({ code: 'custom', message: `Must be at most ${config.max}` });
      return z.NEVER;
    }
    const negative = text.startsWith('-') && value !== 0;
    const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
    const normalized = `${negative ? '-' : ''}${normalizedWhole}${
      config.scale > 0 ? `.${fraction.padEnd(config.scale, '0')}` : ''
    }`;
    return normalized;
  });
}

/** Record/media reference: a UUID, normalized to lower case. */
const referenceId = z.uuid().transform((v) => v.toLowerCase());

function isValidDate(text: string): boolean {
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Zod schema for a single non-null value of the field. */
export function nonNullValueSchema(field: Pick<ValueFieldShape, 'type' | 'config'>): z.ZodType {
  switch (field.type) {
    case 'text': {
      const c = fieldConfigSchemas.text.parse(field.config);
      let schema = z.string().trim().max(c.maxLength);
      if (c.minLength !== undefined) schema = schema.min(c.minLength);
      if (c.format === 'email') return schema.pipe(z.email());
      if (c.format === 'url') return schema.pipe(z.url({ protocol: /^https?$/ }));
      if (c.format === 'slug') return schema.regex(SLUG_RE, 'Use lower-case words separated by -');
      return schema;
    }
    case 'longtext': {
      const c = fieldConfigSchemas.longtext.parse(field.config);
      return z.string().max(c.maxLength);
    }
    case 'integer': {
      const c = fieldConfigSchemas.integer.parse(field.config);
      let schema = z.number().int().safe();
      if (c.min !== undefined) schema = schema.min(c.min);
      if (c.max !== undefined) schema = schema.max(c.max);
      return schema;
    }
    case 'decimal':
      return decimalSchema(fieldConfigSchemas.decimal.parse(field.config));
    case 'boolean':
      return z.boolean();
    case 'date': {
      const c = fieldConfigSchemas.date.parse(field.config);
      return z.iso
        .date()
        .refine(isValidDate, 'Invalid date')
        .refine((v) => c.min === undefined || v >= c.min, `Must be on or after ${c.min}`)
        .refine((v) => c.max === undefined || v <= c.max, `Must be on or before ${c.max}`);
    }
    case 'datetime':
      return z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString());
    case 'select': {
      const c = fieldConfigSchemas.select.parse(field.config);
      const values = c.options.map((o) => o.value);
      return z.string().refine((v) => values.includes(v), 'Not one of the allowed options');
    }
    case 'multiselect': {
      const c = fieldConfigSchemas.multiselect.parse(field.config);
      const values = c.options.map((o) => o.value);
      let schema = z
        .array(z.string().refine((v) => values.includes(v), 'Not one of the allowed options'))
        .refine((arr) => new Set(arr).size === arr.length, 'Values must be unique');
      if (c.minItems !== undefined) {
        schema = schema.refine((arr) => arr.length >= c.minItems!, `Select at least ${c.minItems}`);
      }
      if (c.maxItems !== undefined) {
        schema = schema.refine((arr) => arr.length <= c.maxItems!, `Select at most ${c.maxItems}`);
      }
      return schema;
    }
    case 'relation': {
      const c = fieldConfigSchemas.relation.parse(field.config);
      if (c.cardinality === 'one') return referenceId;
      return z
        .array(referenceId)
        .max(c.maxItems)
        .refine((arr) => new Set(arr).size === arr.length, 'References must be unique');
    }
    case 'media': {
      const c = fieldConfigSchemas.media.parse(field.config);
      if (!c.multiple) return referenceId;
      return z
        .array(referenceId)
        .max(c.maxItems)
        .refine((arr) => new Set(arr).size === arr.length, 'References must be unique');
    }
  }
}

/** True when a value counts as "empty" for required checks. */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * Validates one value. Returns the normalized value or an error message.
 * `null` clears an optional field.
 */
export function validateFieldValue(
  field: ValueFieldShape,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (isEmptyValue(value)) {
    if (field.required) return { ok: false, message: 'This field is required' };
    return { ok: true, value: null };
  }
  const result = nonNullValueSchema(field).safeParse(value);
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? 'Invalid value' };
  }
  if (field.required && isEmptyValue(result.data)) {
    return { ok: false, message: 'This field is required' };
  }
  return { ok: true, value: result.data };
}
