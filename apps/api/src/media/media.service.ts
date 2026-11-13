import { randomUUID, createHash } from 'node:crypto';
import { type Readable } from 'node:stream';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  MEDIA_TYPES,
  pageMeta,
  type MediaItem,
  type MediaKind,
  type MediaListQuery,
  type UpdateMediaRequest,
} from '@byteringscms/contracts';
import { type Media, type Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { actorId, type TenantContext } from '../common/request-context';
import { TenantDb } from '../database/tenant-db.service';
import { contentMatches, imageDimensions, sniffMimeType } from './file-sniffer';
import { STORAGE_DRIVER, type StorageDriver } from './storage';

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/** Keeps a safe, readable file name: no paths, no control characters. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base
    .replace(/[\x00-\x1f\x7f"<>|:*?]/g, '')
    .trim()
    .slice(0, 200);
  return cleaned || 'file';
}

export function toMediaItem(row: Media, urlBase = '/api/v1/media'): MediaItem {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    kind: row.kind as MediaKind,
    size: row.size,
    width: row.width,
    height: row.height,
    alt: row.alt,
    url: `${urlBase}/${row.id}/file`,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Media library (Phase 7, ADR-023). */
@Injectable()
export class MediaService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async upload(
    ctx: TenantContext,
    file: UploadedFile | undefined,
    alt?: string,
  ): Promise<MediaItem> {
    if (!file || file.size === 0) {
      throw AppError.validation([{ path: 'file', message: 'A non-empty file is required' }]);
    }
    const declared = file.mimetype.toLowerCase().split(';')[0]!.trim();
    const kind = MEDIA_TYPES[declared];
    if (!kind) {
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        `File type ${declared} is not allowed`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (!contentMatches(declared, sniffMimeType(file.buffer))) {
      throw new AppError(
        'MEDIA_CONTENT_MISMATCH',
        'The file content does not match its declared type',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    const now = new Date();
    const key = `${ctx.tenantId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXTENSIONS[declared]}`;
    const dims = kind === 'image' ? imageDimensions(file.buffer, declared) : null;
    await this.storage.put(key, file.buffer, declared);
    try {
      return await this.db.run(ctx.tenantId, async (tx) => {
        const row = await tx.media.create({
          data: {
            tenantId: ctx.tenantId,
            storageKey: key,
            filename: safeFilename(file.originalname),
            mimeType: declared,
            kind,
            size: file.size,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            alt: alt?.trim() ? alt.trim().slice(0, 500) : null,
            checksum: createHash('sha256').update(file.buffer).digest('hex'),
            createdById: actorId(ctx),
          },
        });
        await this.audit.record(tx, ctx, {
          action: 'media.uploaded',
          targetType: 'media',
          targetId: row.id,
        });
        return toMediaItem(row);
      });
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async list(ctx: TenantContext, query: MediaListQuery) {
    const where: Prisma.MediaWhereInput = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.search ? { filename: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.db.run(ctx.tenantId, (tx) =>
      Promise.all([
        tx.media.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.media.count({ where }),
      ]),
    );
    return { data: rows.map((row) => toMediaItem(row)), meta: pageMeta(query, total) };
  }

  async get(ctx: TenantContext, id: string): Promise<MediaItem> {
    return toMediaItem(await this.find(ctx, id));
  }

  async update(ctx: TenantContext, id: string, input: UpdateMediaRequest): Promise<MediaItem> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const result = await tx.media.updateMany({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        data: {
          ...(input.alt !== undefined ? { alt: input.alt } : {}),
          ...(input.filename !== undefined ? { filename: safeFilename(input.filename) } : {}),
        },
      });
      if (result.count === 0) throw AppError.notFound('Media');
      await this.audit.record(tx, ctx, {
        action: 'media.updated',
        targetType: 'media',
        targetId: id,
        changedKeys: Object.keys(input),
      });
      return toMediaItem(await tx.media.findUniqueOrThrow({ where: { id } }));
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.db.run(ctx.tenantId, async (tx) => {
      const result = await tx.media.updateMany({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) throw AppError.notFound('Media');
      await this.audit.record(tx, ctx, {
        action: 'media.deleted',
        targetType: 'media',
        targetId: id,
      });
    });
  }

  async open(ctx: TenantContext, id: string): Promise<{ media: Media; stream: Readable }> {
    const media = await this.find(ctx, id);
    return { media, stream: await this.storage.get(media.storageKey) };
  }

  /** Opens a media file by id for a tenant without a user context (public API). */
  async openForTenant(tenantId: string, id: string): Promise<{ media: Media; stream: Readable }> {
    const media = await this.db.run(tenantId, (tx) =>
      tx.media.findFirst({ where: { id, tenantId, deletedAt: null } }),
    );
    if (!media) throw AppError.notFound('Media');
    return { media, stream: await this.storage.get(media.storageKey) };
  }

  private async find(ctx: TenantContext, id: string): Promise<Media> {
    const media = await this.db.run(ctx.tenantId, (tx) =>
      tx.media.findFirst({ where: { id, tenantId: ctx.tenantId, deletedAt: null } }),
    );
    if (!media) throw AppError.notFound('Media');
    return media;
  }
}
