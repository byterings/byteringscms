import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { installTemplateRequestSchema, type InstallTemplateRequest } from '@byteringscms/contracts';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplatesService } from './templates.service';

const templateIdPipe = new ZodValidationPipe(z.string().regex(/^[a-z][a-z0-9-]{1,62}$/));

@Controller('admin/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermissions('templates:manage')
  async list(@Ctx() ctx: RequestContext) {
    return { data: await this.templates.list(requireTenant(ctx)) };
  }

  @Post(':templateId/install')
  @RequirePermissions('templates:manage', 'metadata:write')
  async install(
    @Ctx() ctx: RequestContext,
    @Param('templateId', templateIdPipe) templateId: string,
    @Body(new ZodValidationPipe(installTemplateRequestSchema)) body: InstallTemplateRequest,
  ) {
    return { data: await this.templates.install(requireTenant(ctx), templateId, body) };
  }
}
