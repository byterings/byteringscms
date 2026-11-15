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
} from '@nestjs/common';
import {
  createEntityRequestSchema,
  createFieldRequestSchema,
  FIELD_TYPE_INFO,
  FIELD_TYPES,
  reorderFieldsRequestSchema,
  updateEntityRequestSchema,
  updateFieldRequestSchema,
  type CreateEntityRequest,
  type CreateFieldRequest,
  type ReorderFieldsRequest,
  type UpdateEntityRequest,
  type UpdateFieldRequest,
} from '@bytecontent/contracts';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MetadataService } from './metadata.service';

@Controller('admin')
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get('field-types')
  @RequirePermissions('metadata:read')
  fieldTypes() {
    return { data: FIELD_TYPES.map((type) => FIELD_TYPE_INFO[type]) };
  }

  @Get('entities')
  @RequirePermissions('metadata:read')
  async list(@Ctx() ctx: RequestContext) {
    return { data: await this.metadata.list(requireTenant(ctx)) };
  }

  @Post('entities')
  @RequirePermissions('metadata:write')
  async create(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(createEntityRequestSchema)) body: CreateEntityRequest,
  ) {
    return { data: await this.metadata.create(requireTenant(ctx), body) };
  }

  @Get('entities/:entityId')
  @RequirePermissions('metadata:read')
  async get(@Ctx() ctx: RequestContext, @Param('entityId', ParseUUIDPipe) entityId: string) {
    return { data: await this.metadata.get(requireTenant(ctx), entityId) };
  }

  @Patch('entities/:entityId')
  @RequirePermissions('metadata:write')
  async update(
    @Ctx() ctx: RequestContext,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(updateEntityRequestSchema)) body: UpdateEntityRequest,
  ) {
    return { data: await this.metadata.update(requireTenant(ctx), entityId, body) };
  }

  @Delete('entities/:entityId')
  @RequirePermissions('metadata:write')
  @HttpCode(204)
  async remove(@Ctx() ctx: RequestContext, @Param('entityId', ParseUUIDPipe) entityId: string) {
    await this.metadata.remove(requireTenant(ctx), entityId);
  }

  @Get('entities/:entityId/versions')
  @RequirePermissions('metadata:read')
  async versions(@Ctx() ctx: RequestContext, @Param('entityId', ParseUUIDPipe) entityId: string) {
    return { data: await this.metadata.versions(requireTenant(ctx), entityId) };
  }

  @Post('entities/:entityId/fields')
  @RequirePermissions('metadata:write')
  async addField(
    @Ctx() ctx: RequestContext,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(createFieldRequestSchema)) body: CreateFieldRequest,
  ) {
    return { data: await this.metadata.addField(requireTenant(ctx), entityId, body) };
  }

  @Patch('entities/:entityId/fields/:fieldId')
  @RequirePermissions('metadata:write')
  async updateField(
    @Ctx() ctx: RequestContext,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body(new ZodValidationPipe(updateFieldRequestSchema)) body: UpdateFieldRequest,
  ) {
    return { data: await this.metadata.updateField(requireTenant(ctx), entityId, fieldId, body) };
  }

  @Delete('entities/:entityId/fields/:fieldId')
  @RequirePermissions('metadata:write')
  async removeField(
    @Ctx() ctx: RequestContext,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
  ) {
    return { data: await this.metadata.removeField(requireTenant(ctx), entityId, fieldId) };
  }

  @Post('entities/:entityId/fields/reorder')
  @RequirePermissions('metadata:write')
  @HttpCode(200)
  async reorder(
    @Ctx() ctx: RequestContext,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(reorderFieldsRequestSchema)) body: ReorderFieldsRequest,
  ) {
    return { data: await this.metadata.reorderFields(requireTenant(ctx), entityId, body.fieldIds) };
  }
}
