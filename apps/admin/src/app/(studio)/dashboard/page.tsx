'use client';

import type { EntityDefinition, PageMeta } from '@bytecontent/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Alert, Card, EmptyState, Loading, PageHeader } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useEntities } from '@/lib/queries';
import { useSession } from '@/lib/session';

function EntityCount({ entity }: { entity: EntityDefinition }) {
  const count = useQuery({
    queryKey: ['records', entity.key, 'count'],
    queryFn: async () =>
      (
        await api.request<{ meta: PageMeta }>(`/entities/${entity.key}/records`, {
          query: { pageSize: 1 },
        })
      ).meta.total,
  });
  return <span className="text-2xl font-semibold text-slate-900">{count.data ?? '–'}</span>;
}

export default function DashboardPage() {
  const { session, can } = useSession();
  const entities = useEntities(!!session?.activeTenant && can('metadata:read'));

  if (!session?.activeTenant) {
    return (
      <>
        <PageHeader title={`Welcome, ${session?.user.name ?? ''}`} />
        <Alert tone="info">
          You are not a member of any active tenant yet. Ask an administrator to invite you.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${session.activeTenant.name} · signed in as ${session.activeTenant.role}`}
      />
      {entities.isLoading ? (
        <Loading />
      ) : (entities.data ?? []).length === 0 ? (
        <EmptyState title="No content types yet">
          {can('metadata:write') ? (
            <Link href="/schema" className="font-medium text-brand-600 hover:underline">
              Create your first entity
            </Link>
          ) : (
            'An administrator needs to define entities first.'
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entities.data!.map((entity) => (
            <Link key={entity.id} href={`/content/${entity.key}`}>
              <Card className="p-4 transition-shadow hover:shadow-md">
                <p className="text-sm text-slate-600">{entity.pluralName}</p>
                <EntityCount entity={entity} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
