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
  addMemberRequestSchema,
  updateMemberRequestSchema,
  type AddMemberRequest,
  type UpdateMemberRequest,
} from '@byteringscms/contracts';
import { RequirePermissions, RequireUser } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MembersService } from './members.service';

@Controller('admin/members')
@RequireUser()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermissions('members:manage')
  async list(@Ctx() ctx: RequestContext) {
    return { data: await this.members.list(requireTenant(ctx)) };
  }

  @Post()
  @RequirePermissions('members:manage')
  async add(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(addMemberRequestSchema)) body: AddMemberRequest,
  ) {
    return { data: await this.members.add(requireTenant(ctx), body) };
  }

  @Patch(':id')
  @RequirePermissions('members:manage')
  async update(
    @Ctx() ctx: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMemberRequestSchema)) body: UpdateMemberRequest,
  ) {
    return { data: await this.members.updateRole(requireTenant(ctx), id, body.role) };
  }

  @Delete(':id')
  @RequirePermissions('members:manage')
  @HttpCode(204)
  async remove(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.members.remove(requireTenant(ctx), id);
  }
}
