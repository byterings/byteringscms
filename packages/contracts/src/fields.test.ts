import { describe, expect, it } from 'vitest';
import {
  createFieldRequestSchema,
  FIELD_TYPE_INFO,
  FIELD_TYPES,
  parseFieldConfig,
  validateFieldValue,
  type FieldType,
  type ValueFieldShape,
} from './fields';

function field(
  type: FieldType,
  config: Record<string, unknown> = {},
  required = false,
): ValueFieldShape {
  const parsed = parseFieldConfig(type, config);
  if (!parsed.success) throw new Error(`bad config: ${parsed.error.message}`);
  return { key: 'f', type, required, config: parsed.data as Record<string, unknown> };
}

const ok = (f: ValueFieldShape, v: unknown) => {
  const r = validateFieldValue(f, v);
  if (!r.ok) throw new Error(`expected ok for ${JSON.stringify(v)}: ${r.message}`);
  return r.value;
};
const bad = (f: ValueFieldShape, v: unknown) => {
  const r = validateFieldValue(f, v);
  expect(r.ok, `expected rejection for ${JSON.stringify(v)}`).toBe(false);
  return r.ok ? '' : r.message;
};

describe('field type registry', () => {
  it('describes every field type', () => {
    for (const type of FIELD_TYPES) {
      expect(FIELD_TYPE_INFO[type].type).toBe(type);
      expect(
        parseFieldConfig(
          type,
          type === 'select' || type === 'multiselect'
            ? { options: [{ value: 'a', label: 'A' }] }
            : type === 'relation'
              ? { targetEntityId: '00000000-0000-4000-8000-000000000000' }
              : {},
        ).success,
      ).toBe(true);
    }
  });

  it('rejects unknown config keys and reserved field keys', () => {
    expect(parseFieldConfig('text', { maxLength: 10, bogus: true }).success).toBe(false);
    expect(
      createFieldRequestSchema.safeParse({ key: 'id', type: 'text', label: 'Id' }).success,
    ).toBe(false);
    expect(
      createFieldRequestSchema.safeParse({ key: 'Name', type: 'text', label: 'N' }).success,
    ).toBe(false);
    expect(
      createFieldRequestSchema.safeParse({ key: 'name', type: 'text', label: 'N' }).success,
    ).toBe(true);
  });
});

describe('required and empty values', () => {
  it('treats null, empty strings and empty arrays as empty', () => {
    const required = field('text', {}, true);
    expect(bad(required, null)).toMatch(/required/);
    expect(bad(required, '   ')).toMatch(/required/);
    expect(ok(field('text'), '')).toBeNull();
    expect(bad(field('multiselect', { options: [{ value: 'a', label: 'A' }] }, true), [])).toMatch(
      /required/,
    );
  });
});

describe('value validation', () => {
  it('text: trims, enforces length and formats', () => {
    expect(ok(field('text', { maxLength: 5 }), '  abc ')).toBe('abc');
    bad(field('text', { maxLength: 3 }), 'abcd');
    bad(field('text'), 42);
    expect(ok(field('text', { format: 'email' }), 'a@b.co')).toBe('a@b.co');
    bad(field('text', { format: 'email' }), 'nope');
    ok(field('text', { format: 'url' }), 'https://example.com/x');
    bad(field('text', { format: 'url' }), 'javascript:alert(1)');
    ok(field('text', { format: 'slug' }), 'hello-world-2');
    bad(field('text', { format: 'slug' }), 'Hello World');
  });

  it('integer: whole safe numbers within bounds', () => {
    expect(ok(field('integer', { min: 0 }), 5)).toBe(5);
    bad(field('integer'), 1.5);
    bad(field('integer'), '5');
    bad(field('integer', { min: 0 }), -1);
    bad(field('integer'), Number.MAX_SAFE_INTEGER + 2);
  });

  it('decimal: normalizes to fixed-scale strings', () => {
    const price = field('decimal', { min: 0, scale: 2 });
    expect(ok(price, 19.9)).toBe('19.90');
    expect(ok(price, '0019.99')).toBe('19.99');
    expect(ok(price, 0)).toBe('0.00');
    expect(ok(field('decimal', { scale: 0 }), '12')).toBe('12');
    expect(bad(price, -1)).toMatch(/at least 0/);
    expect(bad(price, '1.999')).toMatch(/decimal places/);
    bad(price, 'abc');
    bad(price, '1e5');
    bad(price, Number.NaN);
  });

  it('boolean: only real booleans', () => {
    expect(ok(field('boolean'), false)).toBe(false);
    bad(field('boolean'), 'true');
  });

  it('date: valid calendar dates within bounds', () => {
    expect(ok(field('date'), '2024-02-29')).toBe('2024-02-29');
    bad(field('date'), '2023-02-29');
    bad(field('date'), '2024-2-1');
    bad(field('date', { min: '2024-01-01' }), '2023-12-31');
  });

  it('datetime: normalizes to UTC ISO strings', () => {
    expect(ok(field('datetime'), '2024-05-01T10:00:00+02:00')).toBe('2024-05-01T08:00:00.000Z');
    bad(field('datetime'), '2024-05-01');
  });

  it('select and multiselect: only configured options', () => {
    const opts = {
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
      ],
    };
    expect(ok(field('select', opts), 'draft')).toBe('draft');
    bad(field('select', opts), 'archived');
    expect(ok(field('multiselect', opts), ['draft', 'published'])).toEqual(['draft', 'published']);
    bad(field('multiselect', opts), ['draft', 'draft']);
    bad(field('multiselect', { ...opts, maxItems: 1 }), ['draft', 'published']);
  });

  it('relation and media: UUID references', () => {
    const id = '7b0a2a4e-7d4b-4b8c-9a46-0f1f7c3e9a11';
    const target = '00000000-0000-4000-8000-000000000000';
    expect(ok(field('relation', { targetEntityId: target }), id)).toBe(id);
    bad(field('relation', { targetEntityId: target }), 'not-a-uuid');
    expect(ok(field('relation', { targetEntityId: target, cardinality: 'many' }), [id])).toEqual([
      id,
    ]);
    bad(field('relation', { targetEntityId: target, cardinality: 'many' }), [id, id]);
    expect(ok(field('media', { multiple: true }), [id])).toEqual([id]);
  });
});
