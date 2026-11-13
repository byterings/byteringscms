'use client';

import type { Tenant } from '@byteringscms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Card, FormField, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { keys } from '@/lib/queries';
import { SESSION_KEY, useSession } from '@/lib/session';

function TenantSettings() {
  const queryClient = useQueryClient();
  const tenant = useQuery({
    queryKey: keys.tenant,
    queryFn: async () => (await api.request<{ data: Tenant }>('/tenant')).data,
  });
  const [name, setName] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.request('/tenant', { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.tenant });
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    },
  });
  if (!tenant.data) return null;
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">Workspace</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        {mutation.isError ? <Alert>{errorMessage(mutation.error)}</Alert> : null}
        {mutation.isSuccess ? <Alert tone="success">Workspace renamed.</Alert> : null}
        <FormField label="Name" htmlFor="t-name">
          <Input
            id="t-name"
            value={name ?? tenant.data.name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-slate-500">
          Slug: <span className="font-mono">{tenant.data.slug}</span>
        </p>
        <Button
          type="submit"
          loading={mutation.isPending}
          disabled={!name || name === tenant.data.name}
        >
          Save
        </Button>
      </form>
    </Card>
  );
}

function PasswordSettings() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () =>
      api.request('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }),
    onSuccess: () => {
      setCurrent('');
      setNew('');
    },
    onError: (e) => setErrors(fieldErrors(e)),
  });
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-base font-semibold">Change password</h2>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          mutation.mutate();
        }}
      >
        {mutation.isError ? <Alert>{errorMessage(mutation.error)}</Alert> : null}
        {mutation.isSuccess ? (
          <Alert tone="success">Password changed. Other sessions were signed out.</Alert>
        ) : null}
        <FormField label="Current password" htmlFor="p-current" error={errors.currentPassword}>
          <Input
            id="p-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </FormField>
        <FormField
          label="New password"
          htmlFor="p-new"
          error={errors.newPassword}
          hint="At least 12 characters."
        >
          <Input
            id="p-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
          />
        </FormField>
        <Button type="submit" loading={mutation.isPending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const { can } = useSession();
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Account" />
      {can('tenant:manage') ? <TenantSettings /> : null}
      <PasswordSettings />
    </div>
  );
}
