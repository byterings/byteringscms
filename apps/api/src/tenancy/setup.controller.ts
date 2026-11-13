import { Body, Controller, Get, Inject, Post, Req, Res } from '@nestjs/common';
import { setupRequestSchema, type SetupRequest } from '@byteringscms/contracts';
import { type Request, type Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { safeEqual } from '../auth/crypto';
import { setSessionCookie } from '../auth/session-cookie';
import { AppError } from '../common/app-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { SetupService } from './setup.service';

@Controller('setup')
@Public()
export class SetupController {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly setupService: SetupService,
    private readonly auth: AuthService,
  ) {}

  @Get('status')
  async status() {
    return { data: { initialized: await this.setupService.isInitialized() } };
  }

  /** Creates the first tenant and owner, then signs the owner in. */
  @Post()
  async setup(
    @Body(new ZodValidationPipe(setupRequestSchema)) body: SetupRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (this.env.SETUP_TOKEN) {
      const provided = req.header('x-setup-token') ?? '';
      if (!safeEqual(provided, this.env.SETUP_TOKEN)) {
        throw AppError.forbidden('Invalid setup token');
      }
    }
    const { userId } = await this.setupService.setup(body);
    const issued = await this.auth.issueSession(userId, {
      ip: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
    setSessionCookie(res, this.env, issued.token, issued.expiresAt);
    return { data: await this.auth.describe(issued.sessionId) };
  }
}
