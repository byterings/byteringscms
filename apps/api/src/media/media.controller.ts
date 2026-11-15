import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  mediaListQuerySchema,
  updateMediaRequestSchema,
  type MediaListQuery,
  type UpdateMediaRequest,
} from '@bytecontent/contracts';
import { type Response } from 'express';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MediaService, type UploadedFile as UploadedMediaFile } from './media.service';

/** Content-Disposition value that is safe for any file name. */
export function contentDisposition(
  filename: string,
  type: 'inline' | 'attachment' = 'inline',
): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions('media:write')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Ctx() ctx: RequestContext,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @Body('alt') alt?: string,
  ) {
    return {
      data: await this.media.upload(
        requireTenant(ctx),
        file,
        typeof alt === 'string' ? alt : undefined,
      ),
    };
  }

  @Get()
  @RequirePermissions('media:read')
  list(
    @Ctx() ctx: RequestContext,
    @Query(new ZodValidationPipe(mediaListQuerySchema)) query: MediaListQuery,
  ) {
    return this.media.list(requireTenant(ctx), query);
  }

  @Get(':id')
  @RequirePermissions('media:read')
  async get(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.media.get(requireTenant(ctx), id) };
  }

  @Get(':id/file')
  @RequirePermissions('media:read')
  async file(
    @Ctx() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { media, stream } = await this.media.open(requireTenant(ctx), id);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(stream, {
      type: media.mimeType,
      length: media.size,
      disposition: contentDisposition(media.filename),
    });
  }

  @Patch(':id')
  @RequirePermissions('media:write')
  async update(
    @Ctx() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMediaRequestSchema)) body: UpdateMediaRequest,
  ) {
    return { data: await this.media.update(requireTenant(ctx), id, body) };
  }

  @Delete(':id')
  @RequirePermissions('media:write')
  @HttpCode(204)
  async remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.media.remove(requireTenant(ctx), id);
  }
}
