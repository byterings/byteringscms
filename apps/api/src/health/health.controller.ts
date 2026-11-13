import { Controller, Get } from '@nestjs/common';
import { type HealthResponse } from '@byteringscms/contracts';

@Controller('health')
export class HealthController {
  /** Liveness: the process is running and serving HTTP. */
  @Get()
  live(): HealthResponse {
    return { status: 'ok' };
  }
}
