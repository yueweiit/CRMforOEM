import { Injectable } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

@Injectable()
export class OrganizationQueryService {
  constructor(private readonly prisma: PrismaService) {}

  listTeams(user: RequestUser) {
    return this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  listAuditLogs(user: RequestUser) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: user.organizationId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }
}
