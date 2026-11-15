import { Injectable } from '@nestjs/common';
import { type AddMemberRequest, type Member, type Role } from '@bytecontent/contracts';
import { type MembershipRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { AppError } from '../common/app-error';
import { type TenantContext } from '../common/request-context';
import { type Tx, TenantDb } from '../database/tenant-db.service';

type MembershipWithUser = {
  id: string;
  userId: string;
  role: MembershipRole;
  createdAt: Date;
  user: { email: string; name: string };
};

function toMember(m: MembershipWithUser): Member {
  return {
    id: m.id,
    userId: m.userId,
    email: m.user.email,
    name: m.user.name,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  };
}

const include = { user: { select: { email: true, name: true } } } as const;

@Injectable()
export class MembersService {
  constructor(
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  list(ctx: TenantContext): Promise<Member[]> {
    return this.db.run(ctx.tenantId, async (tx) =>
      (
        await tx.membership.findMany({
          where: { tenantId: ctx.tenantId },
          include,
          orderBy: { createdAt: 'asc' },
        })
      ).map(toMember),
    );
  }

  async add(ctx: TenantContext, input: AddMemberRequest): Promise<Member> {
    this.assertMayAssign(ctx, input.role);
    const passwordHash = input.password ? await this.passwords.hash(input.password) : null;
    return this.db.run(ctx.tenantId, async (tx) => {
      // Users are installation-wide (ADR-014); memberships are tenant-owned.
      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (!user) {
        if (!passwordHash || !input.name) {
          throw AppError.validation(
            [{ path: 'password', message: 'name and password are required for a new user' }],
            'User does not exist yet',
          );
        }
        user = await tx.user.create({
          data: { email: input.email, name: input.name, passwordHash },
        });
      }
      const existing = await tx.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenantId, userId: user.id } },
      });
      if (existing) throw AppError.conflict('MEMBER_EXISTS', 'User is already a member');
      const membership = await tx.membership.create({
        data: { tenantId: ctx.tenantId, userId: user.id, role: input.role },
        include,
      });
      await this.audit.record(tx, ctx, {
        action: 'member.added',
        targetType: 'membership',
        targetId: membership.id,
        metadata: { role: input.role },
      });
      return toMember(membership);
    });
  }

  async updateRole(ctx: TenantContext, id: string, role: Role): Promise<Member> {
    return this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.find(tx, ctx, id);
      this.assertMayAssign(ctx, current.role);
      this.assertMayAssign(ctx, role);
      if (current.role === 'owner' && role !== 'owner') await this.assertNotLastOwner(tx, ctx);
      const updated = await tx.membership.update({ where: { id }, data: { role }, include });
      await this.audit.record(tx, ctx, {
        action: 'member.role_changed',
        targetType: 'membership',
        targetId: id,
        changedKeys: ['role'],
        metadata: { from: current.role, to: role },
      });
      return toMember(updated);
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.db.run(ctx.tenantId, async (tx) => {
      const current = await this.find(tx, ctx, id);
      this.assertMayAssign(ctx, current.role);
      if (current.role === 'owner') await this.assertNotLastOwner(tx, ctx);
      await tx.membership.delete({ where: { id } });
      await this.audit.record(tx, ctx, {
        action: 'member.removed',
        targetType: 'membership',
        targetId: id,
      });
    });
  }

  private async find(tx: Tx, ctx: TenantContext, id: string) {
    const membership = await tx.membership.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!membership) throw AppError.notFound('Member');
    return membership;
  }

  /** Only owners may grant, change or remove the owner role. */
  private assertMayAssign(ctx: TenantContext, role: Role): void {
    if (role === 'owner' && ctx.role !== 'owner') {
      throw AppError.forbidden('Only owners can manage owners');
    }
  }

  private async assertNotLastOwner(tx: Tx, ctx: TenantContext): Promise<void> {
    const owners = await tx.membership.count({ where: { tenantId: ctx.tenantId, role: 'owner' } });
    if (owners <= 1) throw AppError.conflict('LAST_OWNER', 'A tenant must keep at least one owner');
  }
}
