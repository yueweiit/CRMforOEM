import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { UpdateWebsiteAnalysisDto } from "./dto/update-website-analysis.dto";
import { WebsiteAnalysisService } from "./website-analysis.service";

@Controller()
export class WebsiteAnalysisController {
  constructor(private readonly websiteAnalysisService: WebsiteAnalysisService) {}

  @Post("customers/:customerId/website-analyses")
  create(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.websiteAnalysisService.enqueueForCustomer(user, customerId);
  }

  @Get("customers/:customerId/website-analyses")
  list(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.websiteAnalysisService.listHistory(user, customerId);
  }

  @Get("customers/:customerId/website-analyses/latest")
  latest(@CurrentUser() user: RequestUser, @Param("customerId") customerId: string) {
    return this.websiteAnalysisService.getLatest(user, customerId);
  }

  @Get("website-analyses/:id")
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.websiteAnalysisService.getById(user, id);
  }

  @Delete("website-analyses/:id")
  delete(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.websiteAnalysisService.deleteById(user, id);
  }

  @Patch("website-analyses/:id")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateWebsiteAnalysisDto) {
    return this.websiteAnalysisService.updateById(user, id, dto);
  }
}

