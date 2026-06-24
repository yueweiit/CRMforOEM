import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { FollowUpRulesService } from "./rules/follow-up-rules.service";
import { FollowUpsController } from "./follow-ups.controller";
import { FollowUpsService } from "./follow-ups.service";

@Module({
  imports: [CustomersModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpRulesService],
  exports: [FollowUpsService]
})
export class FollowUpsModule {}

