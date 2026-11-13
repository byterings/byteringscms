import { z } from 'zod';

/** Built-in membership roles (ADR-018), lowest to highest privilege. */
export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

export const ROLE_RANK: Readonly<Record<Role, number>> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const PERMISSIONS = [
  'tenant:manage',
  'members:manage',
  'apikeys:manage',
  'templates:manage',
  'audit:read',
  'metadata:read',
  'metadata:write',
  'records:read',
  'records:write',
  'media:read',
  'media:write',
] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type Permission = z.infer<typeof permissionSchema>;

const VIEWER: readonly Permission[] = ['metadata:read', 'records:read', 'media:read'];
const EDITOR: readonly Permission[] = [...VIEWER, 'records:write', 'media:write'];
const ADMIN: readonly Permission[] = [
  ...EDITOR,
  'metadata:write',
  'members:manage',
  'apikeys:manage',
  'templates:manage',
  'audit:read',
];
const OWNER: readonly Permission[] = [...ADMIN, 'tenant:manage'];

/** Fixed permission matrix for the built-in roles. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  viewer: VIEWER,
  editor: EDITOR,
  admin: ADMIN,
  owner: OWNER,
};

/** Scopes an API key may carry (a subset of permissions). */
export const API_KEY_SCOPES = [
  'metadata:read',
  'metadata:write',
  'records:read',
  'records:write',
  'media:read',
  'media:write',
] as const satisfies readonly Permission[];
export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

/**
 * Role used for field-level permission checks of API keys: keys that may
 * change metadata act as admins, keys that may write records as editors,
 * everything else as viewers.
 */
export function effectiveRoleForScopes(scopes: readonly string[]): Role {
  if (scopes.includes('metadata:write')) return 'admin';
  if (scopes.includes('records:write') || scopes.includes('media:write')) return 'editor';
  return 'viewer';
}
