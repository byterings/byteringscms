'use client';

import type {
  PluginInfo,
  TemplateInfo,
  TemplateUpgradeRecord,
  UpgradeItem,
  UpgradePlan,
} from '@bytecontent/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  Loading,
  PageHeader,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { keys } from '@/lib/queries';

const ACTION_LABELS: Record<
  UpgradeItem['action'],
  { label: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'gray' }
> = {
  createEntity: { label: 'New entity', tone: 'green' },
  createField: { label: 'New field', tone: 'green' },
  updateEntity: { label: 'Update', tone: 'blue' },
  updateField: { label: 'Update', tone: 'blue' },
  skipOverridden: { label: 'Kept (customized)', tone: 'gray' },
  deprecated: { label: 'Deprecated', tone: 'amber' },
  conflict: { label: 'Conflict', tone: 'red' },
};

function UpgradeDialog({ template, onClose }: { template: TemplateInfo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [accept, setAccept] = useState(false);
  const plan = useQuery({
    queryKey: ['templates', template.id, 'plan'],
    queryFn: async () =>
      (await api.request<{ data: UpgradePlan }>(`/admin/templates/${template.id}/upgrade-plan`))
        .data,
  });
  const history = useQuery({
    queryKey: ['templates', template.id, 'history'],
    queryFn: async () =>
      (
        await api.request<{ data: TemplateUpgradeRecord[] }>(
          `/admin/templates/${template.id}/upgrades`,
        )
      ).data,
  });
  const upgrade = useMutation({
    mutationFn: () =>
      api.request(`/admin/templates/${template.id}/upgrade`, {
        method: 'POST',
        body: { acceptBreaking: accept },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: keys.entities });
      onClose();
    },
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: ['templates', template.id, 'history'] }),
  });

  return (
    <Dialog open onClose={onClose} title={`Upgrade ${template.name}`} wide>
      {plan.isLoading ? (
        <Loading />
      ) : plan.isError ? (
        <Alert>{errorMessage(plan.error)}</Alert>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            From <strong>v{plan.data!.fromVersion}</strong> to{' '}
            <strong>v{plan.data!.toVersion}</strong>. Your records, your own fields and your
            customized definitions are kept.
          </p>
          {plan.data!.changelog.map((entry) => (
            <div key={entry.version} className="rounded-md bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium">v{entry.version}</span> — {entry.notes}
            </div>
          ))}
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {plan.data!.items.map((item, index) => (
              <li key={index} className="flex items-start gap-3 px-3 py-2 text-sm">
                <Badge tone={ACTION_LABELS[item.action].tone}>
                  {ACTION_LABELS[item.action].label}
                </Badge>
                <div className="min-w-0">
                  <p className="font-mono text-xs">
                    {item.entity}
                    {item.field ? `.${item.field}` : ''}
                    {item.changes?.length ? ` (${item.changes.join(', ')})` : ''}
                  </p>
                  {item.message ? <p className="text-xs text-slate-500">{item.message}</p> : null}
                </div>
                {item.breaking && item.action !== 'conflict' ? (
                  <span className="ml-auto">
                    <Badge tone="amber">breaking</Badge>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {plan.data!.conflicts > 0 ? (
            <Alert>
              The upgrade has {plan.data!.conflicts} conflict(s) that need a manual fix before
              upgrading.
            </Alert>
          ) : plan.data!.breaking ? (
            <Checkbox
              label="I understand this upgrade contains breaking changes"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
            />
          ) : null}
          {upgrade.isError ? <Alert>{errorMessage(upgrade.error)}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={upgrade.isPending}
              disabled={plan.data!.conflicts > 0 || (plan.data!.breaking && !accept)}
              onClick={() => upgrade.mutate()}
            >
              Upgrade to v{plan.data!.toVersion}
            </Button>
          </div>
          {history.data?.length ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold">History</h3>
              <ul className="space-y-1 text-xs text-slate-600">
                {history.data.map((h) => (
                  <li key={h.id}>
                    <Badge tone={h.status === 'applied' ? 'green' : 'red'}>{h.status}</Badge> v
                    {h.fromVersion} → v{h.toVersion} · {new Date(h.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

function TemplateCard({ template }: { template: TemplateInfo }) {
  const queryClient = useQueryClient();
  const [sampleData, setSampleData] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
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
  const upgradable = installed && template.installedVersion !== template.version;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{template.name}</h2>
          <p className="text-xs text-slate-500">
            {template.id} · v{template.version}
          </p>
        </div>
        {upgradable ? (
          <Badge tone="amber">Upgrade available</Badge>
        ) : installed ? (
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
      ) : (
        <div className="mt-4 flex justify-end">
          <Button
            variant={upgradable ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setUpgrading(true)}
          >
            {upgradable ? `Review upgrade to v${template.version}` : 'Upgrade history'}
          </Button>
        </div>
      )}
      {upgrading ? <UpgradeDialog template={template} onClose={() => setUpgrading(false)} /> : null}
    </Card>
  );
}

function PluginsSection() {
  const queryClient = useQueryClient();
  const plugins = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => (await api.request<{ data: PluginInfo[] }>('/admin/plugins')).data,
  });
  const toggle = useMutation({
    mutationFn: (plugin: PluginInfo) =>
      api.request(`/admin/plugins/${plugin.id}/${plugin.enabled ? 'disable' : 'enable'}`, {
        method: 'POST',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plugins'] }),
  });
  return (
    <section className="mt-10">
      <h2 className="mb-1 text-lg font-semibold">Plugins</h2>
      <p className="mb-4 text-sm text-slate-600">
        Plugins are installed on the server by your administrator. Enable them per workspace.
      </p>
      {toggle.isError ? (
        <div className="mb-3">
          <Alert>{errorMessage(toggle.error)}</Alert>
        </div>
      ) : null}
      {plugins.isLoading ? (
        <Loading />
      ) : (plugins.data ?? []).length === 0 ? (
        <EmptyState title="No plugins installed on this server" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plugins.data!.map((plugin) => (
            <Card key={plugin.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{plugin.name}</h3>
                  <p className="text-xs text-slate-500">
                    {plugin.id} · v{plugin.version}
                  </p>
                </div>
                <Badge tone={plugin.enabled ? 'green' : 'gray'}>
                  {plugin.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-700">{plugin.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Capabilities: {plugin.capabilities.join(', ')}
                {plugin.entities ? ` · Applies to: ${plugin.entities.join(', ')}` : ''}
              </p>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant={plugin.enabled ? 'secondary' : 'primary'}
                  loading={toggle.isPending && toggle.variables?.id === plugin.id}
                  onClick={() => toggle.mutate(plugin)}
                >
                  {plugin.enabled ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
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
        title="Templates & plugins"
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
      <PluginsSection />
    </>
  );
}
