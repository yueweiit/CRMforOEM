import type { RequestUser } from "./current-user.decorator";

export function hasPermission(user: RequestUser, permissionCode: string): boolean {
  return user.permissions?.includes(permissionCode) ?? false;
}

export function hasAnyPermission(user: RequestUser, ...permissionCodes: string[]): boolean {
  return permissionCodes.some((code) => hasPermission(user, code));
}
