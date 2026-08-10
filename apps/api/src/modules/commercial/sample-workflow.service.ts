import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CustomerStage } from "@oem-crm/shared";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { buildCustomerDataScopeWhere } from "../../common/query/data-scope";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { CustomerStageService } from "../customers/customers.public";
import { CreateSampleFeeDto } from "./dto/create-sample-fee.dto";
import { CreateSampleRequestDto } from "./dto/create-sample-request.dto";
import { UpdateSampleFeeDto } from "./dto/update-sample-fee.dto";
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
import { buildSampleCostSummary } from "./sample-cost-summary";

const requestInclude = Prisma.validator<Prisma.SampleRequestInclude>()({
  customer: { select: { id: true, name: true, stage: true } },
  quote: { select: { id: true, quoteNo: true, productName: true, status: true, approvalStatus: true, amount: true, currency: true } },
  rounds: {
    orderBy: { roundNo: "asc" },
    include: {
      retentionRecord: true,
      fees: { orderBy: { incurredAt: "desc" } },
      returnRecords: { orderBy: { recordedAt: "desc" } }
    }
  },
  fees: { orderBy: { incurredAt: "desc" } },
  returnRecords: { orderBy: { recordedAt: "desc" } }
});

const EDITABLE_SAMPLE_ROUND_STATUSES = ["DRAFT", "APPROVAL_REJECTED"] as const;

type SampleRequestRecord = Prisma.SampleRequestGetPayload<{ include: typeof requestInclude }>;
type HistoryAction = "CREATED" | "UPDATED" | "STATUS_CHANGED" | "FEE_ADDED" | "FEE_UPDATED" | "FEE_DELETED" | "QUOTE_LINKED" | "RETAINED" | "SHIPPED" | "DELIVERED" | "FEEDBACK_RECORDED" | "RESAMPLE_CREATED" | "CUSTOMER_KEPT" | "RETURNED" | "VOIDED" | "CLOSED";

@Injectable()
export class SampleWorkflowService {
  constructor(private readonly prisma: PrismaService, private readonly customerStageService: CustomerStageService) {}

  async list(user: RequestUser, customerId?: string) {
    const requests = await this.findRequests(user, customerId);
    return requests.map((request) => this.projectRequest(request));
  }

