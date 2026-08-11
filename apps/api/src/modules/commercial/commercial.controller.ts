import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser, RequestUser } from "../../common/auth/current-user.decorator";
import { RequireLiveSession } from "../../common/auth/live-session.decorator";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CommercialService } from "./commercial.service";
import { CreateSampleFeeDto } from "./dto/create-sample-fee.dto";
import { CreateQuoteDto } from "./dto/create-quote.dto";
import { CreateQuoteRevisionDto } from "./dto/create-quote-revision.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { QuoteReviewDto } from "./dto/quote-review.dto";
import { UpdateSampleFeeDto } from "./dto/update-sample-fee.dto";
import { UpdateQuoteDto } from "./dto/update-quote.dto";
import { UpdateSampleRequestDto } from "./dto/update-sample-request.dto";
import { QuoteReferenceService } from "./quote-reference.service";
import { SampleWorkflowService } from "./sample-workflow.service";
import {
  CreateResampleDraftDto,
  DeliverSampleRoundDto,
  EditSampleRoundDto,
  RecordSampleDispositionDto,
  RecordSampleFeedbackDto,
  RetainSampleRoundDto,
  SampleReviewDto,
  ShipSampleRoundDto,
  TerminateSampleRequestDto
} from "./dto/sample-workflow.dto";

@Controller()
export class CommercialController {
  constructor(
    private readonly commercialService: CommercialService,
    private readonly quoteReferences: QuoteReferenceService,
    private readonly sampleWorkflow: SampleWorkflowService = undefined as never
  ) {}

  @RequirePermissions("quotes.read")
  @Get("quotes")
  quotes(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string) {
    return this.commercialService.listQuotes(user, customerId);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Post("quotes")
  createQuote(@CurrentUser() user: RequestUser, @Body() dto: CreateQuoteDto) {
    return this.commercialService.createQuote(user, dto);
  }

  @RequirePermissions("quotes.read")
  @Get("quotes/:id/history")
  quoteHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.getQuoteHistory(user, id);
  }

