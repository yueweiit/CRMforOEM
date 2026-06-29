import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { GenerateResearchReportDto } from "./dto/generate-research-report.dto";
import { ResearchService } from "./research.service";

@Controller("customers/:customerId/research-reports")
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post()
  generate(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Body() dto: GenerateResearchReportDto
  ) {
    return this.researchService.generate(user, customerId, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.researchService.listHistory(user, customerId);
  }

  @Get("latest")
  latest(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.researchService.getLatest(user, customerId);
  }

  @Get(":reportId")
  getById(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Param("reportId") reportId: string
  ) {
    return this.researchService.getById(user, customerId, reportId);
  }
}

