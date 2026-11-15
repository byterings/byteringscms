import { SetMetadata } from '@nestjs/common';
import { type Permission } from '@bytecontent/contracts';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';
export const USER_ONLY_KEY = 'auth:userOnly';
export const PLATFORM_ADMIN_KEY = 'auth:platformAdmin';

/** Route needs no authentication. Credentials, if present, are still resolved. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Route needs a resolved tenant and every listed permission. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Route needs a signed-in user (browser session); API keys are rejected. */
export const RequireUser = () => SetMetadata(USER_ONLY_KEY, true);

/** Route needs a signed-in platform administrator. */
export const RequirePlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
