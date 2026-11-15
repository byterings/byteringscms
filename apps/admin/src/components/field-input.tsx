'use client';

import type { FieldType } from '@bytecontent/contracts';
import { Checkbox, Input, Select, Textarea } from './ui';
import { RelationPicker } from './relation-picker';
import { MediaPicker } from './media-picker';

export interface InputField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  config: Record<string, unknown>;
}

interface Props {
  id: string;
  field: InputField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  invalid?: boolean;
}

type Option = { value: string; label: string };

function toLocalDateTime(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalDateTime(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

/**
 * Renders the input control for a field type. Values are kept in their API
 * representation (decimal strings, ISO date-times, arrays for multi-values)
 * so the shared contract validators can check them before submission.
 */
export function FieldInput({ id, field, value, onChange, disabled, invalid }: Props) {
  const common = {
    id,
    disabled,
    'aria-invalid': invalid || undefined,
    'aria-required': field.required || undefined,
    'aria-describedby': invalid ? `${id}-error` : undefined,
  };
  const config = field.config;

  switch (field.type) {
    case 'text': {
      const format = config.format as string | undefined;
      return (
        <Input
          {...common}
          type={format === 'email' ? 'email' : format === 'url' ? 'url' : 'text'}
          maxLength={(config.maxLength as number | undefined) ?? undefined}
          value={(value as string | null) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    }
    case 'longtext':
      return (
        <Textarea
          {...common}
          rows={8}
          className={config.markdown ? 'font-mono' : undefined}
          value={(value as string | null) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    case 'integer':
      return (
        <Input
          {...common}
          type="number"
          step={1}
          inputMode="numeric"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(null);
            const num = Number(raw);
            onChange(Number.isFinite(num) ? num : raw);
          }}
        />
      );
    case 'decimal':
      return (
        <Input
          {...common}
          inputMode="decimal"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value.trim())}
        />
      );
    case 'boolean':
      return (
        <div className="pt-1">
          <Checkbox
            id={id}
            label={value ? 'Yes' : 'No'}
            checked={value === true}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
        </div>
      );
    case 'date':
      return (
        <Input
          {...common}
          type="date"
          value={(value as string | null) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        />
      );
    case 'datetime':
      return (
        <Input
          {...common}
          type="datetime-local"
          value={toLocalDateTime(value)}
          onChange={(e) => onChange(fromLocalDateTime(e.target.value))}
        />
      );
    case 'select': {
      const options = (config.options as Option[] | undefined) ?? [];
      return (
        <Select
          {...common}
          value={(value as string | null) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{field.required ? 'Select…' : '—'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    }
    case 'multiselect': {
      const options = (config.options as Option[] | undefined) ?? [];
      const selected = new Set(Array.isArray(value) ? (value as string[]) : []);
      return (
        <div
          id={id}
          className="flex flex-wrap gap-x-4 gap-y-1 pt-1"
          role="group"
          aria-label={field.label}
        >
          {options.map((o) => (
            <Checkbox
              key={o.value}
              label={o.label}
              checked={selected.has(o.value)}
              disabled={disabled}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(o.value);
                else next.delete(o.value);
                const ordered = options.map((opt) => opt.value).filter((v) => next.has(v));
                onChange(ordered.length ? ordered : null);
              }}
            />
          ))}
        </div>
      );
    }
    case 'relation':
      return (
        <RelationPicker
          id={id}
          field={field}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'media':
      return (
        <MediaPicker id={id} field={field} value={value} onChange={onChange} disabled={disabled} />
      );
  }
}

/** Compact read-only rendering of a value for tables. */
export function formatValue(
  type: FieldType,
  value: unknown,
  config: Record<string, unknown>,
): string {
  if (value === null || value === undefined) return '—';
  switch (type) {
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'datetime':
      return typeof value === 'string' ? new Date(value).toLocaleString() : String(value);
    case 'select': {
      const options = (config.options as Option[] | undefined) ?? [];
      return options.find((o) => o.value === value)?.label ?? String(value);
    }
    case 'multiselect': {
      const options = (config.options as Option[] | undefined) ?? [];
      return (value as string[])
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(', ');
    }
    case 'relation':
    case 'media':
      return Array.isArray(value) ? `${value.length} linked` : '1 linked';
    case 'longtext': {
      const text = String(value);
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    }
    default:
      return String(value);
  }
}
