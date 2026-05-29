import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerStage } from "@oem-crm/shared";
import { PrismaService } from "../../prisma/prisma.service";

type AdvanceCustomerStageInput = {
  customerId: string;
  toStage: CustomerStage;
  changedById?: string;
  reason: string;
  expectedFromStages?: CustomerStage[];
  skipIfSame?: boolean;
};

@Injectable()
export class CustomerStageService {
  constructor(private readonly prisma: PrismaService) {}

  async advanceCustomerStage(input: AdvanceCustomerStageInput) {
    const skipIfSame = input.skipIfSame ?? true;

    await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true, stage: true }
      });

      if (!customer) {
        throw new NotFoundException("Customer not found");
      }

      if (skipIfSame && customer.stage === input.toStage) {
        return;
      }

      if (input.expectedFromStages?.length) {
        const currentStage = customer.stage as CustomerStage;
        if (!input.expectedFromStages.includes(currentStage)) {
          return;
        }
      }

      await tx.customerStageHistory.create({
        data: {
          customerId: customer.id,
          fromStage: customer.stage as never,
          toStage: input.toStage as never,
          changedById: input.changedById,
          reason: input.reason
        }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: { stage: input.toStage as never }
      });
    });
  }
}
