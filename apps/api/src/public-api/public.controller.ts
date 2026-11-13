import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import {
  entityKeySchema,
  recordGetQuerySchema,
  recordListQuerySchema,
  slugSchema,
  type RecordGetQuery,
  type RecordListQuery,
} from '@byteringscms/contracts';
import { type Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { contentDisposition } from '../media/media.controller';
import { PublicService } from './public.service';

const CACHE = 'public, max-age=60, stale-while-revalidate=300';
const listQuery = recordListQuerySchema.omit({ deleted: true });

/** Anonymous, read-only content API: /api/v1/public/:tenantSlug/... (ADR-025). */
@Controller('public/:tenantSlug')
@Public()
export class PublicController {
  constructor(private readonly publicApi: PublicService) {}

  @Get('entities/:entityKey/records')
  async list(
    @Param('tenantSlug', new ZodValidationPipe(slugSchema)) tenantSlug: string,
    @Param('entityKey', new ZodValidationPipe(entityKeySchema)) entityKey: string,
    @Query(new ZodValidationPipe(listQuery)) query: RecordListQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', CACHE);
    return this.publicApi.list(tenantSlug, entityKey, query);
  }

  @Get('entities/:entityKey/records/:id')
  async get(
    @Param('tenantSlug', new ZodValidationPipe(slugSchema)) tenantSlug: string,
    @Param('entityKey', new ZodValidationPipe(entityKeySchema)) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(recordGetQuerySchema)) query: RecordGetQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', CACHE);
    return { data: await this.publicApi.get(tenantSlug, entityKey, id, query) };
  }

  @Get('media/:id/file')
  async media(
    @Param('tenantSlug', new ZodValidationPipe(slugSchema)) tenantSlug: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { media, stream } = await this.publicApi.openMedia(tenantSlug, id);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(stream, {
      type: media.mimeType,
      length: media.size,
      disposition: contentDisposition(media.filename),
    });
  }
}
