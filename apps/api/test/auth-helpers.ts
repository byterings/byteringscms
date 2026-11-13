import { hash } from '@node-rs/argon2';
import { type MembershipRole } from '@prisma/client';
import request from 'supertest';
import { type App } from 'supertest/types';
import { addMembership, asSystem, createTenant, uniq } from './fixtures';

export const TEST_PASSWORD = 'correct horse battery staple';

let cachedHash: Promise<string> | undefined;
function passwordHash(): Promise<string> {
  cachedHash ??= hash(TEST_PASSWORD);
  return cachedHash;
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

export async function seedUser(opts: { isPlatformAdmin?: boolean } = {}): Promise<SeededUser> {
  const email = `${uniq('user')}@example.test`;
  const user = await asSystem(async (tx) =>
    tx.user.create({
      data: {
        email,
        name: 'Test User',
        passwordHash: await passwordHash(),
        isPlatformAdmin: opts.isPlatformAdmin ?? false,
      },
    }),
  );
  return { id: user.id, email, password: TEST_PASSWORD };
}

export interface SeededTenant {
  tenant: { id: string; slug: string };
  owner: SeededUser;
}

export async function seedTenant(): Promise<SeededTenant> {
  const tenant = await createTenant();
  const owner = await seedUser();
  await addMembership(tenant.id, owner.id, 'owner');
  return { tenant, owner };
}

export async function seedMember(tenantId: string, role: MembershipRole): Promise<SeededUser> {
  const user = await seedUser();
  await addMembership(tenantId, user.id, role);
  return user;
}

export interface LoggedIn {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  session: {
    activeTenant: { id: string; role: string } | null;
    permissions: string[];
    memberships: { tenantId: string }[];
  };
}

/** Signs in through the real API; the agent keeps the session cookie. */
export async function login(
  app: App,
  user: { email: string; password: string },
): Promise<LoggedIn> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ email: user.email, password: user.password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { agent, csrf: res.body.data.csrfToken, session: res.body.data };
}

/** Creates an API key through the API as the given signed-in owner/admin. */
export async function createApiKey(
  owner: LoggedIn,
  scopes: string[],
  extra: Record<string, unknown> = {},
): Promise<{ id: string; key: string }> {
  const res = await owner.agent
    .post('/api/v1/admin/api-keys')
    .set('x-csrf-token', owner.csrf)
    .send({ name: uniq('key'), scopes, ...extra });
  if (res.status !== 201)
    throw new Error(`api key failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.data.apiKey.id, key: res.body.data.key };
}
