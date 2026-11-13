// Creates the local application role and databases on a PostgreSQL server.
//
// Usage: pnpm --filter @byteringscms/api db:setup-local
//
// ADMIN_DATABASE_URL  superuser connection (default postgres:postgres@localhost:5432)
// APP_DB_USER / APP_DB_PASSWORD  application role (default byterings / byterings)
//
// The application role is intentionally NOT a superuser and does not have
// BYPASSRLS, so PostgreSQL row-level security policies apply to it.
// Local development credentials only - never use these in production.
import { PrismaClient } from '@prisma/client';

const adminUrl =
  process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
const user = process.env.APP_DB_USER ?? 'byterings';
const password = process.env.APP_DB_PASSWORD ?? 'byterings';
const databases = ['byterings_dev', 'byterings_test'];

if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error('APP_DB_USER must be a simple identifier');

const db = new PrismaClient({ datasourceUrl: adminUrl });
try {
  const roles = await db.$queryRaw`SELECT 1 FROM pg_roles WHERE rolname = ${user}`;
  const quotedPassword = `'${password.replaceAll("'", "''")}'`;
  if (roles.length === 0) {
    await db.$executeRawUnsafe(
      `CREATE ROLE ${user} LOGIN CREATEDB NOSUPERUSER NOBYPASSRLS PASSWORD ${quotedPassword}`,
    );
    console.log(`created role ${user}`);
  } else {
    await db.$executeRawUnsafe(
      `ALTER ROLE ${user} LOGIN CREATEDB NOSUPERUSER NOBYPASSRLS PASSWORD ${quotedPassword}`,
    );
    console.log(`role ${user} exists (settings refreshed)`);
  }
  for (const name of databases) {
    const existing = await db.$queryRaw`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (existing.length === 0) {
      await db.$executeRawUnsafe(`CREATE DATABASE ${name} OWNER ${user} ENCODING 'UTF8'`);
      console.log(`created database ${name}`);
    } else {
      console.log(`database ${name} exists`);
    }
  }
} finally {
  await db.$disconnect();
}
