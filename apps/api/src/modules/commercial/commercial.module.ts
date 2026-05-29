import { Module } from "@nestjs/common";
import { CustomersModule } from "../customers/customers.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { CommercialController } from "./commercial.controller";
import { CommercialService } from "./commercial.service";

@Module({
  imports: [CustomersModule, FollowUpsModule],
  controllers: [CommercialController],
  providers: [CommercialService]
})
export class CommercialModule {}

