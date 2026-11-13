import { Global, Module } from '@nestjs/common';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { TenancyService } from './tenancy.service';
import { CurrentTenantController, PlatformTenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Global()
@Module({
  controllers: [SetupController, CurrentTenantController, PlatformTenantsController],
  providers: [TenancyService, TenantsService, SetupService],
  exports: [TenancyService, TenantsService, SetupService],
})
export class TenancyModule {}
