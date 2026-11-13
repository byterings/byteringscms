'use client';

import type { MediaItem } from '@byteringscms/contracts';
import { FileAudio, FileText, FileVideo } from 'lucide-react';
import clsx from 'clsx';

/** Square preview for a media item: the image itself or a type icon. */
export function MediaThumb({ media, className }: { media: MediaItem; className?: string }) {
  if (media.kind === 'image') {
    return (
      // Served through the authenticated same-origin proxy; next/image is not needed.
      <img
        src={media.url}
        alt={media.alt ?? media.filename}
        className={clsx('h-full w-full object-cover', className)}
        loading="lazy"
      />
    );
  }
  const Icon = media.kind === 'video' ? FileVideo : media.kind === 'audio' ? FileAudio : FileText;
  return (
    <div
      className={clsx(
        'flex h-full w-full items-center justify-center bg-slate-100 text-slate-500',
        className,
      )}
    >
      <Icon className="h-8 w-8" aria-hidden="true" />
    </div>
  );
}
