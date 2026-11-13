import { randomBytes } from 'node:crypto';
import { type MembershipRole, PrismaClient } from '@prisma/client';
import { TEST_DATABASE_URL } from './test-db-url';

/** Short random suffix so every test creates its own isolated data. */
export function uniq(prefix = 't'): string {
  return `${prefix}-${randomBytes(5).toString('hex')}`;
}

let client: PrismaClient | undefined;

/** Raw client for fixtures. Uses RLS bypass explicitly for setup only. */
export function fixtureDb(url = TEST_DATABASE_URL): PrismaClient {
  if (!client) client = new PrismaClient({ datasourceUrl: url });
  return client;
}

export async function closeFixtureDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

export async function asSystem<T>(
  fn: (tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return fixtureDb().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}

export async function createTenant(name = uniq('tenant')): Promise<{ id: string; slug: string }> {
  return asSystem((tx) =>
    tx.tenant.create({ data: { name, slug: name }, select: { id: true, slug: true } }),
  );
}

export async function createUser(
  opts: { email?: string; passwordHash?: string; isPlatformAdmin?: boolean } = {},
): Promise<{ id: string; email: string }> {
  return asSystem((tx) =>
    tx.user.create({
      data: {
        email: opts.email ?? `${uniq('user')}@example.test`,
        name: 'Test User',
        passwordHash: opts.passwordHash ?? 'not-a-real-hash',
        isPlatformAdmin: opts.isPlatformAdmin ?? false,
      },
      select: { id: true, email: true },
    }),
  );
}

export async function addMembership(
  tenantId: string,
  userId: string,
  role: MembershipRole,
): Promise<{ id: string }> {
  return asSystem((tx) =>
    tx.membership.create({ data: { tenantId, userId, role }, select: { id: true } }),
  );
}
