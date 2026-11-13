'use client';

import type { EntityDefinition, PageMeta, RecordItem, SetupStatus } from '@byteringscms/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export const keys = {
  setup: ['setup-status'] as const,
  entities: ['entities'] as const,
  entity: (id: string) => ['entities', id] as const,
  records: (entityKey: string) => ['records', entityKey] as const,
  record: (entityKey: string, id: string) => ['records', entityKey, id] as const,
  members: ['members'] as const,
  apiKeys: ['api-keys'] as const,
  audit: ['audit'] as const,
  tenant: ['tenant'] as const,
};

export function useSetupStatus() {
  return useQuery({
    queryKey: keys.setup,
    queryFn: async () => (await api.request<{ data: SetupStatus }>('/setup/status')).data,
  });
}

export function useEntities(enabled = true) {
  return useQuery({
    queryKey: keys.entities,
    enabled,
    queryFn: async () => (await api.request<{ data: EntityDefinition[] }>('/admin/entities')).data,
  });
}

export function useEntity(id: string) {
  return useQuery({
    queryKey: keys.entity(id),
    queryFn: async () =>
      (await api.request<{ data: EntityDefinition }>(`/admin/entities/${id}`)).data,
  });
}

export function useEntityByKey(entityKey: string) {
  const entities = useEntities();
  return {
    ...entities,
    data: entities.data?.find((e) => e.key === entityKey),
  };
}

export interface RecordListParams {
  page: number;
  pageSize: number;
  sort?: string;
  search?: string;
  deleted?: boolean;
}

export function useRecords(entityKey: string, params: RecordListParams) {
  return useQuery({
    queryKey: [...keys.records(entityKey), params],
    queryFn: () =>
      api.request<{ data: RecordItem[]; meta: PageMeta }>(`/entities/${entityKey}/records`, {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          sort: params.sort,
          search: params.search,
          deleted: params.deleted ? 'true' : undefined,
        },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useRecord(entityKey: string, id: string) {
  return useQuery({
    queryKey: keys.record(entityKey, id),
    queryFn: async () =>
      (await api.request<{ data: RecordItem }>(`/entities/${entityKey}/records/${id}`)).data,
  });
}
