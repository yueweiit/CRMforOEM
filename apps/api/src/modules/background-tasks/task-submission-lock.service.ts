import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "../../infrastructure/redis/redis.module";

@Injectable()
export class TaskSubmissionLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  buildKey(input: {
    organizationId: string;
    type: "website-analysis" | "research-report" | "oem-fit-score" | "email-draft";
    scope: string;
  }) {
    return `bg-task-lock:${input.organizationId}:${input.type}:${input.scope}`;
  }

  async acquire(key: string, ttlSeconds: number, value: unknown) {
    try {
      const result = await this.redis.set(
        key,
        JSON.stringify(value),
        "EX",
        ttlSeconds,
        "NX"
      );
      return result === "OK";
    } catch {
      throw new ServiceUnavailableException("Background task queue is temporarily unavailable");
    }
  }

  async release(key: string) {
    try {
      await this.redis.del(key);
    } catch {
      // TTL will clear the lock; release failure should not mask the original business error.
    }
  }
}
