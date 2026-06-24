import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

// Direct parent → child role relationships (not pre-flattened)
const ROLE_INHERITANCE_MAP: Record<string, string[]> = {
  ADMIN: ["EXECUTIVE", "OPERATOR"],
  EXECUTIVE: ["SALES_MANAGER"],
  SALES_MANAGER: ["SALES_REP"],
  SALES_REP: [],
  OPERATOR: []
};

function collectDescendantRoleCodes(rootCode: string): string[] {
  const result = new Set<string>();
  const queue = [...(ROLE_INHERITANCE_MAP[rootCode] ?? [])];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    result.add(current);

    for (const child of ROLE_INHERITANCE_MAP[current] ?? []) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return [...result];
}

function collectAncestorRoleCodes(targetCode: string): string[] {
  const result: string[] = [];
  for (const [parent, children] of Object.entries(ROLE_INHERITANCE_MAP)) {
    if (children.includes(targetCode)) {
      result.push(parent);
      result.push(...collectAncestorRoleCodes(parent));
    }
  }
  return result;
}

export type EffectivePermissions = {
  roleCodes: string[];
  permissions: string[];
  dataScope: "SELF" | "TEAM" | "ALL";
};

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
        },
        permissionGrants: {
          include: { permission: true }
        }
      }
    });

    if (!user) {
      return { roleCodes: [], permissions: [], dataScope: "SELF" };
    }

    const directRoles = user.userRoles.map((ur: (typeof user.userRoles)[number]) => ur.role);
    const directRoleCodes = directRoles.map((r: (typeof directRoles)[number]) => r.code);

    // Collect all descendant role codes recursively
    const inheritedRoleCodes = new Set<string>();
    for (const code of directRoleCodes) {
      for (const descendant of collectDescendantRoleCodes(code)) {
        inheritedRoleCodes.add(descendant);
      }
    }

    // Collect permissions from direct roles
    const permissionSet = new Set<string>();
    for (const role of directRoles) {
      for (const rp of role.rolePermissions) {
        permissionSet.add(rp.permission.code);
      }
    }

    // Collect permissions from inherited roles (DB lookup)
    if (inheritedRoleCodes.size > 0) {
      const inheritedRoles = await this.prisma.role.findMany({
        where: {
          organizationId: user.organizationId,
          code: { in: [...inheritedRoleCodes] }
        },
        include: {
          rolePermissions: {
            include: { permission: true }
          }
        }
      });
      for (const role of inheritedRoles) {
        for (const rp of role.rolePermissions) {
          permissionSet.add(rp.permission.code);
        }
      }
    }

    // Apply user ALLOW grants
    for (const grant of user.permissionGrants) {
      permissionSet.add(grant.permission.code);
    }

    const dataScope = directRoles.some((r: (typeof directRoles)[number]) => r.dataScope === "ALL")
      ? "ALL"
      : directRoles.some((r: (typeof directRoles)[number]) => r.dataScope === "TEAM")
        ? "TEAM"
        : "SELF";

    return {
      roleCodes: directRoleCodes,
      permissions: [...permissionSet],
      dataScope
    };
  }

  getInheritedRoleCodes(roleCode: string): string[] {
    return collectDescendantRoleCodes(roleCode);
  }

  getParentRoleCodes(roleCode: string): string[] {
    return [...new Set(collectAncestorRoleCodes(roleCode))];
  }
}
