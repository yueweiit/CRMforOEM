import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomerStageService } from "./customer-stage.service";
import { CustomersService } from "./customers.service";

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerStageService],
  exports: [CustomersService, CustomerStageService]
})
export class CustomersModule {}

