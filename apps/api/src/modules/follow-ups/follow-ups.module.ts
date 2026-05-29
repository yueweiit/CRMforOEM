import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { FollowUpRulesService } from "./follow-up-rules.service";
import { FollowUpsController } from "./follow-ups.controller";
import { FollowUpsService } from "./follow-ups.service";

@Module({
  imports: [CustomersModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpRulesService],
  exports: [FollowUpsService, FollowUpRulesService]
})
export class FollowUpsModule {}

