'use client';

import type { AuditEventInfo, PageMeta } from '@byteringscms/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  Loading,
  PageHeader,
  Table,
  Td,
  Th,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { keys } from '@/lib/queries';

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const events = useQuery({
    queryKey: [...keys.audit, page, action],
    queryFn: () =>
      api.request<{ data: AuditEventInfo[]; meta: PageMeta }>('/admin/audit-events', {
        query: { page, pageSize: 50, action: action || undefined },
      }),
    placeholderData: (previous) => previous,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Sensitive operations in this workspace. Values are never recorded, only field names."
      />
      <div className="mb-4">
        <Input
          aria-label="Filter by action"
          placeholder="Filter by action, e.g. record.updated"
          className="max-w-xs"
          value={action}
          onChange={(e) => {
            setAction(e.target.value.trim());
            setPage(1);
          }}
        />
      </div>
      {events.isLoading ? (
        <Loading />
      ) : events.isError ? (
        <Alert>{errorMessage(events.error)}</Alert>
      ) : events.data!.data.length === 0 ? (
        <EmptyState title="No events" />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Action</Th>
                <Th>Actor</Th>
                <Th>Target</Th>
                <Th>Changed fields</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {events.data!.data.map((event) => (
                <tr key={event.id}>
                  <Td className="whitespace-nowrap text-slate-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </Td>
                  <Td>
                    <Badge tone="blue">{event.action}</Badge>
                  </Td>
                  <Td className="text-xs">
                    {event.actorType}
                    {event.actorId ? (
                      <span className="block font-mono text-slate-500">{event.actorId}</span>
                    ) : null}
                  </Td>
                  <Td className="text-xs">
                    {event.targetType}
                    {event.targetId ? (
                      <span className="block font-mono text-slate-500">{event.targetId}</span>
                    ) : null}
                  </Td>
                  <Td className="text-xs">{event.changedKeys.join(', ') || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {events.data!.meta.page} of {events.data!.meta.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= events.data!.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </>
  );
}
