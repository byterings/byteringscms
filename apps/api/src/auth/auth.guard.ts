import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Permission } from '@byteringscms/contracts';
import { type Request } from 'express';
import { AppError } from '../common/app-error';
import { PERMISSIONS_KEY, PLATFORM_ADMIN_KEY, PUBLIC_KEY, USER_ONLY_KEY } from './auth.decorators';
import { Authenticator } from './authenticator.service';
import { safeEqual } from './crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard. Resolves the caller and tenant, enforces CSRF for
 * cookie-authenticated state changes, then applies route requirements.
 * Routes require authentication unless marked @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticator: Authenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    const targets = [context.getHandler(), context.getClass()];
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, targets);

    const ctx = await this.authenticator.authenticate(req);
    req.ctx = ctx;

    if (meta<boolean>(PUBLIC_KEY)) return true;
    if (ctx.actor.type === 'anonymous') throw AppError.unauthenticated();

    if (ctx.actor.type === 'user' && !SAFE_METHODS.has(req.method)) {
      const header = req.header('x-csrf-token');
      if (!header || !safeEqual(header, ctx.actor.csrfToken)) {
        throw new AppError('CSRF_INVALID', 'Missing or invalid CSRF token', HttpStatus.FORBIDDEN);
      }
    }

    if (meta<boolean>(USER_ONLY_KEY) && ctx.actor.type !== 'user') {
      throw AppError.forbidden('This endpoint requires a signed-in user');
    }
    if (
      meta<boolean>(PLATFORM_ADMIN_KEY) &&
      !(ctx.actor.type === 'user' && ctx.actor.isPlatformAdmin)
    ) {
      throw AppError.forbidden('Platform administrator access required');
    }
    const required = meta<Permission[]>(PERMISSIONS_KEY);
    if (required?.length) {
      if (!ctx.tenantId) throw AppError.forbidden('No tenant access');
      const missing = required.filter((permission) => !ctx.permissions.has(permission));
      if (missing.length) throw AppError.forbidden(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
