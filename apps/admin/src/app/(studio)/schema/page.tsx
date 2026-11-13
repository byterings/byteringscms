'use client';

import type { EntityDefinition } from '@byteringscms/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Loading,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys, useEntities } from '@/lib/queries';
import { useSession } from '@/lib/session';

function toEntityKey(name: string): string {
  const key = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return (/^[a-z]/.test(key) ? key : `e-${key}`).slice(0, 63);
}

function CreateEntityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [pluralName, setPluralName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () =>
      api.request<{ data: EntityDefinition }>('/admin/entities', {
        method: 'POST',
        body: { name, key, pluralName: pluralName || undefined },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: keys.entities });
      router.push(`/schema/${res.data.id}`);
    },
    onError: (error) => setErrors(fieldErrors(error)),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Create entity">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          mutation.mutate();
        }}
      >
        {mutation.isError ? <Alert>{errorMessage(mutation.error)}</Alert> : null}
        <FormField
          label="Name"
          htmlFor="entity-name"
          required
          error={errors.name}
          hint="Singular, e.g. Product"
        >
          <Input
            id="entity-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!keyTouched) setKey(toEntityKey(e.target.value));
            }}
          />
        </FormField>
        <FormField
          label="Plural name"
          htmlFor="entity-plural"
          error={errors.pluralName}
          hint={`Defaults to ${name ? `${name}s` : '“Names”'}`}
        >
          <Input
            id="entity-plural"
            value={pluralName}
            onChange={(e) => setPluralName(e.target.value)}
          />
        </FormField>
        <FormField
          label="API key"
          htmlFor="entity-key"
          required
          error={errors.key}
          hint={`Records live at /api/v1/entities/${key || '…'}/records`}
        >
          <Input
            id="entity-key"
            className="font-mono"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setKeyTouched(true);
            }}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create entity
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function SchemaPage() {
  const { can } = useSession();
  const entities = useEntities();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Schema"
        description="Entities define the content types of this workspace."
        actions={
          can('metadata:write') ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New entity
            </Button>
          ) : null
        }
      />
      {entities.isLoading ? (
        <Loading />
      ) : entities.isError ? (
        <Alert>{errorMessage(entities.error)}</Alert>
      ) : (entities.data ?? []).length === 0 ? (
        <EmptyState title="No entities yet">
          Create an entity such as “Product” or “Article” to get started.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>API key</Th>
              <Th>Fields</Th>
              <Th>Status</Th>
              <Th>Version</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entities.data!.map((entity) => (
              <tr key={entity.id}>
                <Td>
                  <Link
                    href={`/schema/${entity.id}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {entity.name}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">{entity.key}</Td>
                <Td>{entity.fields.length}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Badge tone={entity.status === 'active' ? 'green' : 'gray'}>
                      {entity.status}
                    </Badge>
                    {entity.publicRead ? <Badge tone="blue">public</Badge> : null}
                    {entity.owner !== 'tenant' ? <Badge tone="amber">{entity.owner}</Badge> : null}
                  </div>
                </Td>
                <Td>v{entity.version}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {creating ? <CreateEntityDialog open onClose={() => setCreating(false)} /> : null}
    </>
  );
}
