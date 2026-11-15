import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  createTenantRequestSchema,
  updateTenantRequestSchema,
  updateTenantStatusRequestSchema,
  type CreateTenantRequest,
  type UpdateTenantRequest,
} from '@bytecontent/contracts';
import { type z } from 'zod';
import { RequirePermissions, RequirePlatformAdmin } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TenantsService } from './tenants.service';

/** The tenant the caller is currently acting in. */
@Controller('tenant')
export class CurrentTenantController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePermissions('metadata:read')
  async get(@Ctx() ctx: RequestContext) {
    return { data: await this.tenants.current(requireTenant(ctx)) };
  }

  @Patch()
  @RequirePermissions('tenant:manage')
  async update(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(updateTenantRequestSchema)) body: UpdateTenantRequest,
  ) {
    return { data: await this.tenants.rename(requireTenant(ctx), body.name) };
  }
}

/** Installation-wide tenant provisioning for platform administrators. */
@Controller('platform/tenants')
@RequirePlatformAdmin()
export class PlatformTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  async list() {
    return { data: await this.tenants.listAll() };
  }

  @Post()
  async create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(createTenantRequestSchema)) body: CreateTenantRequest,
  ) {
    return { data: await this.tenants.create(ctx, body) };
  }

  @Patch(':id/status')
  async setStatus(
    @Ctx() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTenantStatusRequestSchema))
    body: z.infer<typeof updateTenantStatusRequestSchema>,
  ) {
    return { data: await this.tenants.setStatus(ctx, id, body.status) };
  }
}
