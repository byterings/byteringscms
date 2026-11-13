'use client';

import { FIELD_TYPE_INFO, type EntityDefinition, type RecordItem } from '@byteringscms/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatValue } from '@/components/field-input';
import {
  Alert,
  Button,
  Checkbox,
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
import { keys, useEntities, useEntityByKey, useRecords } from '@/lib/queries';
import { recordTitle } from '@/components/relation-picker';
import { useSession } from '@/lib/session';

const PAGE_SIZE = 20;

/** Titles of expanded relation values for table cells. */
function relationLabel(
  value: unknown,
  entities: EntityDefinition[] | undefined,
  config: Record<string, unknown>,
): string {
  if (value === null || value === undefined) return '—';
  const target = entities?.find((e) => e.id === config.targetEntityId);
  const items = (Array.isArray(value) ? value : [value]) as RecordItem[];
  return (
    items
      .map((item) => (typeof item === 'object' ? recordTitle(target, item) : String(item)))
      .join(', ') || '—'
  );
}

export default function RecordListPage() {
  const { entityKey } = useParams<{ entityKey: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, can } = useSession();
  const entity = useEntityByKey(entityKey);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [search, setSearch] = useState('');
  const [trash, setTrash] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const relationKeys = (entity.data?.fields ?? [])
    .filter((f) => f.type === 'relation')
    .slice(0, 5)
    .map((f) => f.key)
    .join(',');
  const records = useRecords(entityKey, {
    page,
    pageSize: PAGE_SIZE,
    sort,
    search: search || undefined,
    deleted: trash,
    expand: relationKeys,
  });
  const allEntities = useEntities();
  const isAdmin =
    session?.activeTenant?.role === 'admin' || session?.activeTenant?.role === 'owner';
  const writable = can('records:write') && entity.data?.status === 'active';

  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'delete' | 'restore' | 'purge' }) =>
      api.request(
        kind === 'delete'
          ? `/entities/${entityKey}/records/${id}`
          : kind === 'restore'
            ? `/entities/${entityKey}/records/${id}/restore`
            : `/entities/${entityKey}/records/${id}/permanent`,
        { method: kind === 'restore' ? 'POST' : 'DELETE' },
      ),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: keys.records(entityKey) });
    },
    onError: (e) => setActionError(errorMessage(e)),
  });

  if (entity.isLoading) return <Loading />;
  if (!entity.data) return <Alert>Entity “{entityKey}” not found.</Alert>;
  const e = entity.data;

  const readable = new Set(Object.keys(records.data?.data[0]?.data ?? {}));
  const columns = e.fields
    .filter((f) => (records.data?.data.length ? readable.has(f.key) : true))
    .filter((f) => f.type !== 'longtext')
    .sort((a, b) => (a.key === e.titleField ? -1 : b.key === e.titleField ? 1 : 0))
    .slice(0, 5);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((current) => (current === key ? `-${key}` : key));
  };
  const sortIcon = (key: string) =>
    sort === key ? (
      <ArrowUp className="h-3 w-3" />
    ) : sort === `-${key}` ? (
      <ArrowDown className="h-3 w-3" />
    ) : null;

  const meta = records.data?.meta;

  return (
    <>
      <PageHeader
        title={trash ? `${e.pluralName} — trash` : e.pluralName}
        description={e.description ?? undefined}
        actions={
          writable && !trash ? (
            <Link href={`/content/${entityKey}/new`}>
              <Button>
                <Plus className="h-4 w-4" /> New {e.name.toLowerCase()}
              </Button>
            </Link>
          ) : null
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          aria-label="Search"
          placeholder="Search…"
          className="max-w-xs"
          value={search}
          onChange={(ev) => {
            setSearch(ev.target.value);
            setPage(1);
          }}
        />
        {isAdmin ? (
          <Checkbox
            label="Show deleted"
            checked={trash}
            onChange={(ev) => {
              setTrash(ev.target.checked);
              setPage(1);
            }}
          />
        ) : null}
      </div>
      {actionError ? (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      ) : null}
      {records.isLoading ? (
        <Loading />
      ) : records.isError ? (
        <Alert>{errorMessage(records.error)}</Alert>
      ) : records.data!.data.length === 0 ? (
        <EmptyState
          title={
            search
              ? 'No matching records'
              : trash
                ? 'Trash is empty'
                : `No ${e.pluralName.toLowerCase()} yet`
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                {columns.map((field) => (
                  <Th key={field.id}>
                    {FIELD_TYPE_INFO[field.type].sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 uppercase"
                        onClick={() => toggleSort(field.key)}
                      >
                        {field.label} {sortIcon(field.key)}
                      </button>
                    ) : (
                      field.label
                    )}
                  </Th>
                ))}
                <Th>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase"
                    onClick={() => toggleSort('updatedAt')}
                  >
                    Updated {sortIcon('updatedAt')}
                  </button>
                </Th>
                {writable ? <Th className="text-right">Actions</Th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.data!.data.map((record: RecordItem) => (
                <tr
                  key={record.id}
                  className={trash ? '' : 'cursor-pointer hover:bg-slate-50'}
                  onClick={() => !trash && router.push(`/content/${entityKey}/${record.id}`)}
                >
                  {columns.map((field, index) => (
                    <Td key={field.id} className={index === 0 ? 'font-medium' : undefined}>
                      {field.type === 'relation'
                        ? relationLabel(record.data[field.key], allEntities.data, field.config)
                        : formatValue(field.type, record.data[field.key], field.config)}
                    </Td>
                  ))}
                  <Td className="whitespace-nowrap text-slate-500">
                    {new Date(record.updatedAt).toLocaleString()}
                  </Td>
                  {writable ? (
                    <Td className="text-right">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {trash ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Restore"
                              onClick={() => action.mutate({ id: record.id, kind: 'restore' })}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Delete permanently"
                              onClick={() =>
                                window.confirm('Permanently delete this record?') &&
                                action.mutate({ id: record.id, kind: 'purge' })
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Delete"
                            onClick={() =>
                              window.confirm('Move this record to the trash?') &&
                              action.mutate({ id: record.id, kind: 'delete' })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
          {meta ? (
            <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
              <span>
                {meta.total} record{meta.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
