import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from "../auth/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const anyRequired = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required?.length && !anyRequired?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userPermissions = new Set<string>(request.user?.permissions ?? []);

    if (anyRequired?.length) {
      if (!anyRequired.some((p) => userPermissions.has(p))) return false;
    }

    if (required?.length) {
      if (!required.every((p) => userPermissions.has(p))) return false;
    }

    return true;
  }
}

