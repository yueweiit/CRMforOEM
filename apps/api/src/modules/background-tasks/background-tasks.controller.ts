import { Controller, Get, Param } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { BackgroundTasksService } from "./background-tasks.service";

@Controller()
export class BackgroundTasksController {
  constructor(private readonly backgroundTasksService: BackgroundTasksService) {}

  @Get("customers/:customerId/background-tasks")
  listForCustomer(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string
  ) {
    return this.backgroundTasksService.listForCustomer(user, customerId);
  }
}
