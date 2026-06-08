import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { PermissionService } from "../settings/permission.service";
import { AuthSessionService } from "./auth-session.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly permissionService: PermissionService,
    private readonly authSessionService: AuthSessionService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });

    if (!user?.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const effective = await this.permissionService.getEffectivePermissions(user.id);
    const sessionId = randomUUID();

    const refreshTtlSeconds = this.parseSeconds(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d"));

    const permissionVersion = await this.authSessionService.getOrInitializePermissionVersion(
      user.id,
      refreshTtlSeconds
    );

    await this.authSessionService.createSession({
      sessionId,
      userId: user.id,
      organizationId: user.organizationId,
      permissionVersion,
      ttlSeconds: refreshTtlSeconds
    });

    const accessPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      teamId: user.teamId,
      sessionId,
      roleCodes: effective.roleCodes,
      permissions: effective.permissions,
      dataScope: effective.dataScope,
      permissionVersion,
      type: "access" as const
    };

    const refreshPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      sessionId,
      type: "refresh" as const
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return {
      accessToken: this.jwt.sign(accessPayload, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m")
      }),
      refreshToken: this.jwt.sign(refreshPayload, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d")
      }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleCodes: effective.roleCodes,
        permissions: effective.permissions,
        dataScope: effective.dataScope
      }
    };
  }

  async refresh(refreshToken: string) {
    let payload: {
      sub: string;
      organizationId: string;
      sessionId?: string;
      type?: string;
    };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET")
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid token type");
    }

    if (!payload.sessionId) {
      throw new UnauthorizedException("Session expired, please login again");
    }

    // Validate Redis session
    const session = await this.authSessionService.getSession(payload.sessionId);
    if (!session || !session.isActive) {
      throw new UnauthorizedException("Session expired, please login again");
    }

    // Re-query user from DB — check not disabled and org matches
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });
    if (!user?.isActive) {
      await this.authSessionService.revokeUserSessions(payload.sub).catch(() => {});
      throw new UnauthorizedException("Account disabled");
    }

    // Verify organization consistency across token, session, and DB
    if (
      payload.organizationId !== session.organizationId ||
      payload.organizationId !== user.organizationId
    ) {
      throw new UnauthorizedException("Invalid session");
    }

    const refreshTtlSeconds = this.parseSeconds(this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d"));

    // Recompute effective permissions from DB — get latest
    const effective = await this.permissionService.getEffectivePermissions(user.id);
    const permissionVersion = await this.authSessionService.getRequiredPermissionVersion(
      user.id,
      refreshTtlSeconds
    );

    return {
      accessToken: this.jwt.sign(
        {
          sub: user.id,
          organizationId: user.organizationId,
          teamId: user.teamId,
          sessionId: payload.sessionId,
          roleCodes: effective.roleCodes,
          permissions: effective.permissions,
          dataScope: effective.dataScope,
          permissionVersion,
          type: "access" as const
        },
        {
          secret: this.config.get<string>("JWT_ACCESS_SECRET"),
          expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m")
        }
      )
    };
  }

  async logout(user: RequestUser) {
    if (user.sessionId) {
      await this.authSessionService.revokeSession(user.sessionId).catch(() => {});
    }
    return { ok: true };
  }

  async getMePermissions(userId: string) {
    return this.permissionService.getEffectivePermissions(userId);
  }

  private parseSeconds(value: string): number {
    const match = value.match(/^(\d+)\s*(s|m|h|d)$/);
    if (!match) return 7 * 24 * 60 * 60; // default 7 days
    const num = Number(match[1]);
    switch (match[2]) {
      case "s": return num;
      case "m": return num * 60;
      case "h": return num * 60 * 60;
      case "d": return num * 24 * 60 * 60;
      default: return num;
    }
  }
}
