import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { CommercialService } from "./commercial.service";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { UpdateQuoteDto } from "./dto/update-quote.dto";
import { UpdateSampleRequestDto } from "./dto/update-sample-request.dto";

@Controller()
export class CommercialController {
  constructor(private readonly commercialService: CommercialService) {}

  @Get("quotes")
  quotes(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string) {
    return this.commercialService.listQuotes(user, customerId);
  }

  @Post("quotes")
  createQuote(@CurrentUser() user: RequestUser, @Body() dto: CreateQuoteDto) {
    return this.commercialService.createQuote(user, dto);
  }

  @Patch("quotes/:id")
  updateQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateQuoteDto) {
    return this.commercialService.updateQuote(user, id, dto);
  }

  @Delete("quotes/:id")
  deleteQuote(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.deleteQuote(user, id);
  }

  @Get("samples")
  samples(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string) {
    return this.commercialService.listSamples(user, customerId);
  }

  @Post("samples")
  createSample(@CurrentUser() user: RequestUser, @Body() dto: CreateSampleRequestDto) {
    return this.commercialService.createSample(user, dto);
  }

  @Patch("samples/:id")
  updateSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateSampleRequestDto) {
    return this.commercialService.updateSample(user, id, dto);
  }

  @Delete("samples/:id")
  deleteSample(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.deleteSample(user, id);
  }
}

