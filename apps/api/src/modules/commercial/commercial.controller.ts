import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { CommercialService } from "./commercial.service";
import { CreateSampleFeeDto } from "./dto/create-sample-fee.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { QuoteReviewDto } from "./dto/quote-review.dto";
import { RecordSampleReturnDto } from "./dto/record-sample-return.dto";
import { UpdateSampleFeeDto } from "./dto/update-sample-fee.dto";
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

  @Get("quotes/:id/history")
  quoteHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.getQuoteHistory(user, id);
  }

  @Get("quotes/:id/export")
  async exportQuote(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const { csv, fileName } = await this.commercialService.getQuoteExport(user, id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return csv;
  }

  @Get("quotes/export")
  async exportQuotes(
    @CurrentUser() user: RequestUser,
    @Query("customerId") customerId: string | undefined,
    @Res({ passthrough: true }) res: Response
  ) {
    const { csv, fileName } = await this.commercialService.getQuotesExport(user, customerId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return csv;
  }

  @Patch("quotes/:id")
  updateQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateQuoteDto) {
    return this.commercialService.updateQuote(user, id, dto);
  }

  @Post("quotes/:id/submit-review")
  submitQuoteReview(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.submitQuoteReview(user, id, dto);
  }

  @Post("quotes/:id/approve")
  approveQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.approveQuote(user, id, dto);
  }

  @Post("quotes/:id/reject")
  rejectQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.rejectQuote(user, id, dto);
  }

  @Post("quotes/:id/send")
  sendQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.sendQuote(user, id, dto);
  }

  @Post("quotes/:id/accept")
  acceptQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.acceptQuote(user, id, dto);
  }

  @Post("quotes/:id/reject-customer")
  rejectQuoteByCustomer(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.rejectQuoteByCustomer(user, id, dto);
  }

  @Post("quotes/:id/expire")
  expireQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.expireQuote(user, id, dto);
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

  @Get("samples/:id/history")
  sampleHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.getSampleHistory(user, id);
  }

  @Post("samples/:id/fees")
  recordSampleFee(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateSampleFeeDto) {
    return this.commercialService.recordSampleFee(user, id, dto);
  }

  @Patch("samples/:sampleId/fees/:feeId")
  updateSampleFee(
    @CurrentUser() user: RequestUser,
    @Param("sampleId") sampleId: string,
    @Param("feeId") feeId: string,
    @Body() dto: UpdateSampleFeeDto
  ) {
    return this.commercialService.updateSampleFee(user, sampleId, feeId, dto);
  }

  @Delete("samples/:sampleId/fees/:feeId")
  deleteSampleFee(@CurrentUser() user: RequestUser, @Param("sampleId") sampleId: string, @Param("feeId") feeId: string) {
    return this.commercialService.deleteSampleFee(user, sampleId, feeId);
  }

  @Post("samples/:id/returns")
  recordSampleReturn(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: RecordSampleReturnDto) {
    return this.commercialService.recordSampleReturn(user, id, dto);
  }

  @Delete("samples/:id")
  deleteSample(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.deleteSample(user, id);
  }
}
