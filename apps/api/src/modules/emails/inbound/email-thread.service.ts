import { Injectable, NotFoundException } from "@nestjs/common";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../../common/query/data-scope";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

@Injectable()
export class EmailThreadService {
  constructor(private readonly prisma: PrismaService) {}

  async listCustomerThreads(user: RequestUser, customerId: string) {
    await this.ensureCustomerVisible(user, customerId);
    return this.prisma.emailThread.findMany({
      where: { customerId }, orderBy: { lastMessageAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } }
    });
  }

  async listThreads(user: RequestUser) {
    return this.prisma.emailThread.findMany({
      where: { customer: buildCustomerDataScopeWhere(user) },
      include: { customer: { select: { id: true, name: true, stage: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastMessageAt: "desc" }, take: 100
    });
  }

  async listThreadMessages(user: RequestUser, threadId: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, customer: buildCustomerDataScopeWhere(user) }
    });
    if (!thread) throw new NotFoundException("Email thread not found");
    return this.prisma.emailMessage.findMany({
      where: { threadId }, orderBy: { createdAt: "asc" }, include: { attachments: true }
    });
  }

  private async ensureCustomerVisible(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...buildCustomerDataScopeWhere(user) }
    });
    if (!customer) throw new NotFoundException("Customer not found");
    return customer;
  }
}
