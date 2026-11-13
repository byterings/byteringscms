import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { type Request, type Response } from 'express';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { AppError } from './app-error';

/**
 * Global throttle (R-604). Clients are identified by their API key (hashed)
 * when present, otherwise by IP address. State is in memory, which suits a
 * single API instance; multi-instance deployments need a shared store.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;
    const authorization = request.headers?.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      return `key:${createHash('sha256').update(authorization).digest('hex').slice(0, 32)}`;
    }
    return `ip:${request.ip ?? 'unknown'}`;
  }
}

/**
 * Strict fixed-window limiter for credential endpoints (login, setup) to
 * slow down password guessing. Keyed by client IP.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(@Inject(APP_ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const key = `${req.route?.path ?? req.path}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    const limit = this.env.AUTH_RATE_LIMIT_PER_MINUTE;
    let window = this.windows.get(key);
    if (!window || now - window.start >= 60_000) {
      window = { start: now, count: 0 };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (this.windows.size > 10_000) this.prune(now);
    if (window.count > limit) {
      const retryAfter = Math.ceil((window.start + 60_000 - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      throw new AppError(
        'RATE_LIMITED',
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= 60_000) this.windows.delete(key);
    }
  }
}
