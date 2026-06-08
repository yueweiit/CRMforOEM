import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "../auth/public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    let payload: {
      sub: string;
      organizationId: string;
      teamId?: string;
      roleCodes?: string[];
      permissions?: string[];
      dataScope?: string;
      sessionId?: string;
      permissionVersion?: number;
      type?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET")
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired bearer token");
    }

    // If token has a type field, it must be "access" — reject refresh tokens
    if (payload.type !== undefined && payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    request.user = {
      id: payload.sub,
      organizationId: payload.organizationId,
      teamId: payload.teamId,
      roleCodes: payload.roleCodes ?? [],
      permissions: payload.permissions ?? [],
      dataScope: payload.dataScope ?? "SELF",
      sessionId: payload.sessionId,
      permissionVersion: payload.permissionVersion,
      tokenType: payload.type as "access" | "refresh" | undefined
    };
    return true;
  }
}
