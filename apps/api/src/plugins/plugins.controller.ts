import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PluginsService } from './plugins.service';

const pluginIdPipe = new ZodValidationPipe(z.string().regex(/^[a-z][a-z0-9-]{1,62}$/));

@Controller('admin/plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

  @Get()
  @RequirePermissions('templates:manage')
  async list(@Ctx() ctx: RequestContext) {
    return { data: await this.plugins.list(requireTenant(ctx)) };
  }

  @Post(':pluginId/enable')
  @RequirePermissions('templates:manage')
  @HttpCode(200)
  async enable(@Ctx() ctx: RequestContext, @Param('pluginId', pluginIdPipe) pluginId: string) {
    return { data: await this.plugins.setEnabled(requireTenant(ctx), pluginId, true) };
  }

  @Post(':pluginId/disable')
  @RequirePermissions('templates:manage')
  @HttpCode(200)
  async disable(@Ctx() ctx: RequestContext, @Param('pluginId', pluginIdPipe) pluginId: string) {
    return { data: await this.plugins.setEnabled(requireTenant(ctx), pluginId, false) };
  }
}
