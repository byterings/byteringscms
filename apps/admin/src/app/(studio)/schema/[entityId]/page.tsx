'use client';

import {
  FIELD_TYPE_INFO,
  fieldConfigSchemas,
  type EntityDefinition,
  type FieldDefinition,
} from '@bytecontent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { FieldDialog } from '@/components/field-dialog';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Loading,
  PageHeader,
  Select,
  Table,
  Td,
  Textarea,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys, useEntity } from '@/lib/queries';
import { useSession } from '@/lib/session';

function SettingsDialog({ entity, onClose }: { entity: EntityDefinition; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(entity.name);
  const [pluralName, setPluralName] = useState(entity.pluralName);
  const [description, setDescription] = useState(entity.description ?? '');
  const [titleField, setTitleField] = useState(entity.titleField ?? '');
  const [publicRead, setPublicRead] = useState(entity.publicRead);
  const [publishField, setPublishField] = useState(entity.publishField ?? '');
  const [publishValue, setPublishValue] = useState(entity.publishValue ?? '');
  const [status, setStatus] = useState(entity.status);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const publishCandidates = entity.fields.filter(
    (f) => f.type === 'select' || f.type === 'boolean',
  );
  const selectedPublish = entity.fields.find((f) => f.key === publishField);
  const publishOptions =
    selectedPublish?.type === 'boolean'
      ? [
          { value: 'true', label: 'Yes' },
          { value: 'false', label: 'No' },
        ]
      : selectedPublish?.type === 'select'
        ? fieldConfigSchemas.select.parse(selectedPublish.config).options
        : [];

  const mutation = useMutation({
    mutationFn: () =>
      api.request<{ data: EntityDefinition }>(`/admin/entities/${entity.id}`, {
        method: 'PATCH',
        body: {
          name,
          pluralName,
          description: description || null,
          titleField: titleField || null,
          publicRead,
          publishField: publishField || null,
          publishValue: publishField ? publishValue || null : null,
          status,
        },
      }),
    onSuccess: (res) => {
      queryClient.setQueryData(keys.entity(entity.id), res.data);
      void queryClient.invalidateQueries({ queryKey: keys.entities });
      onClose();
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  return (
    <Dialog open onClose={onClose} title="Entity settings" wide>
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
          <FormField label="Name" htmlFor="s-name" required error={errors.name}>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Plural name" htmlFor="s-plural" error={errors.pluralName}>
            <Input
              id="s-plural"
              value={pluralName}
              onChange={(e) => setPluralName(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Description" htmlFor="s-description">
          <Textarea
            id="s-description"
            rows={2}
            className="min-h-0"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Title field"
            htmlFor="s-title"
            error={errors.titleField}
            hint="Shown as the record name in lists."
          >
            <Select id="s-title" value={titleField} onChange={(e) => setTitleField(e.target.value)}>
              <option value="">—</option>
              {entity.fields
                .filter((f) => ['text', 'integer', 'decimal', 'date', 'select'].includes(f.type))
                .map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Status" htmlFor="s-status" hint="Archived entities are read-only.">
            <Select
              id="s-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </Select>
          </FormField>
        </div>
        <fieldset className="rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-700">Public API</legend>
          <Checkbox
            label="Allow anonymous read access"
            checked={publicRead}
            onChange={(e) => setPublicRead(e.target.checked)}
          />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <FormField
              label="Publish field"
              htmlFor="s-publish-field"
              error={errors.publishField}
              hint="Only matching records are public."
            >
              <Select
                id="s-publish-field"
                value={publishField}
                onChange={(e) => setPublishField(e.target.value)}
              >
                <option value="">All records</option>
                {publishCandidates.map((f) => (
                  <option key={f.id} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </FormField>
            {publishField ? (
              <FormField label="Published when" htmlFor="s-publish-value">
                <Select
                  id="s-publish-value"
                  value={publishValue}
                  onChange={(e) => setPublishValue(e.target.value)}
                >
                  <option value="">Select…</option>
                  {publishOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Save settings
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function fieldFlags(field: FieldDefinition) {
  return (
    <div className="flex flex-wrap gap-1">
      {field.required ? <Badge tone="red">required</Badge> : null}
      {field.unique ? <Badge tone="amber">unique</Badge> : null}
      {field.isPublic ? <Badge tone="blue">public</Badge> : null}
      {field.readMinRole !== 'viewer' ? <Badge>read: {field.readMinRole}+</Badge> : null}
      {field.writeMinRole !== 'editor' ? <Badge>write: {field.writeMinRole}+</Badge> : null}
    </div>
  );
}

export default function EntityEditorPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = useSession();
  const entity = useEntity(entityId);
  const [dialog, setDialog] = useState<
    { kind: 'add' } | { kind: 'edit'; field: FieldDefinition } | { kind: 'settings' } | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const writable = can('metadata:write');

  const update = (data: EntityDefinition) => {
    queryClient.setQueryData(keys.entity(entityId), data);
    void queryClient.invalidateQueries({ queryKey: keys.entities });
  };

  const removeField = useMutation({
    mutationFn: (field: FieldDefinition) =>
      api.request<{ data: EntityDefinition }>(`/admin/entities/${entityId}/fields/${field.id}`, {
        method: 'DELETE',
      }),
    onSuccess: (res) => update(res.data),
    onError: (e) => setActionError(errorMessage(e)),
  });

  const reorder = useMutation({
    mutationFn: (fieldIds: string[]) =>
      api.request<{ data: EntityDefinition }>(`/admin/entities/${entityId}/fields/reorder`, {
        method: 'POST',
        body: { fieldIds },
      }),
    onSuccess: (res) => update(res.data),
    onError: (e) => setActionError(errorMessage(e)),
  });

  const removeEntity = useMutation({
    mutationFn: () => api.request(`/admin/entities/${entityId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.entities });
      router.push('/schema');
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  if (entity.isLoading) return <Loading />;
  if (entity.isError || !entity.data) return <Alert>{errorMessage(entity.error)}</Alert>;
  const e = entity.data;

  const move = (index: number, delta: number) => {
    const ids = e.fields.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/schema" className="text-brand-600 hover:underline">
          Schema
        </Link>{' '}
        / {e.name}
      </p>
      <PageHeader
        title={e.name}
        description={
          <>
            <span className="font-mono">/api/v1/entities/{e.key}/records</span> · version{' '}
            {e.version}
            {e.status === 'archived' ? ' · archived' : ''}
          </>
        }
        actions={
          <>
            <Link href={`/content/${e.key}`}>
              <Button variant="secondary">View records</Button>
            </Link>
            {writable ? (
              <>
                <Button variant="secondary" onClick={() => setDialog({ kind: 'settings' })}>
                  Settings
                </Button>
                <Button
                  variant="danger"
                  loading={removeEntity.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete entity “${e.name}”? This cannot be undone.`))
                      removeEntity.mutate();
                  }}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {actionError ? (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      ) : null}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Fields</h2>
        {writable ? (
          <Button size="sm" onClick={() => setDialog({ kind: 'add' })}>
            <Plus className="h-3 w-3" /> Add field
          </Button>
        ) : null}
      </div>
      {e.fields.length === 0 ? (
        <EmptyState title="No fields yet">
          Add fields such as “name”, “price” or “isActive”.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Label</Th>
              <Th>Key</Th>
              <Th>Type</Th>
              <Th>Rules</Th>
              {writable ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {e.fields.map((field, index) => (
              <tr key={field.id} data-testid={`field-row-${field.key}`}>
                <Td className="font-medium">
                  {field.label}
                  {e.titleField === field.key ? (
                    <span className="ml-2">
                      <Badge tone="blue">title</Badge>
                    </span>
                  ) : null}
                </Td>
                <Td className="font-mono text-xs">{field.key}</Td>
                <Td>{FIELD_TYPE_INFO[field.type].label}</Td>
                <Td>{fieldFlags(field)}</Td>
                {writable ? (
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${field.label} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Move ${field.label} down`}
                        disabled={index === e.fields.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${field.label}`}
                        onClick={() => setDialog({ kind: 'edit', field })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${field.label}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete field “${field.label}”? Its values are removed from every record.`,
                            )
                          ) {
                            setActionError(null);
                            removeField.mutate(field);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {dialog?.kind === 'add' ? (
        <FieldDialog entity={e} open onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'edit' ? (
        <FieldDialog entity={e} field={dialog.field} open onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'settings' ? (
        <SettingsDialog entity={e} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}
