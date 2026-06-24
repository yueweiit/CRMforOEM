import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { CustomerWhere } from "../types";

@Injectable()
export class DistributionService {
  constructor(private readonly prisma: PrismaService) {}

  async getStageDistribution(customerWhere: CustomerWhere) {
    const rows = await this.prisma.customer.groupBy({
      by: ["stage"],
      where: customerWhere as never,
      _count: { _all: true }
    });
    return rows.map((row) => ({ stage: row.stage, count: row._count._all }));
  }

  async getCountryDistribution(customerWhere: CustomerWhere) {
    const rows = await this.prisma.customer.groupBy({
      by: ["country"],
      where: customerWhere as never,
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } }
    });
    return rows.map((row) => ({ country: row.country ?? "unknown", count: row._count._all }));
  }

  async getTypeDistribution(customerWhere: CustomerWhere) {
    const customers = await this.prisma.customer.findMany({
      where: customerWhere as never,
      select: { type: { select: { id: true, name: true } } }
    });
    const counts = new Map<string, { customer_type_id: string | null; customer_type: string; count: number }>();
    for (const customer of customers) {
      const key = customer.type?.id ?? "unknown";
      const current = counts.get(key) ?? {
        customer_type_id: customer.type?.id ?? null,
        customer_type: customer.type?.name ?? "unknown",
        count: 0
      };
      current.count += 1;
      counts.set(key, current);
    }
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }
}
