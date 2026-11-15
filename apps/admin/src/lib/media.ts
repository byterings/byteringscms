'use client';

import type { MediaItem, MediaKind, PageMeta } from '@bytecontent/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

export const mediaKeys = {
  all: ['media'] as const,
  list: (params: object) => ['media', 'list', params] as const,
  byIds: (ids: string[]) => ['media', 'ids', ids] as const,
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const ACCEPT_ATTR: Record<MediaKind, string> = {
  image: 'image/png,image/jpeg,image/gif,image/webp',
  video: 'video/mp4,video/webm',
  audio: 'audio/mpeg,audio/wav,audio/ogg',
  document: 'application/pdf,text/plain,text/csv',
};

export function useMediaList(params: {
  page: number;
  pageSize: number;
  kind?: MediaKind;
  search?: string;
}) {
  return useQuery({
    queryKey: mediaKeys.list(params),
    queryFn: () =>
      api.request<{ data: MediaItem[]; meta: PageMeta }>('/media', {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          kind: params.kind,
          search: params.search,
        },
      }),
    placeholderData: (previous) => previous,
  });
}

/** Metadata for specific media ids (selected values in forms). */
export function useMediaByIds(ids: string[]) {
  return useQuery({
    queryKey: mediaKeys.byIds(ids),
    enabled: ids.length > 0,
    queryFn: async () =>
      Promise.all(
        ids.map(async (id) => {
          try {
            return (await api.request<{ data: MediaItem }>(`/media/${id}`)).data;
          } catch {
            return null;
          }
        }),
      ),
  });
}

export function useUploadMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, alt }: { file: File; alt?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (alt) form.append('alt', alt);
      return (await api.upload<{ data: MediaItem }>('/media', form)).data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mediaKeys.all }),
  });
}
