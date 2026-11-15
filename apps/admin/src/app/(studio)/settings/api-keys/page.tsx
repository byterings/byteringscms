'use client';

import {
  API_KEY_SCOPES,
  type ApiKeyInfo,
  type ApiKeyScope,
  type CreatedApiKey,
} from '@bytecontent/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
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
  Table,
  Td,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys } from '@/lib/queries';

function CreateKeyDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>(['records:read']);
  const [expiresAt, setExpiresAt] = useState('');
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: CreatedApiKey }>('/admin/api-keys', {
          method: 'POST',
          body: {
            name,
            scopes,
            expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          },
        })
      ).data,
    onSuccess: (data) => {
      setCreated(data);
      void queryClient.invalidateQueries({ queryKey: keys.apiKeys });
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });

  if (created) {
    return (
      <Dialog open onClose={onClose} title="API key created">
        <div className="space-y-3">
          <Alert tone="warning">Copy this key now. It will not be shown again.</Alert>
          <Input
            readOnly
            aria-label="API key"
            className="font-mono text-xs"
            value={created.key}
            onFocus={(e) => e.target.select()}
          />
          <p className="text-xs text-slate-600">
            Send it as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title="Create API key">
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
          htmlFor="k-name"
          required
          error={errors.name}
          hint="e.g. Website production"
        >
          <Input id="k-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Scopes</legend>
          <div className="grid grid-cols-2 gap-1">
            {API_KEY_SCOPES.map((scope) => (
              <Checkbox
                key={scope}
                label={scope}
                checked={scopes.includes(scope)}
                onChange={(e) =>
                  setScopes((s) =>
                    e.target.checked ? [...s, scope] : s.filter((x) => x !== scope),
                  )
                }
              />
            ))}
          </div>
          {errors.scopes ? <p className="mt-1 text-xs text-red-600">{errors.scopes}</p> : null}
        </fieldset>
        <FormField label="Expires" htmlFor="k-expires" error={errors.expiresAt} hint="Optional">
          <Input
            id="k-expires"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create key
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const keysQuery = useQuery({
    queryKey: keys.apiKeys,
    queryFn: async () => (await api.request<{ data: ApiKeyInfo[] }>('/admin/api-keys')).data,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.request(`/admin/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.apiKeys }),
  });

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys let websites, apps and scripts access this workspace's API."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New API key
          </Button>
        }
      />
      {revoke.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(revoke.error)}</Alert>
        </div>
      ) : null}
      {keysQuery.isLoading ? (
        <Loading />
      ) : keysQuery.isError ? (
        <Alert>{errorMessage(keysQuery.error)}</Alert>
      ) : keysQuery.data!.length === 0 ? (
        <EmptyState title="No API keys yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Key</Th>
              <Th>Scopes</Th>
              <Th>Last used</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keysQuery.data!.map((k) => {
              const expired = k.expiresAt !== null && new Date(k.expiresAt) <= new Date();
              return (
                <tr key={k.id}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}_…</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="text-slate-500">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                  </Td>
                  <Td>
                    {k.revokedAt ? (
                      <Badge tone="red">revoked</Badge>
                    ) : expired ? (
                      <Badge tone="amber">expired</Badge>
                    ) : (
                      <Badge tone="green">active</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {!k.revokedAt ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.confirm(
                            `Revoke “${k.name}”? Clients using it stop working immediately.`,
                          ) && revoke.mutate(k.id)
                        }
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {creating ? <CreateKeyDialog onClose={() => setCreating(false)} /> : null}
    </>
  );
}
