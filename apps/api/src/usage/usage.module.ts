import { Controller, Get, Global, Module } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { MaintenanceService } from './maintenance.service';
import { UsageService } from './usage.service';

@Controller('admin/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get()
  @RequirePermissions('audit:read')
  async get(@Ctx() ctx: RequestContext) {
    return { data: await this.usage.usage(requireTenant(ctx)) };
  }
}

@Global()
@Module({
  controllers: [UsageController],
  providers: [UsageService, MaintenanceService],
  exports: [UsageService, MaintenanceService],
})
export class UsageModule {}
