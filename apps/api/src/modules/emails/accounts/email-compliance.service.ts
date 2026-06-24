import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";

@Injectable()
export class EmailComplianceService {
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.redis = new Redis(this.config.get<string>("REDIS_URL", "redis://localhost:6379"));
  }

  async assertCanSend(user: RequestUser, draft: { status: string; toEmail: string; customerId: string }, account: { id: string; hourlySendLimit: number; dailySendLimit: number; isActive: boolean }) {
    if (draft.status !== "APPROVED") {
      throw new BadRequestException("Email must be manually approved before sending");
    }
    if (!account.isActive) {
      throw new BadRequestException("Email account is inactive");
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: draft.customerId, organizationId: user.organizationId }
    });
    const domain = draft.toEmail.split("@")[1]?.toLowerCase();
    const blacklistOr: Array<Record<string, string>> = [
      { type: "EMAIL", value: draft.toEmail.toLowerCase() },
      ...(domain ? [{ type: "DOMAIN", value: domain }] : []),
      ...(customer?.country ? [{ type: "COUNTRY", value: customer.country }] : []),
      ...(customer?.normalizedName ? [{ type: "COMPANY_NAME", value: customer.normalizedName }] : [])
    ];
    const blacklistRules = await this.prisma.blacklistRule.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        OR: blacklistOr as never
      }
    });
    if (blacklistRules.length) {
      throw new BadRequestException("Recipient or customer matched blacklist rules");
    }

    const [hourlyCount, dailyCount] = await Promise.all([
      this.redis.get(this.hourlyKey(account.id)),
      this.redis.get(this.dailyKey(account.id))
    ]);
    if (Number(hourlyCount ?? 0) >= account.hourlySendLimit || Number(dailyCount ?? 0) >= account.dailySendLimit) {
      throw new BadRequestException("Email sending frequency limit exceeded");
    }
  }

  async consumeQuota(account: { id: string }) {
    const hourlyKey = this.hourlyKey(account.id);
    const dailyKey = this.dailyKey(account.id);
    const multi = this.redis.multi();
    multi.incr(hourlyKey);
    multi.expire(hourlyKey, 60 * 60);
    multi.incr(dailyKey);
    multi.expire(dailyKey, 60 * 60 * 24);
    await multi.exec();
  }

  private hourlyKey(accountId: string) {
    const now = new Date();
    return `email-quota:${accountId}:hour:${now.toISOString().slice(0, 13)}`;
  }

  private dailyKey(accountId: string) {
    return `email-quota:${accountId}:day:${new Date().toISOString().slice(0, 10)}`;
  }
}
