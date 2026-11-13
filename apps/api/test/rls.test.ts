import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service';
import { TenantDb } from '../src/database/tenant-db.service';
import { addMembership, closeFixtureDb, createTenant, createUser } from './fixtures';
import { testEnv } from './helpers';

describe('row-level security (database layer)', () => {
  const prisma = new PrismaService(testEnv());
  const db = new TenantDb(prisma);
  let tenantA: { id: string };
  let tenantB: { id: string };
  let user: { id: string };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    user = await createUser();
    await addMembership(tenantA.id, user.id, 'owner');
    await addMembership(tenantB.id, user.id, 'viewer');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await closeFixtureDb();
  });

  it('only returns rows of the tenant set on the transaction', async () => {
    const rowsA = await db.run(tenantA.id, (tx) =>
      tx.membership.findMany({ where: { userId: user.id } }),
    );
    expect(rowsA.map((m) => m.tenantId)).toEqual([tenantA.id]);

    const rowsB = await db.run(tenantB.id, (tx) =>
      tx.membership.findMany({ where: { userId: user.id } }),
    );
    expect(rowsB.map((m) => m.tenantId)).toEqual([tenantB.id]);
  });

  it('hides rows even when the query explicitly asks for another tenant', async () => {
    const leaked = await db.run(tenantA.id, (tx) =>
      tx.membership.findMany({ where: { tenantId: tenantB.id } }),
    );
    expect(leaked).toEqual([]);
  });

  it('fails closed when no tenant context is set', async () => {
    const rows = await prisma.membership.findMany({ where: { userId: user.id } });
    expect(rows).toEqual([]);
  });

  it('rejects writes of rows belonging to another tenant', async () => {
    const other = await createUser();
    await expect(
      db.run(tenantA.id, (tx) =>
        tx.membership.create({ data: { tenantId: tenantB.id, userId: other.id, role: 'admin' } }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot update or delete another tenant’s rows', async () => {
    const updated = await db.run(tenantA.id, (tx) =>
      tx.membership.updateMany({ where: { tenantId: tenantB.id }, data: { role: 'owner' } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await db.run(tenantA.id, (tx) =>
      tx.membership.deleteMany({ where: { tenantId: tenantB.id } }),
    );
    expect(deleted.count).toBe(0);
    const stillThere = await db.system((tx) =>
      tx.membership.findMany({ where: { tenantId: tenantB.id, userId: user.id } }),
    );
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]?.role).toBe('viewer');
  });

  it('does not leak tenant context between transactions on pooled connections', async () => {
    await db.run(tenantA.id, (tx) => tx.membership.count());
    const rows = await prisma.membership.findMany({ where: { userId: user.id } });
    expect(rows).toEqual([]);
  });

  it('rejects non-UUID tenant ids', async () => {
    await expect(db.run("x' OR 1=1 --", async () => 1)).rejects.toThrow(/UUID/);
  });
});
