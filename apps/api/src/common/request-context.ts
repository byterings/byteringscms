import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type ApiKeyScope, type Permission, type Role } from '@byteringscms/contracts';
import { type Request } from 'express';
import { AppError } from './app-error';

export type UserActor = {
  type: 'user';
  userId: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  sessionId: string;
  csrfToken: string;
};

export type ApiKeyActor = {
  type: 'apiKey';
  apiKeyId: string;
  name: string;
  scopes: ApiKeyScope[];
};

export type AnonymousActor = { type: 'anonymous' };

export type Actor = UserActor | ApiKeyActor | AnonymousActor;

/**
 * Trusted, server-resolved context of the current request. Built by the
 * AuthGuard from the session cookie or API key - never from client-supplied
 * tenant identifiers (ADR-017).
 */
export interface RequestContext {
  actor: Actor;
  /** Resolved tenant, or null when the caller has no tenant access. */
  tenantId: string | null;
  /** Role used for field-level checks (membership role, or derived from API key scopes). */
  role: Role | null;
  permissions: ReadonlySet<Permission>;
  ip: string | null;
}

/** Context of a request that has passed tenant and permission checks. */
export interface TenantContext extends RequestContext {
  tenantId: string;
  role: Role;
}

declare module 'express' {
  interface Request {
    ctx?: RequestContext;
  }
}

export function anonymousContext(ip: string | null): RequestContext {
  return { actor: { type: 'anonymous' }, tenantId: null, role: null, permissions: new Set(), ip };
}

export function requireTenant(ctx: RequestContext): TenantContext {
  if (!ctx.tenantId || !ctx.role) throw AppError.forbidden('No tenant access');
  return ctx as TenantContext;
}

export function requireUser(ctx: RequestContext): UserActor {
  if (ctx.actor.type !== 'user') throw AppError.unauthenticated();
  return ctx.actor;
}

/** Actor id for audit events and `created_by` columns. */
export function actorId(ctx: RequestContext): string | null {
  if (ctx.actor.type === 'user') return ctx.actor.userId;
  if (ctx.actor.type === 'apiKey') return ctx.actor.apiKeyId;
  return null;
}

/** Injects the RequestContext built by the AuthGuard. */
export const Ctx = createParamDecorator((_data: unknown, host: ExecutionContext) => {
  const req = host.switchToHttp().getRequest<Request>();
  if (!req.ctx) throw new Error('RequestContext missing - is AuthGuard registered?');
  return req.ctx;
});
