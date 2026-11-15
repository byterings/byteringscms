'use client';

import type { MediaItem, MediaKind } from '@bytecontent/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { MediaThumb } from '@/components/media-thumb';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  FormField,
  Input,
  Loading,
  PageHeader,
  Select,
} from '@/components/ui';
import { api } from '@/lib/api-client';
import { errorMessage } from '@/lib/errors';
import { ACCEPT_ATTR, formatBytes, mediaKeys, useMediaList, useUploadMedia } from '@/lib/media';
import { useSession } from '@/lib/session';

function EditMediaDialog({ media, onClose }: { media: MediaItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { can } = useSession();
  const [alt, setAlt] = useState(media.alt ?? '');
  const [filename, setFilename] = useState(media.filename);
  const save = useMutation({
    mutationFn: () =>
      api.request(`/media/${media.id}`, { method: 'PATCH', body: { alt: alt || null, filename } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.request(`/media/${media.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mediaKeys.all });
      onClose();
    },
  });
  const writable = can('media:write');
  return (
    <Dialog open onClose={onClose} title={media.filename} wide>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-md border border-slate-200">
          <MediaThumb media={media} className="object-contain" />
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {save.isError || remove.isError ? (
            <Alert>{errorMessage(save.error ?? remove.error)}</Alert>
          ) : null}
          <dl className="grid grid-cols-2 gap-1 text-xs text-slate-600">
            <dt>Type</dt>
            <dd>{media.mimeType}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(media.size)}</dd>
            {media.width ? (
              <>
                <dt>Dimensions</dt>
                <dd>
                  {media.width} × {media.height}
                </dd>
              </>
            ) : null}
            <dt>ID</dt>
            <dd className="truncate font-mono">{media.id}</dd>
          </dl>
          <FormField label="File name" htmlFor="m-filename">
            <Input
              id="m-filename"
              value={filename}
              disabled={!writable}
              onChange={(e) => setFilename(e.target.value)}
            />
          </FormField>
          <FormField
            label="Alternative text"
            htmlFor="m-alt"
            hint="Describes the image for screen readers and search engines."
          >
            <Input
              id="m-alt"
              value={alt}
              disabled={!writable}
              onChange={(e) => setAlt(e.target.value)}
            />
          </FormField>
          <a
            href={media.url}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-brand-600 hover:underline"
          >
            Open file
          </a>
          {writable ? (
            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="danger"
                loading={remove.isPending}
                onClick={() => window.confirm('Delete this file?') && remove.mutate()}
              >
                Delete
              </Button>
              <Button type="submit" loading={save.isPending}>
                Save
              </Button>
            </div>
          ) : null}
        </form>
      </div>
    </Dialog>
  );
}

export default function MediaPage() {
  const { can } = useSession();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<MediaKind | ''>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [dragging, setDragging] = useState(false);
  const list = useMediaList({
    page,
    pageSize: 30,
    kind: kind || undefined,
    search: search || undefined,
  });
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      await upload.mutateAsync({ file }).catch(() => undefined);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        if (!can('media:write')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (can('media:write')) void uploadFiles(e.dataTransfer.files);
      }}
      className={dragging ? 'rounded-lg ring-2 ring-brand-500 ring-offset-4' : undefined}
    >
      <PageHeader
        title="Media"
        description="Images, videos, audio and documents. Drop files anywhere on this page to upload."
        actions={
          can('media:write') ? (
            <>
              <input
                ref={input}
                type="file"
                multiple
                className="hidden"
                aria-label="Upload files"
                accept={Object.values(ACCEPT_ATTR).join(',')}
                onChange={(e) => {
                  void uploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Button loading={upload.isPending} onClick={() => input.current?.click()}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </>
          ) : null
        }
      />
      {upload.isError ? (
        <div className="mb-4">
          <Alert>{errorMessage(upload.error)}</Alert>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          aria-label="Search media"
          placeholder="Search…"
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Filter by type"
          className="w-40"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as MediaKind | '');
            setPage(1);
          }}
        >
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="video">Videos</option>
          <option value="audio">Audio</option>
          <option value="document">Documents</option>
        </Select>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <Alert>{errorMessage(list.error)}</Alert>
      ) : list.data!.data.length === 0 ? (
        <EmptyState title="No files yet">
          Upload images or documents to use them in your content.
        </EmptyState>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {list.data!.data.map((media) => (
              <li key={media.id}>
                <button
                  type="button"
                  onClick={() => setEditing(media)}
                  className="block w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm hover:shadow-md"
                >
                  <div className="aspect-square">
                    <MediaThumb media={media} />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-sm font-medium text-slate-800">{media.filename}</p>
                    <p className="text-xs text-slate-500">{formatBytes(media.size)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {list.data!.meta.page} of {list.data!.meta.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= list.data!.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {editing ? <EditMediaDialog media={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
