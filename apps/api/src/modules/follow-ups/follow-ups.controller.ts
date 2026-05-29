import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { CreateFollowUpTaskDto } from "./dto/create-follow-up-task.dto";
import { UpdateFollowUpTaskDto } from "./dto/update-follow-up-task.dto";
import { FollowUpsService } from "./follow-ups.service";

@Controller("follow-up-tasks")
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Get("overdue-count")
  overdueCount(@CurrentUser() user: RequestUser) {
    return this.followUpsService.countDueSoonOpen(user);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query("status") status?: string) {
    return this.followUpsService.list(user, status);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateFollowUpTaskDto) {
    return this.followUpsService.create(user, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateFollowUpTaskDto) {
    return this.followUpsService.update(user, id, dto);
  }

  @Post(":id/complete")
  complete(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.followUpsService.complete(user, id);
  }
}

