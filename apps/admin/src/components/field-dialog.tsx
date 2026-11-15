'use client';

import {
  FIELD_TYPE_INFO,
  FIELD_TYPES,
  MEDIA_KINDS,
  ROLES,
  TEXT_FORMATS,
  type EntityDefinition,
  type FieldDefinition,
  type FieldType,
  type Role,
} from '@bytecontent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys, useEntities } from '@/lib/queries';
import { FieldInput } from './field-input';
import { Alert, Button, Checkbox, Dialog, FormField, Input, Select, Textarea } from './ui';

type Config = Record<string, unknown>;
type Option = { value: string; label: string };

export function toCamelKey(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const key = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return /^[a-z]/.test(key) ? key.slice(0, 63) : `f${key}`.slice(0, 63);
}

function optionValue(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function NumberInput({
  id,
  value,
  onChange,
  step,
}: {
  id: string;
  value: unknown;
  onChange: (v: number | undefined) => void;
  step?: number;
}) {
  return (
    <Input
      id={id}
      type="number"
      step={step ?? 'any'}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: Option[];
  onChange: (o: Option[]) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((option, index) => (
        <div key={index} className="flex gap-2">
          <Input
            aria-label={`Option ${index + 1} label`}
            placeholder="Label"
            value={option.label}
            onChange={(e) => {
              const next = [...options];
              // Keep deriving the value from the label until the user edits it.
              const autoValue = !option.value || option.value === optionValue(option.label);
              next[index] = {
                label: e.target.value,
                value: autoValue ? optionValue(e.target.value) : option.value,
              };
              onChange(next);
            }}
          />
          <Input
            aria-label={`Option ${index + 1} value`}
            placeholder="value"
            className="font-mono"
            value={option.value}
            onChange={(e) => {
              const next = [...options];
              next[index] = { ...option, value: e.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label="Remove option"
            onClick={() => onChange(options.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...options, { value: '', label: '' }])}
      >
        <Plus className="h-3 w-3" /> Add option
      </Button>
    </div>
  );
}

function ConfigEditor({
  type,
  config,
  setConfig,
  entities,
  errors,
  lockRelation,
}: {
  type: FieldType;
  config: Config;
  setConfig: (c: Config) => void;
  entities: EntityDefinition[];
  errors: Record<string, string>;
  lockRelation: boolean;
}) {
  const set = (key: string, value: unknown) => {
    const next = { ...config };
    if (value === undefined) delete next[key];
    else next[key] = value;
    setConfig(next);
  };
  const err = (key: string) => errors[`config.${key}`];

  switch (type) {
    case 'text':
      return (
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Format" htmlFor="cfg-format">
            <Select
              id="cfg-format"
              value={(config.format as string) ?? 'plain'}
              onChange={(e) => set('format', e.target.value)}
            >
              {TEXT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Min length" htmlFor="cfg-minLength" error={err('minLength')}>
            <NumberInput
              id="cfg-minLength"
              step={1}
              value={config.minLength}
              onChange={(v) => set('minLength', v)}
            />
          </FormField>
          <FormField label="Max length" htmlFor="cfg-maxLength" error={err('maxLength')}>
            <NumberInput
              id="cfg-maxLength"
              step={1}
              value={config.maxLength}
              onChange={(v) => set('maxLength', v)}
            />
          </FormField>
        </div>
      );
    case 'longtext':
      return (
        <div className="grid grid-cols-2 items-end gap-3">
          <FormField label="Max length" htmlFor="cfg-maxLength" error={err('maxLength')}>
            <NumberInput
              id="cfg-maxLength"
              step={1}
              value={config.maxLength}
              onChange={(v) => set('maxLength', v)}
            />
          </FormField>
          <Checkbox
            label="Markdown"
            checked={config.markdown === true}
            onChange={(e) => set('markdown', e.target.checked)}
          />
        </div>
      );
    case 'integer':
    case 'decimal':
      return (
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Minimum" htmlFor="cfg-min" error={err('min')}>
            <NumberInput
              id="cfg-min"
              step={type === 'integer' ? 1 : undefined}
              value={config.min}
              onChange={(v) => set('min', v)}
            />
          </FormField>
          <FormField label="Maximum" htmlFor="cfg-max" error={err('max')}>
            <NumberInput
              id="cfg-max"
              step={type === 'integer' ? 1 : undefined}
              value={config.max}
              onChange={(v) => set('max', v)}
            />
          </FormField>
          {type === 'decimal' ? (
            <FormField label="Decimal places" htmlFor="cfg-scale" error={err('scale')}>
              <NumberInput
                id="cfg-scale"
                step={1}
                value={config.scale ?? 2}
                onChange={(v) => set('scale', v)}
              />
            </FormField>
          ) : null}
        </div>
      );
    case 'date':
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Earliest" htmlFor="cfg-min" error={err('min')}>
            <Input
              id="cfg-min"
              type="date"
              value={(config.min as string) ?? ''}
              onChange={(e) => set('min', e.target.value || undefined)}
            />
          </FormField>
          <FormField label="Latest" htmlFor="cfg-max" error={err('max')}>
            <Input
              id="cfg-max"
              type="date"
              value={(config.max as string) ?? ''}
              onChange={(e) => set('max', e.target.value || undefined)}
            />
          </FormField>
        </div>
      );
    case 'select':
    case 'multiselect':
      return (
        <div className="space-y-3">
          <FormField
            label="Options"
            htmlFor="cfg-options"
            error={
              err('options') ??
              Object.entries(errors).find(([k]) => k.startsWith('config.options'))?.[1]
            }
          >
            <OptionsEditor
              options={(config.options as Option[]) ?? []}
              onChange={(o) => set('options', o)}
            />
          </FormField>
          {type === 'multiselect' ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Min selected" htmlFor="cfg-minItems" error={err('minItems')}>
                <NumberInput
                  id="cfg-minItems"
                  step={1}
                  value={config.minItems}
                  onChange={(v) => set('minItems', v)}
                />
              </FormField>
              <FormField label="Max selected" htmlFor="cfg-maxItems" error={err('maxItems')}>
                <NumberInput
                  id="cfg-maxItems"
                  step={1}
                  value={config.maxItems}
                  onChange={(v) => set('maxItems', v)}
                />
              </FormField>
            </div>
          ) : null}
        </div>
      );
    case 'relation':
      return (
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Target entity"
            htmlFor="cfg-target"
            required
            error={err('targetEntityId')}
          >
            <Select
              id="cfg-target"
              disabled={lockRelation}
              value={(config.targetEntityId as string) ?? ''}
              onChange={(e) => set('targetEntityId', e.target.value || undefined)}
            >
              <option value="">Select…</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Cardinality" htmlFor="cfg-cardinality">
            <Select
              id="cfg-cardinality"
              disabled={lockRelation}
              value={(config.cardinality as string) ?? 'one'}
              onChange={(e) => set('cardinality', e.target.value)}
            >
              <option value="one">One record</option>
              <option value="many">Many records</option>
            </Select>
          </FormField>
        </div>
      );
    case 'media':
      return (
        <div className="space-y-2">
          <Checkbox
            label="Allow multiple files"
            checked={config.multiple === true}
            onChange={(e) => set('multiple', e.target.checked)}
          />
          <div className="flex flex-wrap gap-4">
            {MEDIA_KINDS.map((kind) => {
              const accept = (config.accept as string[] | undefined) ?? [];
              return (
                <Checkbox
                  key={kind}
                  label={kind}
                  checked={accept.includes(kind)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...accept, kind]
                      : accept.filter((k) => k !== kind);
                    set('accept', next.length ? next : undefined);
                  }}
                />
              );
            })}
          </div>
        </div>
      );
    default:
      return null;
  }
}

export function FieldDialog({
  entity,
  field,
  open,
  onClose,
}: {
  entity: EntityDefinition;
  field?: FieldDefinition;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const entities = useEntities();
  const editing = !!field;
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState(field?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(editing);
  const [type, setType] = useState<FieldType>(field?.type ?? 'text');
  const [description, setDescription] = useState(field?.description ?? '');
  const [required, setRequired] = useState(field?.required ?? false);
  const [unique, setUnique] = useState(field?.unique ?? false);
  const [isPublic, setIsPublic] = useState(field?.isPublic ?? false);
  const [readMinRole, setReadMinRole] = useState<Role>(field?.readMinRole ?? 'viewer');
  const [writeMinRole, setWriteMinRole] = useState<Role>(field?.writeMinRole ?? 'editor');
  const [config, setConfig] = useState<Config>(field?.config ?? {});
  const [defaultValue, setDefaultValue] = useState<unknown>(field?.defaultValue ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const info = FIELD_TYPE_INFO[type];

  const mutation = useMutation({
    mutationFn: async () => {
      const common = {
        label,
        description: description || null,
        required,
        unique: info.supportsUnique ? unique : false,
        isPublic,
        readMinRole,
        writeMinRole,
        config,
        defaultValue: info.supportsDefault ? defaultValue : null,
      };
      return editing
        ? api.request<{ data: EntityDefinition }>(
            `/admin/entities/${entity.id}/fields/${field!.id}`,
            {
              method: 'PATCH',
              body: common,
            },
          )
        : api.request<{ data: EntityDefinition }>(`/admin/entities/${entity.id}/fields`, {
            method: 'POST',
            body: { ...common, key, type },
          });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(keys.entity(entity.id), res.data);
      void queryClient.invalidateQueries({ queryKey: keys.entities });
      onClose();
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit field “${field!.label}”` : 'Add field'}
      wide
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          mutation.mutate();
        }}
      >
        {mutation.isError ? <Alert>{errorMessage(mutation.error)}</Alert> : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Label" htmlFor="field-label" required error={errors.label}>
            <Input
              id="field-label"
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                if (!keyTouched) setKey(toCamelKey(e.target.value));
              }}
            />
          </FormField>
          <FormField
            label="Key"
            htmlFor="field-key"
            required
            error={errors.key}
            hint={editing ? 'Keys cannot change.' : 'Used in the API.'}
          >
            <Input
              id="field-key"
              className="font-mono"
              disabled={editing}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyTouched(true);
              }}
            />
          </FormField>
        </div>
        <FormField
          label="Type"
          htmlFor="field-type"
          hint={editing ? 'Types cannot change.' : info.description}
        >
          <Select
            id="field-type"
            disabled={editing}
            value={type}
            onChange={(e) => {
              setType(e.target.value as FieldType);
              setConfig({});
              setDefaultValue(null);
            }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_INFO[t].label}
              </option>
            ))}
          </Select>
        </FormField>
        <ConfigEditor
          type={type}
          config={config}
          setConfig={setConfig}
          entities={entities.data ?? []}
          errors={errors}
          lockRelation={editing}
        />
        <FormField label="Help text" htmlFor="field-description">
          <Textarea
            id="field-description"
            rows={2}
            className="min-h-0"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Checkbox
            label="Required"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          {info.supportsUnique ? (
            <Checkbox
              label="Unique"
              checked={unique}
              onChange={(e) => setUnique(e.target.checked)}
            />
          ) : null}
          <Checkbox
            label="Visible in public API"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
        </div>
        {errors.unique ? <p className="text-xs text-red-600">{errors.unique}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Readable by" htmlFor="field-read">
            <Select
              id="field-read"
              value={readMinRole}
              onChange={(e) => setReadMinRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} and above
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Writable by" htmlFor="field-write">
            <Select
              id="field-write"
              value={writeMinRole}
              onChange={(e) => setWriteMinRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} and above
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {info.supportsDefault && !unique && type !== 'relation' && type !== 'media' ? (
          <FormField label="Default value" htmlFor="field-default" error={errors.defaultValue}>
            <FieldInput
              id="field-default"
              field={{ key: 'default', label: 'Default value', type, required: false, config }}
              value={defaultValue}
              onChange={setDefaultValue}
              invalid={!!errors.defaultValue}
            />
          </FormField>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editing ? 'Save field' : 'Add field'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
