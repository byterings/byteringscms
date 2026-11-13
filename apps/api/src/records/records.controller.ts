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
} from '@nestjs/common';
import {
  createRecordRequestSchema,
  entityKeySchema,
  recordGetQuerySchema,
  recordListQuerySchema,
  updateRecordRequestSchema,
  type CreateRecordRequest,
  type RecordGetQuery,
  type RecordListQuery,
  type UpdateRecordRequest,
} from '@byteringscms/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RecordsService } from './records.service';

const entityKeyPipe = new ZodValidationPipe(entityKeySchema);

/** Generic record API: /api/v1/entities/:entityKey/records (developmentPlan §9.1). */
@Controller('entities/:entityKey/records')
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @RequirePermissions('records:read')
  list(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Query(new ZodValidationPipe(recordListQuerySchema)) query: RecordListQuery,
  ) {
    return this.records.list(requireTenant(ctx), entityKey, query);
  }

  @Get(':id')
  @RequirePermissions('records:read')
  async get(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(recordGetQuerySchema)) query: RecordGetQuery,
  ) {
    return { data: await this.records.get(requireTenant(ctx), entityKey, id, query) };
  }

  @Post()
  @RequirePermissions('records:write')
  async create(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Body(new ZodValidationPipe(createRecordRequestSchema)) body: CreateRecordRequest,
  ) {
    return { data: await this.records.create(requireTenant(ctx), entityKey, body) };
  }

  @Patch(':id')
  @RequirePermissions('records:write')
  async update(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecordRequestSchema)) body: UpdateRecordRequest,
  ) {
    return { data: await this.records.update(requireTenant(ctx), entityKey, id, body) };
  }

  @Delete(':id')
  @RequirePermissions('records:write')
  @HttpCode(204)
  async remove(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.records.remove(requireTenant(ctx), entityKey, id);
  }

  @Post(':id/restore')
  @RequirePermissions('records:write')
  @HttpCode(200)
  async restore(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { data: await this.records.restore(requireTenant(ctx), entityKey, id) };
  }

  @Delete(':id/permanent')
  @RequirePermissions('records:write')
  @HttpCode(204)
  async purge(
    @Ctx() ctx: RequestContext,
    @Param('entityKey', entityKeyPipe) entityKey: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.records.purge(requireTenant(ctx), entityKey, id);
  }
}
