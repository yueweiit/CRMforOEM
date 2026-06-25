import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { PermissionService } from "../permission.service";
import type { CreateUserDto, UpdateUserDto } from "../dto/settings.dto";

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionService: PermissionService
  ) {}

  listUsers(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true, email: true, name: true, title: true, teamId: true, isActive: true, lastLoginAt: true, createdAt: true,
        team: { select: { id: true, name: true } },
        userRoles: { include: { role: { select: { id: true, code: true, name: true, dataScope: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async createUser(user: RequestUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("User email already exists");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: user.organizationId,
          teamId: dto.teamId,
          email: dto.email,
          name: dto.name,
          title: dto.title,
          passwordHash: await bcrypt.hash(dto.password, 10)
        }
      });
      await this.replaceUserRoles(tx, user.organizationId, created.id, dto.roleCodes ?? ["SALES_REP"]);
      return created;
    });
  }

  async updateUser(user: RequestUser, id: string, dto: UpdateUserDto) {
    const existing = await this.ensureUser(user, id);
    const wasActive = existing.isActive;
    const wasTeamId = existing.teamId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          teamId: dto.teamId,
          title: dto.title,
          isActive: dto.isActive
        }
      });
      if (dto.roleCodes) {
        await this.replaceUserRoles(tx, user.organizationId, id, dto.roleCodes);
      }
      return result;
    });

    if (dto.isActive === false && wasActive) {
      try {
        await this.eventEmitter.emitAsync("auth.user.disabled", { userId: id });
      } catch (err) {
        this.logger.error("Failed to revoke disabled user sessions", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("User disabled but session revoke failed, please retry");
      }
    }
    if (dto.roleCodes) {
      try {
        await this.eventEmitter.emitAsync("auth.user.roles_changed", { userId: id });
      } catch (err) {
        this.logger.error("Failed to bump permission version for role change", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("Roles changed but live session invalidation failed, please retry");
      }
    }
    if (dto.teamId !== undefined && dto.teamId !== wasTeamId) {
      try {
        await this.eventEmitter.emitAsync("auth.user.roles_changed", { userId: id });
      } catch (err) {
        this.logger.error("Failed to bump permission version for team change", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("Team changed but live session invalidation failed, please retry");
      }
    }

    return updated;
  }

  async emitPermissionChanged(organizationId: string, roleId: string, roleCode: string) {
    const directUsers = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true }
    });
    const affectedDirectUserIds = directUsers.map((ur) => ur.userId);

    const parentRoleCodes = this.permissionService.getParentRoleCodes(roleCode);
    let affectedInheritedUserIds: string[] = [];
    if (parentRoleCodes.length > 0) {
      const parentRoles = await this.prisma.role.findMany({
        where: { organizationId, code: { in: parentRoleCodes } },
        select: { id: true }
      });
      const parentRoleIds = parentRoles.map((r) => r.id);
      if (parentRoleIds.length > 0) {
        const inheritedUsers = await this.prisma.userRole.findMany({
          where: { roleId: { in: parentRoleIds } },
          select: { userId: true }
        });
        affectedInheritedUserIds = [...new Set(inheritedUsers.map((ur) => ur.userId))];
      }
    }

    if (affectedDirectUserIds.length > 0 || affectedInheritedUserIds.length > 0) {
      await this.eventEmitter.emitAsync("auth.permission.changed", {
        affectedDirectUserIds,
        affectedInheritedUserIds
      });
    }
  }

  private async ensureUser(user: RequestUser, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("User not found");
    return existing;
  }

  private async replaceUserRoles(tx: Prisma.TransactionClient, organizationId: string, userId: string, roleCodes: string[]) {
    const roles = await tx.role.findMany({ where: { organizationId, code: { in: roleCodes } } });
    await tx.userRole.deleteMany({ where: { userId } });
    if (!roles.length) return;
    await tx.userRole.createMany({
      data: roles.map((role) => ({ userId, roleId: role.id })),
      skipDuplicates: true
    });
  }
}
