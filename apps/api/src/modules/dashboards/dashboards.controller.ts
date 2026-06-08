import { Controller, Get, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequireAnyPermissions, RequirePermissions } from "../../common/auth/permissions.decorator";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";
import { DashboardsService } from "./dashboards.service";

@Controller("dashboards")
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @RequireAnyPermissions("dashboards.personal.view", "dashboards.personal")
  @Get("me")
  me(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.personal(user, query);
  }

  @RequireAnyPermissions("dashboards.view", "dashboards.team")
  @Get("team")
  team(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.team(user, query);
  }

  @RequireAnyPermissions("dashboards.view", "dashboards.management")
  @Get("management")
  management(@CurrentUser() user: RequestUser, @Query() query: DashboardQueryDto) {
    return this.dashboardsService.management(user, query);
  }

  @RequireAnyPermissions("dashboards.personal.view", "dashboards.personal")
  @Get("filter-options")
  filterOptions(@CurrentUser() user: RequestUser) {
    return this.dashboardsService.filterOptions(user);
  }
}
