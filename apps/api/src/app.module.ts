import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { SseModule } from "./common/sse/sse.module";
import { AiModule } from "./modules/ai/ai.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CommercialModule } from "./modules/commercial/commercial.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardsModule } from "./modules/dashboards/dashboards.module";
import { EmailsModule } from "./modules/emails/emails.module";
import { FollowUpsModule } from "./modules/follow-ups/follow-ups.module";
import { KnowledgeModule } from "./modules/knowledge/knowledge.module";
import { ResearchModule } from "./modules/research/research.module";
import { ScoringModule } from "./modules/scoring/scoring.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { WebsiteAnalysisModule } from "./modules/website-analysis/website-analysis.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"]
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>("REDIS_URL", "redis://localhost:6379")
        }
      })
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    SseModule,
    AuthModule,
    CommercialModule,
    CustomersModule,
    KnowledgeModule,
    AiModule,
    WebsiteAnalysisModule,
    ResearchModule,
    ScoringModule,
    EmailsModule,
    FollowUpsModule,
    DashboardsModule,
    SettingsModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }
  ]
})
export class AppModule {}
