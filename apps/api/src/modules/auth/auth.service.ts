import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });

    if (!user?.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const roles = user.userRoles.map((item) => item.role);
    const permissions = roles.flatMap((role) => role.rolePermissions.map((item) => item.permission.code));
    const dataScope = roles.some((role) => role.dataScope === "ALL")
      ? "ALL"
      : roles.some((role) => role.dataScope === "TEAM")
        ? "TEAM"
        : "SELF";

    const payload = {
      sub: user.id,
      organizationId: user.organizationId,
      teamId: user.teamId,
      roleCodes: roles.map((role) => role.code),
      permissions,
      dataScope
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return {
      accessToken: this.jwt.sign(payload, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m")
      }),
      refreshToken: this.jwt.sign(payload, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES_IN", "7d")
      }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleCodes: payload.roleCodes,
        permissions: payload.permissions,
        dataScope
      }
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync(refreshToken, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET")
    });
    return {
      accessToken: this.jwt.sign(
        {
          sub: payload.sub,
          organizationId: payload.organizationId,
          teamId: payload.teamId,
          roleCodes: payload.roleCodes,
          permissions: payload.permissions,
          dataScope: payload.dataScope
        },
        {
          secret: this.config.get<string>("JWT_ACCESS_SECRET"),
          expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES_IN", "15m")
        }
      )
    };
  }
}

