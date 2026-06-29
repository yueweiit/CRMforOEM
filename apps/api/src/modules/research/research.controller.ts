import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { GenerateResearchReportDto } from "./dto/generate-research-report.dto";
import { UpdateResearchReportDto } from "./dto/update-research-report.dto";
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

  @Delete(":reportId")
  delete(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Param("reportId") reportId: string
  ) {
    return this.researchService.deleteById(user, customerId, reportId);
  }

  @Patch(":reportId")
  update(
    @CurrentUser() user: RequestUser,
    @Param("customerId") customerId: string,
    @Param("reportId") reportId: string,
    @Body() dto: UpdateResearchReportDto
  ) {
    return this.researchService.updateById(user, customerId, reportId, dto);
  }
}