  @RequirePermissions("quotes.read")
  @Get("quotes/:id/revisions")
  quoteRevisions(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.listQuoteRevisions(user, id);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Post("quotes/:id/revisions")
  createQuoteRevision(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body() dto: CreateQuoteRevisionDto
  ) {
    return this.commercialService.createQuoteRevision(user, id, dto);
  }

  @RequirePermissions("quotes.reference.read")
  @Get("quotes/:id/reference-candidates")
  quoteReferenceCandidates(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.quoteReferences.getReferenceContext(user, id);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.export")
  @Get("quotes/:id/export")
  async exportQuote(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res() res: Response
  ) {
    const { workbook, fileName } = await this.commercialService.getQuoteExport(user, id);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(workbook);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.export")
  @Get("quotes/export")
  async exportQuotes(
    @CurrentUser() user: RequestUser,
    @Query("customerId") customerId: string | undefined,
    @Res() res: Response
  ) {
    const { workbook, fileName } = await this.commercialService.getQuotesExport(user, customerId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(workbook);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Patch("quotes/:id")
  updateQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateQuoteDto) {
    return this.commercialService.updateQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Post("quotes/:id/submit-review")
  submitQuoteReview(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.submitQuoteReview(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.approve")
  @Post("quotes/:id/approve")
  approveQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.approveQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.approve")
  @Post("quotes/:id/reject")
  rejectQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.rejectQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.send")
  @Post("quotes/:id/send")
  sendQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.sendQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.resolve_reply")
  @Post("quotes/:id/accept")
  acceptQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.acceptQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.resolve_reply")
  @Post("quotes/:id/reject-customer")
  rejectQuoteByCustomer(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.rejectQuoteByCustomer(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Post("quotes/:id/expire")
  expireQuote(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: QuoteReviewDto) {
    return this.commercialService.expireQuote(user, id, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("quotes.write")
  @Delete("quotes/:id")
  deleteQuote(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.commercialService.deleteQuote(user, id);
  }

  @RequirePermissions("samples.read")
  @Get("samples")
  samples(@CurrentUser() user: RequestUser, @Query("customerId") customerId?: string) {
    return this.sampleWorkflow.list(user, customerId);
  }

  @RequireLiveSession()
  @RequirePermissions("samples.export")
  @Get("samples/:id/export")
  async exportSample(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res() res: Response
  ) {
    const { workbook, fileName } = await this.sampleWorkflow.getSingleExport(user, id);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(workbook);
  }

  @Get("samples/export")
  @RequirePermissions("samples.export")
  async exportSamples(
    @CurrentUser() user: RequestUser,
    @Query("customerId") customerId: string | undefined,
    @Res() res: Response
  ) {
    const { workbook, fileName } = await this.sampleWorkflow.getExport(user, customerId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    return res.send(workbook);
  }

  @RequireLiveSession()
  @RequirePermissions("samples.write")
  @Post("samples")
  createSample(@CurrentUser() user: RequestUser, @Body() dto: CreateSampleRequestDto) {
    return this.sampleWorkflow.create(user, dto);
  }

  @RequireLiveSession()
  @RequirePermissions("samples.write")
  @Patch("samples/:id")
  updateSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateSampleRequestDto) {
    return this.sampleWorkflow.editCurrentRound(user, id, {
      productSummary: dto.productSummary,
      specification: dto.specification,
      material: dto.material,
      process: dto.process,
      requestedQuantity: dto.requestedQuantity,
      samplePurpose: dto.samplePurpose,
      deliveryDeadline: dto.deliveryDeadline,
      quoteId: dto.quoteId,
      fileAssetIds: dto.fileAssetIds
    } as EditSampleRoundDto);
  }

  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/submit-approval") submitSampleApproval(@CurrentUser() user: RequestUser, @Param("id") id: string) { return this.sampleWorkflow.submitApproval(user, id); }
  @RequireLiveSession() @RequirePermissions("samples.approve") @Post("samples/rounds/:id/approve") approveSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SampleReviewDto) { return this.sampleWorkflow.approve(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.approve") @Post("samples/rounds/:id/reject") rejectSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: SampleReviewDto) { return this.sampleWorkflow.reject(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/retain") retainSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: RetainSampleRoundDto) { return this.sampleWorkflow.retain(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/ship") shipSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: ShipSampleRoundDto) { return this.sampleWorkflow.ship(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/deliver") deliverSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: DeliverSampleRoundDto) { return this.sampleWorkflow.deliver(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/feedback") recordSampleFeedback(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: RecordSampleFeedbackDto) { return this.sampleWorkflow.feedback(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/resample-draft") createResampleDraft(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateResampleDraftDto) { return this.sampleWorkflow.createResampleDraft(user, id, dto); }
  @RequireLiveSession() @RequirePermissions("samples.write") @Post("samples/rounds/:id/disposition/:status") recordSampleDisposition(@CurrentUser() user: RequestUser, @Param("id") id: string, @Param("status") status: "RETURNED" | "CUSTOMER_KEPT" | "DISPOSED", @Body() dto: RecordSampleDispositionDto) { return this.sampleWorkflow.disposition(user, id, status, dto); }

  @RequireLiveSession() @RequirePermissions("samples.write")
  @Post("samples/:id/terminate")
  terminateSample(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: TerminateSampleRequestDto) {
    return this.sampleWorkflow.terminate(user, id, dto);
  }

  @Get("samples/:id/history")
  sampleHistory(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.sampleWorkflow.getHistory(user, id);
  }

  @RequireLiveSession() @RequirePermissions("samples.write")
  @Post("samples/:id/fees")
  recordSampleFee(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: CreateSampleFeeDto) {
    return this.sampleWorkflow.addFee(user, id, dto);
  }

  @RequireLiveSession() @RequirePermissions("samples.write")
  @Patch("samples/:sampleId/fees/:feeId")
  updateSampleFee(
    @CurrentUser() user: RequestUser,
    @Param("sampleId") sampleId: string,
    @Param("feeId") feeId: string,
    @Body() dto: UpdateSampleFeeDto
  ) {
    return this.sampleWorkflow.updateFee(user, sampleId, feeId, dto);
  }

  @RequireLiveSession() @RequirePermissions("samples.write")
  @Delete("samples/:sampleId/fees/:feeId")
  deleteSampleFee(@CurrentUser() user: RequestUser, @Param("sampleId") sampleId: string, @Param("feeId") feeId: string) {
    return this.sampleWorkflow.deleteFee(user, sampleId, feeId);
  }

  @RequireLiveSession() @RequirePermissions("samples.write")
  @Delete("samples/:id")
  deleteSample(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.sampleWorkflow.void(user, id);
  }
}
