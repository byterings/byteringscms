import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  switchTenantRequestSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type SwitchTenantRequest,
} from '@byteringscms/contracts';
import { type Request, type Response } from 'express';
import { Ctx, requireUser, type RequestContext } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { Public, RequireUser } from './auth.decorators';
import { AuthService } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './session-cookie';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly auth: AuthService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const issued = await this.auth.login(body, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    setSessionCookie(res, this.env, issued.token, issued.expiresAt);
    return { data: await this.auth.describe(issued.sessionId) };
  }

  @Get('session')
  @RequireUser()
  async session(@Ctx() ctx: RequestContext) {
    return { data: await this.auth.describe(requireUser(ctx).sessionId) };
  }

  @Post('logout')
  @RequireUser()
  @HttpCode(204)
  async logout(@Ctx() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(ctx);
    clearSessionCookie(res, this.env);
  }

  @Post('switch-tenant')
  @RequireUser()
  @HttpCode(200)
  async switchTenant(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(switchTenantRequestSchema)) body: SwitchTenantRequest,
  ) {
    await this.auth.switchTenant(ctx, body.tenantId);
    return { data: await this.auth.describe(requireUser(ctx).sessionId) };
  }

  @Post('password')
  @RequireUser()
  @HttpCode(204)
  async changePassword(
    @Ctx() ctx: RequestContext,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ) {
    await this.auth.changePassword(ctx, body);
  }
}
