import { z } from 'zod';
import { MEDIA_KINDS } from './fields';
import { pageQuerySchema } from './pagination';

export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/**
 * Accepted upload types. SVG is intentionally excluded: it can carry
 * scripts and would need sanitizing before it could be served safely.
 */
export const MEDIA_TYPES: Readonly<Record<string, MediaKind>> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
};

export const mediaSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mimeType: z.string(),
  kind: mediaKindSchema,
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  alt: z.string().nullable(),
  url: z.string(),
  createdAt: z.string(),
});
export type MediaItem = z.infer<typeof mediaSchema>;

export const mediaListQuerySchema = pageQuerySchema.extend({
  kind: mediaKindSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

export const updateMediaRequestSchema = z.object({
  alt: z.string().trim().max(500).nullable().optional(),
  filename: z.string().trim().min(1).max(200).optional(),
});
export type UpdateMediaRequest = z.infer<typeof updateMediaRequestSchema>;
