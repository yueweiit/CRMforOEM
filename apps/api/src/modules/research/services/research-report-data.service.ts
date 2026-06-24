import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

@Injectable()
export class ResearchReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }

  findActiveReport(customerId: string, organizationId: string) {
    return this.prisma.researchReport.findFirst({
      where: { customerId, customer: { organizationId }, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
      include: { aiGenerationRun: true }
    });
  }

  getLatestWebsiteAnalysis(customerId: string) {
    return this.prisma.websiteAnalysis.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, crawledUrls: true, productCount: true, createdAt: true }
    });
  }

  createReport(params: {
    customerId: string;
    aiGenerationRunId: string;
    title: string;
    sourceEvidence: Record<string, unknown>;
    createdById: string;
  }) {
    return this.prisma.researchReport.create({
      data: {
        customerId: params.customerId,
        aiGenerationRunId: params.aiGenerationRunId,
        status: "QUEUED",
        title: params.title,
        sourceEvidence: params.sourceEvidence as never,
        createdById: params.createdById
      },
      include: { aiGenerationRun: { include: { versions: true } } }
    });
  }

  updateCustomerStageToResearching(customerId: string) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { stage: CustomerStage.Researching as never }
    });
  }

  getLatestReport(customerId: string) {
    return this.prisma.researchReport.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: { aiGenerationRun: { include: { versions: { orderBy: { createdAt: "asc" } } } } }
    });
  }
}
