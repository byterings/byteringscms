import { z } from 'zod';
import { MAX_PAGE_SIZE } from './pagination';

export const recordSchema = z.object({
  id: z.uuid(),
  entity: z.string(),
  data: z.record(z.string(), z.unknown()),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  deletedAt: z.string().nullable(),
});
export type RecordItem = z.infer<typeof recordSchema>;

const recordData = z.record(z.string().max(63), z.unknown());

export const createRecordRequestSchema = z.object({ data: recordData });
export type CreateRecordRequest = z.infer<typeof createRecordRequestSchema>;

export const updateRecordRequestSchema = z.object({
  data: recordData,
  /** Optimistic concurrency (ADR-019): the version the client last read. */
  version: z.number().int().min(1).optional(),
});
export type UpdateRecordRequest = z.infer<typeof updateRecordRequestSchema>;

/**
 * Record list query.
 *
 * - `sort=-price,name` (prefix `-` for descending)
 * - `filter[price][gte]=10&filter[isActive]=true` (operators per field type)
 * - `fields=name,price` (field selection)
 * - `search=lamp` (case-insensitive match on text fields)
 * - `expand=category` (relation expansion, depth 1)
 */
export const recordListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
  sort: z.string().max(300).optional(),
  fields: z.string().max(2000).optional(),
  search: z.string().trim().max(200).optional(),
  expand: z.string().max(500).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  deleted: z.enum(['true', 'false']).optional(),
});
export type RecordListQuery = z.infer<typeof recordListQuerySchema>;

export const recordGetQuerySchema = z.object({
  fields: z.string().max(2000).optional(),
  expand: z.string().max(500).optional(),
});
export type RecordGetQuery = z.infer<typeof recordGetQuerySchema>;
