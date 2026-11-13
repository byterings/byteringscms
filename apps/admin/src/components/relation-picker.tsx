'use client';

import type { InputField } from './field-input';
import { Input } from './ui';

/**
 * Relation value input. Phase 4 accepts record IDs; Phase 5 replaces this
 * with a searchable picker over the target entity.
 */
export function RelationPicker({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string;
  field: InputField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const many = field.config.cardinality === 'many';
  const text = Array.isArray(value) ? value.join(', ') : ((value as string | null) ?? '');
  return (
    <Input
      id={id}
      disabled={disabled}
      placeholder={many ? 'Record IDs, comma-separated' : 'Record ID'}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return onChange(null);
        onChange(
          many
            ? raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : raw,
        );
      }}
    />
  );
}
