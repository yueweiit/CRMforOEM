import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>("REDIS_URL", "redis://localhost:6379"), {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            if (times > 5) return null;
            return Math.min(times * 200, 2000);
          },
          lazyConnect: false
        });
      }
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
