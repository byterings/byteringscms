import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  configApplyRequestSchema,
  configDocumentSchema,
  type ConfigApplyRequest,
  type ConfigDocument,
} from '@bytecontent/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ConfigSyncService } from './config-sync.service';

@Controller('admin/config')
export class ConfigSyncController {
  constructor(private readonly config: ConfigSyncService) {}

  @Get('export')
  @RequirePermissions('metadata:read')
  async export(@Ctx() ctx: RequestContext) {
    return { data: await this.config.export(requireTenant(ctx)) };
  }

  /** Read-only plan. `?prune=true` includes deletions of undeclared entities/fields. */
  @Post('diff')
  @RequirePermissions('metadata:write')
  @HttpCode(200)
  async diff(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(configDocumentSchema)) body: ConfigDocument,
    @Query('prune') prune?: string,
  ) {
    return { data: await this.config.diff(requireTenant(ctx), body, prune === 'true') };
  }

  @Post('apply')
  @RequirePermissions('metadata:write')
  @HttpCode(200)
  async apply(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(configApplyRequestSchema)) body: ConfigApplyRequest,
  ) {
    return { data: await this.config.apply(requireTenant(ctx), body) };
  }
}
