import { ForbiddenException, Injectable } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { DashboardQueryDto } from "../dto/dashboard-query.dto";
import { between } from "../helpers/date-utils";
import type { CustomerWhere, DateRange } from "../types";

@Injectable()
export class DashboardQueryBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async filterOptions(user: RequestUser) {
    const allowedTeamIds = await this.getAllowedTeamIds(user);
    const teamWhere =
      user.dataScope === "ALL"
        ? { organizationId: user.organizationId }
        : allowedTeamIds.length
          ? { organizationId: user.organizationId, id: { in: allowedTeamIds } }
          : { organizationId: user.organizationId, id: "__none__" };

    const userWhere =
      user.dataScope === "ALL"
        ? { organizationId: user.organizationId, isActive: true }
        : user.dataScope === "TEAM" && allowedTeamIds.length
          ? { organizationId: user.organizationId, teamId: { in: allowedTeamIds }, isActive: true }
          : { organizationId: user.organizationId, id: user.id, isActive: true };
    const countryScope = await this.buildCustomerWhere(
      user,
      {},
      user.dataScope === "ALL" ? "management" : user.dataScope === "TEAM" ? "team" : "personal",
      false
    );

    const [teams, users, countries, customerTypes] = await Promise.all([
      this.prisma.team.findMany({
        where: teamWhere, select: { id: true, name: true }, orderBy: { name: "asc" }
      }),
      this.prisma.user.findMany({
        where: userWhere, select: { id: true, name: true, teamId: true }, orderBy: { name: "asc" }
      }),
      this.prisma.customer.findMany({
        where: countryScope as never, distinct: ["country"], select: { country: true }, orderBy: { country: "asc" }
      }),
      this.prisma.customerType.findMany({
        where: { organizationId: user.organizationId, isActive: true },
        select: { id: true, name: true }, orderBy: { name: "asc" }
      })
    ]);

    return {
      teams,
      users,
      countries: countries.map((item) => item.country).filter(Boolean),
      customer_types: customerTypes,
      stages: [] // Will be set by main service
    };
  }

  async buildCustomerWhere(
    user: RequestUser,
    query: DashboardQueryDto,
    mode: "personal" | "team" | "management",
    withCreatedRange: boolean,
    range?: DateRange
  ) {
    const where: CustomerWhere = { organizationId: user.organizationId };

    if (query.country) where.country = query.country;
    if (query.customerTypeId || query.customer_type_id) where.typeId = query.customerTypeId ?? query.customer_type_id;
    if (query.stage) where.stage = query.stage;
    if (withCreatedRange && range) where.createdAt = between(range);

    if (mode === "personal" && user.dataScope === "ALL") return where;
    if (mode === "personal" || user.dataScope === "SELF") {
      where.ownerId = user.id;
      return where;
    }

    const requestedOwnerId = query.ownerId ?? query.owner_id;
    const requestedTeamId = query.teamId ?? query.team_id;

    if (mode === "team" && user.dataScope === "ALL") {
      if (requestedTeamId) where.owner = { teamId: requestedTeamId };
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      return where;
    }

    if (mode === "team" || user.dataScope === "TEAM") {
      if (!user.teamId) { where.ownerId = user.id; return where; }
      const allowedTeamIds = await this.getAllowedTeamIds(user);
      if (requestedTeamId && !allowedTeamIds.includes(requestedTeamId)) {
        throw new ForbiddenException("Cannot access another team's dashboard");
      }
      where.owner = { teamId: { in: requestedTeamId ? [requestedTeamId] : allowedTeamIds } };
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      return where;
    }

    if (mode === "management") {
      if (requestedOwnerId) where.ownerId = requestedOwnerId;
      if (requestedTeamId) where.owner = { teamId: requestedTeamId };
    }

    return where;
  }

  async getAllowedTeamIds(user: RequestUser) {
    if (user.dataScope === "ALL") return [];
    if (user.dataScope !== "TEAM" || !user.teamId) return user.teamId ? [user.teamId] : [];

    const teams = await this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, parentId: true }
    });
    const childIdsByParent = new Map<string, string[]>();
    for (const team of teams) {
      if (!team.parentId) continue;
      const children = childIdsByParent.get(team.parentId) ?? [];
      children.push(team.id);
      childIdsByParent.set(team.parentId, children);
    }

    const result = new Set<string>([user.teamId]);
    const queue = [user.teamId];
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      for (const childId of childIdsByParent.get(current) ?? []) {
        if (result.has(childId)) continue;
        result.add(childId);
        queue.push(childId);
      }
    }
    return Array.from(result);
  }

  buildFollowupOwnerWhere(user: RequestUser) {
    return user.dataScope === "ALL" ? {} : { ownerId: user.id };
  }
}
