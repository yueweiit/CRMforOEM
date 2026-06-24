import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";

@Injectable()
export class AuditCleanupService {
  private readonly logger = new Logger(AuditCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("0 3 * * *")
  async cleanupOldAuditLogs() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } }
      });
      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} audit log(s) older than 90 days`);
      }
    } catch (err) {
      this.logger.warn(`Audit log cleanup failed: ${(err as Error).message}`);
    }
  }
}
