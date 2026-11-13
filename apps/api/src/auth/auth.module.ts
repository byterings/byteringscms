import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Authenticator } from './authenticator.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  controllers: [AuthController, ApiKeysController],
  providers: [
    PasswordService,
    Authenticator,
    AuthService,
    ApiKeysService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [PasswordService, AuthService],
})
export class AuthModule {}
