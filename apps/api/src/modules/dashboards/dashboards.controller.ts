import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";
import { DashboardsService } from "./dashboards.service";

@Controller("dashboards")
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @RequirePermissions("dashboards.personal")
  @Get("me")
  me(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.personal(user, query);
  }

  @RequirePermissions("dashboards.team")
  @Get("team")
  team(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.team(user, query);
  }

  @RequirePermissions("dashboards.team")
  @Get("management")
  management(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.management(user, query);
  }

  @RequirePermissions("dashboards.personal")
  @Get("filter-options")
  filterOptions(@CurrentUser() user: RequestUser) {
    return this.dashboardsService.filterOptions(user);
  }
}
