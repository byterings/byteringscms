import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { createApiKeyRequestSchema, type CreateApiKeyRequest } from '@byteringscms/contracts';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RequirePermissions, RequireUser } from './auth.decorators';
import { ApiKeysService } from './api-keys.service';

/** API keys are managed by signed-in users only - a key cannot mint keys. */
@Controller('admin/api-keys')
@RequireUser()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermissions('apikeys:manage')
  async list(@Ctx() ctx: RequestContext) {
    return { data: await this.apiKeys.list(requireTenant(ctx)) };
  }

  @Post()
  @RequirePermissions('apikeys:manage')
  async create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(createApiKeyRequestSchema)) body: CreateApiKeyRequest,
  ) {
    return { data: await this.apiKeys.create(requireTenant(ctx), body) };
  }

  @Delete(':id')
  @RequirePermissions('apikeys:manage')
  @HttpCode(204)
  async revoke(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.apiKeys.revoke(requireTenant(ctx), id);
  }
}
