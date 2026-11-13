'use client';

import type { TemplateInfo } from '@byteringscms/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Loading,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { keys } from '@/lib/queries';

function TemplateCard({ template }: { template: TemplateInfo }) {
  const queryClient = useQueryClient();
  const [sampleData, setSampleData] = useState(true);
  const install = useMutation({
    mutationFn: () =>
      api.request(`/admin/templates/${template.id}/install`, {
        method: 'POST',
        body: { sampleData },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: keys.entities });
    },
  });
  const installed = template.installedVersion !== null;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{template.name}</h2>
          <p className="text-xs text-slate-500">
            {template.id} · v{template.version}
          </p>
        </div>
        {installed ? (
          <Badge tone="green">Installed v{template.installedVersion}</Badge>
        ) : (
          <Badge>Available</Badge>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-700">{template.description}</p>
      <p className="mt-3 text-xs text-slate-500">Entities: {template.entities.join(', ')}</p>
      {install.isError ? (
        <div className="mt-3">
          <Alert>{errorMessage(install.error)}</Alert>
        </div>
      ) : null}
      {install.isSuccess ? (
        <div className="mt-3">
          <Alert tone="success">Installed. The new entities are in the sidebar.</Alert>
        </div>
      ) : null}
      {!installed ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Checkbox
            label="Include sample content"
            checked={sampleData}
            onChange={(e) => setSampleData(e.target.checked)}
          />
          <Button loading={install.isPending} onClick={() => install.mutate()}>
            Install {template.name}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export default function TemplatesPage() {
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.request<{ data: TemplateInfo[] }>('/admin/templates')).data,
  });
  return (
    <>
      <PageHeader
        title="Templates"
        description="Templates install ready-made content types. Your own changes are kept when templates are upgraded."
      />
      {templates.isLoading ? (
        <Loading />
      ) : templates.isError ? (
        <Alert>{errorMessage(templates.error)}</Alert>
      ) : templates.data!.length === 0 ? (
        <EmptyState title="No templates available" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.data!.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </>
  );
}
