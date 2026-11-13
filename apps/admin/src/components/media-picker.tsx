'use client';

import type { InputField } from './field-input';
import { Input } from './ui';

/**
 * Media value input. Phase 4 accepts media IDs; Phase 7 replaces this with
 * a picker backed by the media library.
 */
export function MediaPicker({
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
  const many = field.config.multiple === true;
  const text = Array.isArray(value) ? value.join(', ') : ((value as string | null) ?? '');
  return (
    <Input
      id={id}
      disabled={disabled}
      placeholder={many ? 'Media IDs, comma-separated' : 'Media ID'}
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
