'use client';

import type { MediaItem, MediaKind } from '@byteringscms/contracts';
import { Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { ACCEPT_ATTR, useMediaByIds, useMediaList, useUploadMedia } from '@/lib/media';
import type { InputField } from './field-input';
import { MediaThumb } from './media-thumb';
import { Alert, Button, Dialog, Input, Loading } from './ui';

function idsOf(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function MediaLibraryDialog({
  accept,
  onPick,
  onClose,
}: {
  accept: MediaKind[] | undefined;
  onPick: (media: MediaItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const kind = accept?.length === 1 ? accept[0] : undefined;
  const list = useMediaList({ page, pageSize: 24, kind, search: search || undefined });
  const upload = useUploadMedia();
  const input = useRef<HTMLInputElement>(null);
  const items = (list.data?.data ?? []).filter((m) => !accept || accept.includes(m.kind));

  return (
    <Dialog open onClose={onClose} title="Choose media" wide>
      <div className="mb-3 flex gap-2">
        <Input
          aria-label="Search media"
          placeholder="Search by file name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <input
          ref={input}
          type="file"
          className="hidden"
          aria-label="Upload file"
          accept={(accept ?? (Object.keys(ACCEPT_ATTR) as MediaKind[]))
            .map((k) => ACCEPT_ATTR[k])
            .join(',')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(await upload.mutateAsync({ file }));
          }}
        />
        <Button
          type="button"
          variant="secondary"
          loading={upload.isPending}
          onClick={() => input.current?.click()}
        >
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>
      {upload.isError ? <Alert>{errorMessage(upload.error)}</Alert> : null}
      {list.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No matching files. Upload one.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {items.map((media) => (
            <li key={media.id}>
              <button
                type="button"
                onClick={() => onPick(media)}
                className="block w-full overflow-hidden rounded-md border border-slate-200 text-left hover:ring-2 hover:ring-brand-500"
                aria-label={`Choose ${media.filename}`}
              >
                <div className="aspect-square">
                  <MediaThumb media={media} />
                </div>
                <p className="truncate px-2 py-1 text-xs text-slate-600">{media.filename}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.data && list.data.meta.totalPages > 1 ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={page >= list.data.meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Media value input backed by the media library. */
export function MediaPicker({
  id,
  field,
  value,
  onChange,
  disabled,
}: {
  id: string;
  field: InputField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const multiple = field.config.multiple === true;
  const accept = field.config.accept as MediaKind[] | undefined;
  const selected = idsOf(value);
  const media = useMediaByIds(selected);
  const [open, setOpen] = useState(false);

  const remove = (mediaId: string) => {
    const next = selected.filter((x) => x !== mediaId);
    onChange(multiple ? (next.length ? next : null) : null);
  };

  return (
    <div id={id} className="space-y-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Selected ${field.label}`}>
          {selected.map((mediaId, index) => {
            const item = media.data?.[index];
            return (
              <li
                key={mediaId}
                className="relative w-24 overflow-hidden rounded-md border border-slate-200"
              >
                <div className="aspect-square">
                  {item ? (
                    <MediaThumb media={item} />
                  ) : (
                    <div className="h-full w-full bg-slate-100" />
                  )}
                </div>
                <p className="truncate px-1 py-0.5 text-[10px] text-slate-600">
                  {item?.filename ?? 'Missing file'}
                </p>
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={`Remove ${item?.filename ?? 'file'}`}
                    onClick={() => remove(mediaId)}
                    className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 shadow hover:bg-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {!disabled && (multiple || selected.length === 0) ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Choose {multiple ? 'files' : 'file'}
        </Button>
      ) : !disabled ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Replace
        </Button>
      ) : null}
      {open ? (
        <MediaLibraryDialog
          accept={accept}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            onChange(multiple ? [...new Set([...selected, picked.id])] : picked.id);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
