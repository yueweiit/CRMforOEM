import { ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { hasPermission } from "../../../common/auth/permission.utils";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import { toStringArray } from "../prompts/settings-email-prompt.defaults";
import type { UpdateRolePermissionsDto } from "../dto/settings.dto";
import { UserManagementService } from "./user-management.service";

type PermissionRow = { code: string; id: string; dependsOn: unknown };
type RoleWithPerms = { code: string; rolePermissions: Array<{ permission: { code: string } }> };

@Injectable()
export class RolePermissionService {
  private readonly logger = new Logger(RolePermissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userManagement: UserManagementService
  ) {}

  listRoles(user: RequestUser) {
    return this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { code: "asc" }
    });
  }

  listPermissions(user: RequestUser) {
    return this.prisma.permission.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ module: "asc" }, { code: "asc" }]
    });
  }

  async updateRolePermissions(user: RequestUser, roleId: string, dto: UpdateRolePermissionsDto) {
    if (!hasPermission(user, "settings.roles.manage")) {
      throw new ForbiddenException("You do not have permission to modify role permissions");
    }

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: true } } }
    });
    if (!role) throw new NotFoundException("Role not found");

    if (role.code === "ADMIN" && dto.permissionCodes.length === 0) {
      throw new ForbiddenException("Cannot remove all permissions from ADMIN role");
    }

    const allPerms = await this.prisma.permission.findMany({
      where: { organizationId: user.organizationId }
    });
    const permByCode = new Map<string, PermissionRow>(allPerms.map((p: PermissionRow) => [p.code, p]));

    const expandedCodes = new Set<string>();
    const queue = [...dto.permissionCodes];
    while (queue.length > 0) {
      const code = queue.shift()!;
      if (expandedCodes.has(code)) continue;
      const permission = permByCode.get(code);
      if (!permission) throw new NotFoundException(`Unknown permission: ${code}`);
      expandedCodes.add(code);
      for (const dep of toStringArray(permission.dependsOn)) {
        if (!permByCode.has(dep)) throw new NotFoundException(`Permission "${code}" depends on unknown permission "${dep}"`);
        if (!expandedCodes.has(dep)) queue.push(dep);
      }
    }

    const expandedPermIds = [...expandedCodes]
      .map((code) => permByCode.get(code)?.id)
      .filter((id): id is string => Boolean(id));

    const oldCodes = (role as RoleWithPerms).rolePermissions.map((rp) => rp.permission.code).sort();

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (expandedPermIds.length > 0) {
        await tx.rolePermission.createMany({
          data: expandedPermIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true
        });
      }
    });

    const newCodes = [...expandedCodes].sort();

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId, actorId: user.id, action: "UPDATE",
        entityType: "ROLE_PERMISSIONS", entityId: roleId,
        before: { roleCode: role.code, permissions: oldCodes } as never,
        after: { roleCode: role.code, permissions: newCodes } as never
      }
    });

    try {
      await this.userManagement.emitPermissionChanged(user.organizationId, roleId, role.code);
    } catch (err) {
      this.logger.error("Failed to apply permission version bump", err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException("Permissions changed but live session invalidation failed, please retry");
    }

    return { roleCode: role.code, permissionCodes: newCodes, expandedFrom: dto.permissionCodes };
  }
}
