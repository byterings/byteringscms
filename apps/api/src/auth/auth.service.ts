import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type ChangePasswordRequest,
  type LoginRequest,
  ROLE_PERMISSIONS,
  type Session,
} from '@bytecontent/contracts';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { type RequestContext, requireUser } from '../common/request-context';
import { APP_ENV } from '../config/config.module';
import { type Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { TenantDb } from '../database/tenant-db.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { randomToken, sha256 } from './crypto';
import { PasswordService } from './password.service';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  sessionId: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginRequest, meta: { ip: string | null; userAgent: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !valid || user.status !== 'active') {
      // System write: failed logins are installation-level events.
      await this.db.system((tx) =>
        this.audit.record(
          tx,
          null,
          { action: 'auth.login_failed', targetType: 'user', targetId: user?.id },
          null,
        ),
      );
      throw new AppError(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const issued = await this.issueSession(user.id, meta);
    await this.db.system((tx) =>
      this.audit.record(
        tx,
        null,
        { action: 'auth.login', targetType: 'user', targetId: user.id },
        null,
      ),
    );
    return issued;
  }

  /** Creates a session for an already-authenticated user. */
  async issueSession(
    userId: string,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<IssuedSession> {
    const now = new Date();
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + this.env.SESSION_TTL_HOURS * 3_600_000);
    let activeTenantId: string | null = null;
    if (this.tenancy.mode === 'multi') {
      // System read: list the user's own memberships to pick an initial tenant.
      const first = await this.db.system((tx) =>
        tx.membership.findFirst({
          where: { userId, tenant: { status: 'active' } },
          orderBy: { createdAt: 'asc' },
          select: { tenantId: true },
        }),
      );
      activeTenantId = first?.tenantId ?? null;
    }
    const [session] = await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          tokenHash: sha256(token),
          userId,
          activeTenantId,
          csrfToken: randomToken(),
          expiresAt,
          ipAddress: meta.ip,
          userAgent: meta.userAgent?.slice(0, 500) ?? null,
        },
      }),
      this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: now } } }),
      this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now } }),
    ]);
    return { token, expiresAt, sessionId: session.id };
  }

  async logout(ctx: RequestContext): Promise<void> {
    const actor = requireUser(ctx);
    await this.prisma.session.deleteMany({ where: { id: actor.sessionId } });
  }

  async switchTenant(ctx: RequestContext, tenantId: string): Promise<void> {
    const actor = requireUser(ctx);
    if (this.tenancy.mode === 'single') {
      throw AppError.conflict('TENANCY_SINGLE', 'This installation runs in single-tenant mode');
    }
    const access = await this.tenancy.verifyMembership(tenantId, actor.userId);
    if (!access) throw AppError.forbidden('You are not a member of this tenant');
    await this.prisma.session.update({
      where: { id: actor.sessionId },
      data: { activeTenantId: tenantId },
    });
  }

  async changePassword(ctx: RequestContext, input: ChangePasswordRequest): Promise<void> {
    const actor = requireUser(ctx);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      throw new AppError(
        'INVALID_CREDENTIALS',
        'Current password is incorrect',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: actor.userId }, data: { passwordHash } }),
      // Sign out every other session of this user.
      this.prisma.session.deleteMany({
        where: { userId: actor.userId, id: { not: actor.sessionId } },
      }),
    ]);
    await this.db.system((tx) =>
      this.audit.record(
        tx,
        ctx,
        {
          action: 'auth.password_changed',
          targetType: 'user',
          targetId: actor.userId,
        },
        null,
      ),
    );
  }

  /** Describes a session for the Admin Studio (user, tenants, permissions, CSRF token). */
  async describe(sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { user: true },
    });
    // System read: the user's own memberships across tenants (filtered by user id).
    const memberships = await this.db.system((tx) =>
      tx.membership.findMany({
        where: { userId: session.userId, tenant: { status: 'active' } },
        include: { tenant: true },
        orderBy: { createdAt: 'asc' },
      }),
    );
    const candidate = await this.tenancy.candidateTenant(session.activeTenantId);
    const active = memberships.find((m) => m.tenantId === candidate) ?? null;
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        isPlatformAdmin: session.user.isPlatformAdmin,
      },
      tenancyMode: this.tenancy.mode,
      activeTenant: active
        ? {
            id: active.tenant.id,
            slug: active.tenant.slug,
            name: active.tenant.name,
            role: active.role,
          }
        : null,
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        role: m.role,
      })),
      permissions: active ? [...ROLE_PERMISSIONS[active.role]] : [],
      csrfToken: session.csrfToken,
    };
  }
}
