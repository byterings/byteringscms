/**
 * Test database connection. Override with TEST_DATABASE_URL. The default
 * matches `pnpm db:setup-local` and the CI service (local credentials only).
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://byterings:byterings@localhost:5432/byterings_test';
