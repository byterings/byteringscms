import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { type HealthResponse } from '@byteringscms/contracts';
import { type Response } from 'express';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is running and serving HTTP. */
  @Get()
  live(): HealthResponse {
    return { status: 'ok' };
  }

  /** Readiness: dependencies required to serve traffic are reachable. */
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const database = (await this.prisma.isReachable()) ? 'up' : 'down';
    const ok = database === 'up';
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ok' : 'error', checks: { database } };
  }
}
