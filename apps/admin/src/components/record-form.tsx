'use client';

import {
  roleAtLeast,
  validateFieldValue,
  type EntityDefinition,
  type FieldDefinition,
  type RecordItem,
} from '@byteringscms/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { FieldInput } from './field-input';
import { Alert, Button, Card, FormField } from './ui';

function initialValues(entity: EntityDefinition, record?: RecordItem): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of entity.fields) {
    values[field.key] = record ? (record.data[field.key] ?? null) : (field.defaultValue ?? null);
  }
  return values;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Create/edit form generated from entity metadata. Uses the shared contract
 * validators for immediate feedback; the API re-validates everything and its
 * errors are mapped back onto the fields.
 */
export function RecordForm({
  entity,
  record,
  onSaved,
}: {
  entity: EntityDefinition;
  record?: RecordItem;
  onSaved: (record: RecordItem) => void;
}) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const role = session?.activeTenant?.role ?? 'viewer';
  const [values, setValues] = useState(() => initialValues(entity, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initial = initialValues(entity, record);

  // The API only returns fields this user may read.
  const visible: FieldDefinition[] = record
    ? entity.fields.filter((f) => f.key in record.data)
    : entity.fields.filter((f) => roleAtLeast(role, f.readMinRole));
  const canWrite = (field: FieldDefinition) => roleAtLeast(role, field.writeMinRole);

  const mutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = record
        ? await api.request<{ data: RecordItem }>(`/entities/${entity.key}/records/${record.id}`, {
            method: 'PATCH',
            body: { data, version: record.version },
          })
        : await api.request<{ data: RecordItem }>(`/entities/${entity.key}/records`, {
            method: 'POST',
            body: { data },
          });
      return res.data;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: keys.records(entity.key) });
      queryClient.setQueryData(keys.record(entity.key, saved.id), saved);
      onSaved(saved);
    },
    onError: (error) => setErrors(fieldErrors(error, 'data.')),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    const payload: Record<string, unknown> = {};
    for (const field of visible) {
      if (!canWrite(field)) continue;
      const value = values[field.key];
      if (record && sameValue(value, initial[field.key])) continue;
      const result = validateFieldValue(
        { key: field.key, type: field.type, required: field.required, config: field.config },
        value,
      );
      if (!result.ok) nextErrors[field.key] = result.message;
      else if (!record && result.value === null) continue;
      else payload[field.key] = value === undefined ? null : value;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) mutation.mutate(payload);
  };

  const conflict =
    mutation.error && (mutation.error as { code?: string }).code === 'RECORD_VERSION_CONFLICT';

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Card className="space-y-5 p-6">
        {mutation.isError ? (
          <Alert>
            {conflict
              ? 'Someone else changed this record. Reload the page to get the latest version.'
              : errorMessage(mutation.error)}
          </Alert>
        ) : null}
        {visible.map((field) => (
          <FormField
            key={field.id}
            label={field.label}
            htmlFor={`f-${field.key}`}
            required={field.required}
            error={errors[field.key]}
            hint={!canWrite(field) ? 'Read-only for your role.' : field.description}
          >
            <FieldInput
              id={`f-${field.key}`}
              field={field}
              value={values[field.key]}
              invalid={!!errors[field.key]}
              disabled={!canWrite(field)}
              onChange={(value) => {
                setValues((current) => ({ ...current, [field.key]: value }));
                if (errors[field.key]) setErrors(({ [field.key]: _removed, ...rest }) => rest);
              }}
            />
          </FormField>
        ))}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="submit" loading={mutation.isPending}>
            {record ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </Card>
    </form>
  );
}
