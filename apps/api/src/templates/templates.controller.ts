import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  installTemplateRequestSchema,
  upgradeTemplateRequestSchema,
  type InstallTemplateRequest,
  type UpgradeTemplateRequest,
} from '@byteringscms/contracts';
import { z } from 'zod';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplateUpgradeService } from './template-upgrade.service';
import { TemplatesService } from './templates.service';

const templateIdPipe = new ZodValidationPipe(z.string().regex(/^[a-z][a-z0-9-]{1,62}$/));

@Controller('admin/templates')
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly upgrades: TemplateUpgradeService,
  ) {}

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

  /** Read-only preview of what an upgrade to the available version would change. */
  @Get(':templateId/upgrade-plan')
  @RequirePermissions('templates:manage')
  async plan(@Ctx() ctx: RequestContext, @Param('templateId', templateIdPipe) templateId: string) {
    return { data: await this.upgrades.plan(requireTenant(ctx), templateId) };
  }

  @Post(':templateId/upgrade')
  @RequirePermissions('templates:manage', 'metadata:write')
  @HttpCode(200)
  async upgrade(
    @Ctx() ctx: RequestContext,
    @Param('templateId', templateIdPipe) templateId: string,
    @Body(new ZodValidationPipe(upgradeTemplateRequestSchema)) body: UpgradeTemplateRequest,
  ) {
    return { data: await this.upgrades.upgrade(requireTenant(ctx), templateId, body) };
  }

  @Get(':templateId/upgrades')
  @RequirePermissions('templates:manage')
  async history(
    @Ctx() ctx: RequestContext,
    @Param('templateId', templateIdPipe) templateId: string,
  ) {
    return { data: await this.upgrades.history(requireTenant(ctx), templateId) };
  }
}
