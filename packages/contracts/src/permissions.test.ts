import { describe, expect, it } from 'vitest';
import {
  API_KEY_SCOPES,
  effectiveRoleForScopes,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  roleAtLeast,
} from './permissions';

describe('permission matrix', () => {
  it('gives the owner every permission', () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('is strictly cumulative from viewer to owner', () => {
    const order = ['viewer', 'editor', 'admin', 'owner'] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = ROLE_PERMISSIONS[order[i - 1]!];
      const higher = ROLE_PERMISSIONS[order[i]!];
      expect(lower.every((p) => higher.includes(p))).toBe(true);
      expect(higher.length).toBeGreaterThan(lower.length);
    }
  });

  it('keeps sensitive permissions away from editors and viewers', () => {
    for (const role of ['viewer', 'editor'] as const) {
      expect(ROLE_PERMISSIONS[role]).not.toContain('metadata:write');
      expect(ROLE_PERMISSIONS[role]).not.toContain('members:manage');
      expect(ROLE_PERMISSIONS[role]).not.toContain('apikeys:manage');
    }
    expect(ROLE_PERMISSIONS.admin).not.toContain('tenant:manage');
  });

  it('only allows data scopes on API keys', () => {
    expect(API_KEY_SCOPES).not.toContain('members:manage' as never);
    expect(API_KEY_SCOPES).not.toContain('apikeys:manage' as never);
  });

  it('compares roles by rank', () => {
    expect(roleAtLeast('admin', 'editor')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
  });

  it('maps API key scopes to an effective role', () => {
    expect(effectiveRoleForScopes(['records:read'])).toBe('viewer');
    expect(effectiveRoleForScopes(['records:read', 'records:write'])).toBe('editor');
    expect(effectiveRoleForScopes(['metadata:write'])).toBe('admin');
  });
});
