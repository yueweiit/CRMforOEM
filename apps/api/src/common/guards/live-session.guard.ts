import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthSessionService } from "../../modules/auth/auth-session.service";
import { REQUIRE_LIVE_SESSION_KEY } from "../auth/live-session.decorator";

@Injectable()
export class LiveSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authSessionService: AuthSessionService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(REQUIRE_LIVE_SESSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    await this.authSessionService.validateSession({
      sessionId: user.sessionId,
      userId: user.id,
      organizationId: user.organizationId,
      permissionVersion: user.permissionVersion
    });

    return true;
  }
}
