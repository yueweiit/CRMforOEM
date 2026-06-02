import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { UpsertKnowledgeDto } from "./dto/upsert-knowledge.dto";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get("company-profile")
  companyProfile(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.getCompanyProfile(user);
  }

  @Patch("company-profile")
  upsertCompanyProfile(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.upsertCompanyProfile(user, dto);
  }

  @Get("brands")
  brands(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listBrands(user);
  }

  @Post("brands")
  createBrand(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createBrand(user, dto);
  }

  @Get("products")
  products(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listProducts(user);
  }

  @Post("products")
  createProduct(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createProduct(user, dto);
  }

  @Get("oem-capabilities")
  capabilities(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listCapabilities(user);
  }

  @Post("oem-capabilities")
  createCapability(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createCapability(user, dto);
  }

  @Get("certificates")
  certificates(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listCertificates(user);
  }

  @Post("certificates")
  createCertificate(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createCertificate(user, dto);
  }

  @Get("case-studies")
  caseStudies(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listCaseStudies(user);
  }

  @Post("case-studies")
  createCaseStudy(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createCaseStudy(user, dto);
  }

  @Get("email-materials")
  emailMaterials(@CurrentUser() user: RequestUser) {
    return this.knowledgeService.listEmailMaterials(user);
  }

  @Post("email-materials")
  createEmailMaterial(@CurrentUser() user: RequestUser, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.createEmailMaterial(user, dto);
  }

  @Patch(":entity/:id")
  update(@CurrentUser() user: RequestUser, @Param("entity") entity: string, @Param("id") id: string, @Body() dto: UpsertKnowledgeDto) {
    return this.knowledgeService.updateEntity(user, entity, id, dto);
  }

  @Delete(":entity/:id")
  delete(@CurrentUser() user: RequestUser, @Param("entity") entity: string, @Param("id") id: string) {
    return this.knowledgeService.deleteEntity(user, entity, id);
  }
}