  async getExport(user: RequestUser, customerId?: string) {
    const requests = await this.findRequests(user, customerId);
    const rows = requests.flatMap((request) => {
      const projection = this.projectRequest(request);
      return projection.costSummary.byCurrency.length
        ? projection.costSummary.byCurrency.map((cost) => this.exportRow(projection, cost))
        : [this.exportRow(projection, null)];
    });
    const headers = ["样品任务ID", "客户", "产品", "当前轮次", "当前动作", "上一轮结论", "上一轮处置", "币种", "首轮成本", "重打增量成本", "累计实际成本", "客户收费", "已收金额", "企业承担金额", "轮次成本明细"];
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map((value) => this.escapeCsv(value)).join(",")).join("\n")}`;
    return { csv, fileName: customerId ? `samples-${customerId}.csv` : "samples.csv" };
  }

  async getHistory(user: RequestUser, id: string) {
    await this.getRequest(user, id);
    return this.prisma.sampleHistory.findMany({ where: { sampleRequestId: id }, orderBy: { createdAt: "desc" } });
  }

  async create(user: RequestUser, dto: CreateSampleRequestDto) {
    await this.ensureCustomer(user, dto.customerId);
    const quote = dto.quoteId ? await this.ensureQuote(user, dto.quoteId, dto.customerId) : null;
    const actorName = await this.actorName(user);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sampleRequest.create({
        data: {
          customerId: dto.customerId,
          quoteId: quote?.id ?? null,
          productSummary: dto.productSummary.trim(),
          samplePurpose: dto.samplePurpose as never
        }
      });
      const round = await tx.sampleRound.create({
        data: {
          sampleRequestId: created.id,
          roundNo: 1,
          status: "DRAFT",
          specification: dto.specification.trim(),
          material: dto.material.trim(),
          process: dto.process.trim(),
          requestedQuantity: dto.sampleQuantity,
          deliveryDeadline: dto.deliveryDeadline ? new Date(dto.deliveryDeadline) : null,
          fileAssetIds: dto.fileAssetIds ?? []
        }
      });
      await tx.sampleRequest.update({ where: { id: created.id }, data: { currentRoundId: round.id } });
      await this.writeHistory(tx, created.id, round.id, "CREATED", { roundNo: 1, status: round.status }, actorName, user, "已创建样品任务和第 1 轮");
      for (const fee of dto.initialFees ?? []) await this.createFee(tx, user, actorName, created.id, fee.sampleRoundId ?? (fee.feeType === "MOLD" ? null : round.id), fee);
      return this.projectRequest(await tx.sampleRequest.findUniqueOrThrow({ where: { id: created.id }, include: requestInclude }));
    });
    await this.customerStageService.advanceCustomerStage({ customerId: dto.customerId, toStage: CustomerStage.Sampling, changedById: user.id, reason: "已创建样品申请", expectedFromStages: [CustomerStage.Quoting, CustomerStage.Sampling] });
    return request;
  }

  async editCurrentRound(user: RequestUser, requestId: string, dto: EditSampleRoundDto) {
    const request = await this.getRequest(user, requestId);
    if (!request.currentRoundId) throw new BadRequestException("样品任务没有当前轮次");
    return this.editRound(user, request.currentRoundId, dto);
  }

  async editRound(user: RequestUser, roundId: string, dto: EditSampleRoundDto) {
    const round = await this.getRound(user, roundId);
    if (!(EDITABLE_SAMPLE_ROUND_STATUSES as readonly string[]).includes(round.status)) {
      throw new BadRequestException("只有草稿或审批驳回轮次可以编辑；审批通过后不可编辑");
    }
    const request = await this.getRequest(user, round.sampleRequestId);
    const quote = dto.quoteId !== undefined ? (dto.quoteId ? await this.ensureQuote(user, dto.quoteId, request.customerId) : null) : undefined;
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRound.update({
        where: { id: roundId },
        data: {
          status: round.status === "APPROVAL_REJECTED" ? "DRAFT" : undefined,
          ...(dto.specification !== undefined ? { specification: dto.specification.trim() } : {}),
          ...(dto.material !== undefined ? { material: dto.material.trim() } : {}),
          ...(dto.process !== undefined ? { process: dto.process.trim() } : {}),
          ...(dto.requestedQuantity !== undefined ? { requestedQuantity: dto.requestedQuantity } : {}),
          ...(dto.deliveryDeadline !== undefined ? { deliveryDeadline: dto.deliveryDeadline ? new Date(dto.deliveryDeadline) : null } : {}),
          ...(dto.fileAssetIds !== undefined ? { fileAssetIds: dto.fileAssetIds } : {})
        }
      });
      if (dto.productSummary !== undefined || dto.samplePurpose !== undefined || dto.quoteId !== undefined) {
        await tx.sampleRequest.update({
          where: { id: request.id },
          data: {
            ...(dto.productSummary !== undefined ? { productSummary: dto.productSummary.trim() } : {}),
            ...(dto.samplePurpose !== undefined ? { samplePurpose: dto.samplePurpose as never } : {}),
            ...(dto.quoteId !== undefined ? { quoteId: quote?.id ?? null } : {})
          }
        });
      }
      await this.writeHistory(tx, request.id, round.id, "UPDATED", { before: { status: round.status }, after: dto }, actorName, user, "已更新样品轮次");
      return updated;
    });
  }

  async submitApproval(user: RequestUser, roundId: string) { return this.transition(user, roundId, "PENDING_APPROVAL", "已提交样品审批", ["DRAFT"]); }
  async approve(user: RequestUser, roundId: string, dto: SampleReviewDto) { return this.transition(user, roundId, "PREPARING", "已通过样品审批", ["PENDING_APPROVAL"], { approvedAt: new Date(), approvalComment: dto.comment?.trim() || null }); }
  async reject(user: RequestUser, roundId: string, dto: SampleReviewDto) { return this.transition(user, roundId, "APPROVAL_REJECTED", "已驳回样品审批", ["PENDING_APPROVAL"], { approvalComment: dto.comment?.trim() || null }); }

  async retain(user: RequestUser, roundId: string, dto: RetainSampleRoundDto) {
    const round = await this.getRound(user, roundId);
    this.assertCurrentRound(round);
    if (round.status !== "PREPARING") throw new BadRequestException("只有打样中的轮次可以留样");
    if (dto.retainedQuantity > dto.producedQuantity) throw new BadRequestException("留样数量不能超过实际完成数量");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRound.update({ where: { id: roundId }, data: { status: "RETAINED", producedQuantity: dto.producedQuantity, retentionEvidenceStatus: "RECORDED" } });
      await tx.sampleRetentionRecord.create({ data: { sampleRoundId: roundId, retainedQuantity: dto.retainedQuantity, retainedAt: dto.retainedAt ? new Date(dto.retainedAt) : new Date(), retainedLocation: dto.retainedLocation.trim(), fileAssetIds: dto.fileAssetIds ?? [], retainedById: user.id } });
      await this.writeHistory(tx, round.sampleRequestId, roundId, "RETAINED", { producedQuantity: dto.producedQuantity, retainedQuantity: dto.retainedQuantity, retainedLocation: dto.retainedLocation }, actorName, user, "已完成寄出前留样");
      return updated;
    });
  }

  async ship(user: RequestUser, roundId: string, dto: ShipSampleRoundDto) {
    const round = await this.getRound(user, roundId);
    this.assertCurrentRound(round);
    if (round.status !== "RETAINED") throw new BadRequestException("必须先完成留样才能寄出");
    if (!round.producedQuantity || !round.retentionRecord || dto.shippedQuantity + round.retentionRecord.retainedQuantity > round.producedQuantity) throw new BadRequestException("寄出数量与留样数量不能超过实际完成数量");
    return this.transition(user, roundId, "SHIPPED", "样品已寄出", ["RETAINED"], { carrier: dto.carrier.trim(), trackingNo: dto.trackingNo.trim(), shippedQuantity: dto.shippedQuantity, shippedAt: dto.shippedAt ? new Date(dto.shippedAt) : new Date() });
  }

  async deliver(user: RequestUser, roundId: string, dto: DeliverSampleRoundDto) { return this.transition(user, roundId, "DELIVERED", "客户已签收样品", ["SHIPPED"], { deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : new Date() }); }

  async feedback(user: RequestUser, roundId: string, dto: RecordSampleFeedbackDto) {
    const round = await this.getRound(user, roundId);
    this.assertCurrentRound(round);
    if (round.status !== "DELIVERED") throw new BadRequestException("只有已签收的轮次可以录入客户反馈");
    if (!dto.feedback.trim()) throw new BadRequestException("客户反馈不能为空");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
        const nextDisposition = dto.dispositionStatus as never;
        const isPendingDisposition = dto.dispositionStatus === "PENDING";
        const updated = await tx.sampleRound.update({
          where: { id: roundId },
          data: {
            status: isPendingDisposition ? "FEEDBACK_RECEIVED" : "COMPLETED",
            feedback: dto.feedback.trim(),
            feedbackResult: dto.feedbackResult as never,
            feedbackAt: new Date(),
            dispositionStatus: nextDisposition,
            completedAt: isPendingDisposition ? null : new Date()
          }
        });
        await tx.sampleReturnRecord.create({ data: { sampleRequestId: round.sampleRequestId, sampleRoundId: roundId, dispositionStatus: nextDisposition, note: dto.feedback.trim(), recordedById: user.id } });
        if (dto.feedbackResult === "CUSTOMER_REJECTED") {
          await tx.sampleRequest.update({ where: { id: round.sampleRequestId }, data: { terminationReason: dto.feedback.trim(), closedAt: new Date(), currentRoundId: null } });
        } else if (dto.feedbackResult === "ACCEPTED" && !isPendingDisposition) {
          await tx.sampleRequest.update({ where: { id: round.sampleRequestId }, data: { closedAt: new Date(), currentRoundId: null } });
        }
        await this.writeHistory(tx, round.sampleRequestId, roundId, "FEEDBACK_RECORDED", { feedbackResult: dto.feedbackResult, dispositionStatus: dto.dispositionStatus, feedback: dto.feedback.trim() }, actorName, user, "已记录客户反馈");
        return updated;
      });
  }

  async createResampleDraft(user: RequestUser, roundId: string, dto: CreateResampleDraftDto) {
    const round = await this.getRound(user, roundId);
    this.assertCurrentRound(round);
    if (round.feedbackResult !== "RESAMPLE_REQUIRED" || round.status !== "FEEDBACK_RECEIVED") {
      throw new BadRequestException("只有客户要求重打的已反馈轮次可以生成新草稿");
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException("重打原因不能为空");
    const actorName = await this.actorName(user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const nextRound = await tx.sampleRound.create({
          data: {
            sampleRequestId: round.sampleRequestId,
            roundNo: round.roundNo + 1,
            previousRoundId: round.id,
            status: "DRAFT",
            specification: round.specification,
            material: round.material,
            process: round.process,
            requestedQuantity: round.requestedQuantity,
            deliveryDeadline: round.deliveryDeadline,
            fileAssetIds: round.fileAssetIds,
            resampleReason: reason,
            changeSummary: dto.changeSummary?.trim() || null
          }
        });
        await tx.sampleRequest.update({ where: { id: round.sampleRequestId }, data: { currentRoundId: nextRound.id, closedAt: null, terminationReason: null } });
        await this.writeHistory(tx, round.sampleRequestId, nextRound.id, "RESAMPLE_CREATED", { roundNo: nextRound.roundNo, previousRoundId: roundId, resampleReason: reason, changeSummary: dto.changeSummary?.trim() || null }, actorName, user, `已生成第 ${nextRound.roundNo} 轮重打草稿`);
        return this.projectRequest(await tx.sampleRequest.findUniqueOrThrow({ where: { id: round.sampleRequestId }, include: requestInclude }));
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("该轮次已经生成下一轮草稿");
      throw error;
    }
  }

  async disposition(user: RequestUser, roundId: string, status: "RETURNED" | "CUSTOMER_KEPT" | "DISPOSED", dto: RecordSampleDispositionDto) {
    const round = await this.getRound(user, roundId);
    if (!["FEEDBACK_RECEIVED", "COMPLETED"].includes(round.status) || !round.feedbackResult) throw new BadRequestException("当前轮次不可更新客户样品处置");
    if (round.dispositionStatus === "CUSTOMER_KEPT" || round.dispositionStatus === "DISPOSED" || round.dispositionStatus === "RETURNED") throw new BadRequestException("客户样品处置已经完成");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRound.update({ where: { id: roundId }, data: { dispositionStatus: status, status: "COMPLETED", completedAt: new Date() } });
      await tx.sampleReturnRecord.create({ data: { sampleRequestId: round.sampleRequestId, sampleRoundId: roundId, dispositionStatus: status, receiverName: dto.receiverName?.trim(), destination: dto.destination?.trim(), note: dto.note?.trim(), recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(), recordedById: user.id } });
      if (round.feedbackResult === "ACCEPTED") await tx.sampleRequest.update({ where: { id: round.sampleRequestId }, data: { closedAt: new Date(), currentRoundId: null } });
      await this.writeHistory(tx, round.sampleRequestId, roundId, status === "RETURNED" ? "RETURNED" : status === "CUSTOMER_KEPT" ? "CUSTOMER_KEPT" : "UPDATED", { dispositionStatus: status }, actorName, user, status === "RETURNED" ? "已归还" : status === "CUSTOMER_KEPT" ? "客户保留" : "已更新样品处置");
      return updated;
    });
  }

  async addFee(user: RequestUser, requestId: string, dto: CreateSampleFeeDto) {
    const request = await this.getRequest(user, requestId);
    const roundId = dto.sampleRoundId !== undefined ? (dto.sampleRoundId || null) : (dto.feeType === "MOLD" ? null : request.currentRoundId);
    if (roundId) await this.getRound(user, roundId, requestId);
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => this.createFee(tx, user, actorName, requestId, roundId, dto));
  }

  async updateFee(user: RequestUser, requestId: string, feeId: string, dto: UpdateSampleFeeDto) {
    await this.getRequest(user, requestId);
    const fee = await this.prisma.sampleFee.findFirst({ where: { id: feeId, sampleRequestId: requestId } });
    if (!fee) throw new NotFoundException("样品费用不存在");
    if (dto.sampleRoundId) await this.getRound(user, dto.sampleRoundId, requestId);
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const nextPaymentStatus = dto.paymentStatus
        ?? (dto.costNature === "CUSTOMER_CHARGE" && fee.costNature !== "CUSTOMER_CHARGE" ? "PENDING" : undefined)
        ?? (dto.costNature === "ACTUAL_COST" && fee.costNature !== "ACTUAL_COST" ? "NOT_APPLICABLE" : undefined);
      const updated = await tx.sampleFee.update({ where: { id: feeId }, data: { ...(dto.feeType ? { feeType: dto.feeType as never } : {}), ...(dto.amount !== undefined ? { amount: new Prisma.Decimal(dto.amount) } : {}), ...(dto.currency ? { currency: dto.currency.trim().toUpperCase() } : {}), ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}), ...(dto.incurredAt ? { incurredAt: new Date(dto.incurredAt) } : {}), ...(dto.sampleRoundId !== undefined ? { sampleRoundId: dto.sampleRoundId || null } : {}), ...(dto.costNature ? { costNature: dto.costNature as never } : {}), ...(dto.responsibility ? { responsibility: dto.responsibility as never } : {}), ...(nextPaymentStatus ? { paymentStatus: nextPaymentStatus as never } : {}) } });
      await this.writeHistory(tx, requestId, updated.sampleRoundId, "FEE_UPDATED", { before: this.feeSnapshot(fee), after: this.feeSnapshot(updated) }, actorName, user, "已更新样品费用");
      return updated;
    });
  }

  async deleteFee(user: RequestUser, requestId: string, feeId: string) {
    await this.getRequest(user, requestId);
    const fee = await this.prisma.sampleFee.findFirst({ where: { id: feeId, sampleRequestId: requestId } });
    if (!fee) throw new NotFoundException("样品费用不存在");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.sampleFee.delete({ where: { id: feeId } });
      await this.writeHistory(tx, requestId, fee.sampleRoundId, "FEE_DELETED", { before: this.feeSnapshot(fee) }, actorName, user, "已删除样品费用");
      return { deleted: true };
    });
  }

  async terminate(user: RequestUser, requestId: string, dto: TerminateSampleRequestDto) {
    const request = await this.getRequest(user, requestId);
    if (this.requestOutcome(request) !== "IN_PROGRESS") throw new BadRequestException("样品任务已结束");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRequest.update({ where: { id: requestId }, data: { terminationReason: dto.reason.trim(), closedAt: new Date(), currentRoundId: null } });
      await this.writeHistory(tx, requestId, request.currentRoundId, "STATUS_CHANGED", { status: "TERMINATED", reason: dto.reason.trim() }, actorName, user, "已终止样品任务");
      return updated;
    });
  }

  async void(user: RequestUser, requestId: string) {
    const request = await this.getRequest(user, requestId);
    if (this.requestOutcome(request) !== "IN_PROGRESS") throw new BadRequestException("样品任务已结束");
    const active = request.rounds.some((round) => ["SHIPPED", "DELIVERED", "FEEDBACK_RECEIVED", "COMPLETED"].includes(round.status));
    if (active) throw new BadRequestException("已寄出或已签收的样品不能作废");
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRequest.update({ where: { id: requestId }, data: { closedAt: new Date(), currentRoundId: null } });
      if (request.currentRoundId) await tx.sampleRound.update({ where: { id: request.currentRoundId }, data: { status: "VOIDED", voidedAt: new Date() } });
      await this.writeHistory(tx, requestId, request.currentRoundId, "VOIDED", { status: "VOIDED" }, actorName, user, "已作废样品任务");
      return updated;
    });
  }

  private async transition(user: RequestUser, roundId: string, status: string, comment: string, fromStatuses: string[], extra: Record<string, unknown> = {}) {
    const round = await this.getRound(user, roundId);
    this.assertCurrentRound(round);
    if (!fromStatuses.includes(round.status)) throw new BadRequestException(`轮次不能从 ${round.status} 流转到 ${status}`);
    const actorName = await this.actorName(user);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sampleRound.update({ where: { id: roundId }, data: { status: status as never, ...extra } });
      await tx.sampleHistory.create({ data: { sampleRequestId: round.sampleRequestId, sampleRoundId: roundId, action: (status === "SHIPPED" ? "SHIPPED" : status === "DELIVERED" ? "DELIVERED" : "STATUS_CHANGED") as never, before: { status: round.status } as never, after: { status, ...extra } as never, comment, actorId: user.id, actorName } });
      return updated;
    });
  }

  private async createFee(tx: Prisma.TransactionClient, user: RequestUser, actorName: string, requestId: string, roundId: string | null, dto: CreateSampleFeeDto) {
    const costNature = (dto.costNature ?? "ACTUAL_COST") as never;
    const fee = await tx.sampleFee.create({ data: { sampleRequestId: requestId, sampleRoundId: roundId, feeType: dto.feeType as never, amount: new Prisma.Decimal(dto.amount), currency: dto.currency.trim().toUpperCase(), note: dto.note?.trim() || null, incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : new Date(), createdById: user.id, costNature, responsibility: (dto.responsibility ?? "FACTORY") as never, paymentStatus: (dto.paymentStatus ?? (dto.costNature === "CUSTOMER_CHARGE" ? "PENDING" : "NOT_APPLICABLE")) as never } });
    await this.writeHistory(tx, requestId, roundId, "FEE_ADDED", { after: this.feeSnapshot(fee) }, actorName, user, "已记录样品费用");
    return fee;
  }

  private async findRequests(user: RequestUser, customerId?: string) {
    return this.prisma.sampleRequest.findMany({ where: { ...(customerId ? { customerId } : {}), customer: buildCustomerDataScopeWhere(user) }, include: requestInclude, orderBy: { createdAt: "desc" } });
  }

  private async getRequest(user: RequestUser, id: string) {
    const request = await this.prisma.sampleRequest.findFirst({ where: { id, customer: buildCustomerDataScopeWhere(user) }, include: requestInclude });
    if (!request) throw new NotFoundException("样品任务不存在");
    return request;
  }

  private async getRound(user: RequestUser, roundId: string, requestId?: string) {
    const round = await this.prisma.sampleRound.findFirst({ where: { id: roundId, ...(requestId ? { sampleRequestId: requestId } : {}), sampleRequest: { customer: buildCustomerDataScopeWhere(user) } }, include: { retentionRecord: true, sampleRequest: { select: { currentRoundId: true } } } });
    if (!round) throw new NotFoundException("样品轮次不存在");
    return round;
  }

  private assertCurrentRound(round: { id: string; sampleRequest: { currentRoundId: string | null } }) {
    if (round.sampleRequest.currentRoundId !== round.id) throw new BadRequestException("只能操作当前轮次");
  }

  private async ensureCustomer(user: RequestUser, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, ...buildCustomerDataScopeWhere(user) } });
    if (!customer) throw new NotFoundException("客户不存在");
    return customer;
  }

  private async ensureQuote(user: RequestUser, id: string, customerId: string) {
    const quote = await this.prisma.quote.findFirst({ where: { id, customerId, customer: buildCustomerDataScopeWhere(user) } });
    if (!quote) throw new NotFoundException("报价不存在");
    return quote;
  }

  private async actorName(user: RequestUser) {
    const actor = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true } });
    return actor?.name ?? actor?.email ?? user.name ?? user.email ?? user.id;
  }

  private async writeHistory(tx: Prisma.TransactionClient, requestId: string, roundId: string | null, action: HistoryAction, after: unknown, actorName: string, user: RequestUser, comment: string) {
    await tx.sampleHistory.create({ data: { sampleRequestId: requestId, sampleRoundId: roundId, action: action as never, after: after as never, actorId: user.id, actorName, comment } });
  }

  private feeSnapshot(fee: { id: string; sampleRoundId: string | null; feeType: string; amount: { toString(): string }; currency: string; note: string | null; costNature: string | null; responsibility: string | null; paymentStatus: string | null; incurredAt: Date }) {
    return { id: fee.id, sampleRoundId: fee.sampleRoundId, feeType: fee.feeType, amount: fee.amount.toString(), currency: fee.currency, note: fee.note, costNature: fee.costNature, responsibility: fee.responsibility, paymentStatus: fee.paymentStatus, incurredAt: fee.incurredAt.toISOString() };
  }

  private projectRequest(request: SampleRequestRecord) {
    const currentRound = request.rounds.find((round) => round.id === request.currentRoundId) ?? request.rounds[request.rounds.length - 1] ?? null;
    const previousRound = currentRound?.previousRoundId ? request.rounds.find((round) => round.id === currentRound.previousRoundId) ?? null : null;
    const requestOutcome = this.requestOutcome(request);
    return {
      ...request,
      currentRound,
      previousRound,
      rounds: request.rounds,
      specification: currentRound?.specification ?? null,
      material: currentRound?.material ?? null,
      process: currentRound?.process ?? null,
      sampleQuantity: currentRound?.requestedQuantity ?? null,
      deliveryDeadline: currentRound?.deliveryDeadline ?? null,
      fileAssetIds: currentRound?.fileAssetIds ?? [],
      trackingNo: currentRound?.trackingNo ?? null,
      carrier: currentRound?.carrier ?? null,
      shippedAt: currentRound?.shippedAt ?? null,
      deliveredAt: currentRound?.deliveredAt ?? null,
      approvedAt: currentRound?.approvedAt ?? null,
      approvalComment: currentRound?.approvalComment ?? null,
      feedback: currentRound?.feedback ?? null,
      currentAction: this.currentAction(requestOutcome, currentRound),
      costSummary: buildSampleCostSummary(request.fees.map((fee) => ({ id: fee.id, sampleRoundId: fee.sampleRoundId, feeType: fee.feeType, amount: fee.amount.toString(), currency: fee.currency, costNature: fee.costNature, paymentStatus: fee.paymentStatus })), request.rounds.map((round) => ({ id: round.id, roundNo: round.roundNo })))
    };
  }

  private requestOutcome(request: { currentRoundId: string | null; terminationReason: string | null; rounds: Array<{ id: string; status: string; feedbackResult: string | null }> }) {
    const currentRound = request.rounds.find((round) => round.id === request.currentRoundId) ?? request.rounds[request.rounds.length - 1] ?? null;
    if (request.terminationReason) return "TERMINATED";
    if (currentRound?.status === "VOIDED") return "VOIDED";
    if (currentRound?.feedbackResult === "CUSTOMER_REJECTED") return "TERMINATED";
    if (currentRound?.feedbackResult === "ACCEPTED") return "PASSED";
    return "IN_PROGRESS";
  }

  private currentAction(requestOutcome: string, round: { roundNo: number; status: string } | null) {
    if (requestOutcome === "PASSED") return "样品客户已通过";
    if (requestOutcome === "TERMINATED") return "样品任务已终止";
    if (requestOutcome === "VOIDED") return "样品任务已作废";
    if (!round) return "等待创建第 1 轮";
    const labels: Record<string, string> = { DRAFT: `第 ${round.roundNo} 轮草稿`, PENDING_APPROVAL: `第 ${round.roundNo} 轮待审批`, APPROVAL_REJECTED: `第 ${round.roundNo} 轮审批驳回`, PREPARING: round.roundNo > 1 ? `第 ${round.roundNo} 轮重新打样中` : "首轮打样中", RETAINED: `第 ${round.roundNo} 轮已留样`, SHIPPED: `第 ${round.roundNo} 轮已寄出`, DELIVERED: `第 ${round.roundNo} 轮已签收`, FEEDBACK_RECEIVED: `第 ${round.roundNo} 轮等待处置`, COMPLETED: `第 ${round.roundNo} 轮已完成`, VOIDED: `第 ${round.roundNo} 轮已作废` };
    return labels[round.status] ?? round.status;
  }

  private exportRow(projection: ReturnType<SampleWorkflowService["projectRequest"]>, cost: { currency: string; firstRoundCost: number; resampleCost: number; totalActualCost: number; customerCharge: number; receivedAmount: number; companyBorneAmount: number } | null) {
    const roundDetails = projection.costSummary.byRound.flatMap((round) => round.currencies.map((item) => `R${round.roundNo ?? "公共"} ${item.currency} ${item.totalActualCost.toFixed(2)}`)).join("; ");
    return [projection.id, projection.customer?.name ?? "", projection.productSummary, projection.currentRound ? `R${projection.currentRound.roundNo}` : "", projection.currentAction, projection.previousRound?.feedbackResult ?? "", projection.previousRound?.dispositionStatus ?? "", cost?.currency ?? "", cost?.firstRoundCost.toFixed(2) ?? "", cost?.resampleCost.toFixed(2) ?? "", cost?.totalActualCost.toFixed(2) ?? "", cost?.customerCharge.toFixed(2) ?? "", cost?.receivedAmount.toFixed(2) ?? "", cost?.companyBorneAmount.toFixed(2) ?? "", roundDetails];
  }

  private escapeCsv(value: unknown) {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}
