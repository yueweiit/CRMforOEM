import * as assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service";
import { SampleWorkflowService } from "./sample-workflow.service";
import type { RequestUser } from "../../common/auth/current-user.decorator";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  let requestId = "";
  let keptRequestId = "";
  let keptResampleRequestId = "";
  try {
    const customer = await prisma.customer.findFirst({ where: { organizationId: "default-org" } });
    assert.ok(customer, "integration test requires one local customer");
    const user: RequestUser = { id: "sample-workflow-test", organizationId: customer.organizationId, roleCodes: ["ADMIN"], permissions: [], dataScope: "ALL" };
    const service = new SampleWorkflowService(prisma, { advanceCustomerStage: async () => undefined } as never);

    const created = await service.create(user, { customerId: customer.id, productSummary: "样品工作流验收", specification: "R1", material: "ABS", process: "注塑", sampleQuantity: 3, samplePurpose: "CUSTOMER_TEST" });
    requestId = created.id;
    const r1 = created.currentRound;
    assert.equal(r1.status, "DRAFT");
    const firstSubmission = await service.submitApproval(user, r1.id);
    assert.equal(firstSubmission.status, "PENDING_APPROVAL");
    const rejected = await service.reject(user, r1.id, { comment: "补充工艺说明" });
    assert.equal(rejected.status, "APPROVAL_REJECTED");
    const resubmitted = await service.submitApproval(user, r1.id);
    assert.equal(resubmitted.status, "PENDING_APPROVAL");
    await service.approve(user, r1.id, { comment: "通过" });
    await assert.rejects(
      () => service.editCurrentRound(user, requestId, { productSummary: "审批后不应修改" }),
      /审批通过后不可编辑/
    );
    await assert.rejects(() => service.ship(user, r1.id, { carrier: "DHL", trackingNo: "TEST-R1", shippedQuantity: 2 }), BadRequestException);
    await service.retain(user, r1.id, { producedQuantity: 3, retainedQuantity: 1, retainedLocation: "A-01" });
    await service.ship(user, r1.id, { carrier: "DHL", trackingNo: "TEST-R1", shippedQuantity: 2 });
    await service.deliver(user, r1.id, {});
    const resampleFeedback = await service.feedback(user, r1.id, { feedbackResult: "RESAMPLE_REQUIRED", feedback: "颜色需要调整", dispositionStatus: "PENDING" });
    assert.equal(resampleFeedback.status, "FEEDBACK_RECEIVED");
    const resample = await service.createResampleDraft(user, r1.id, { reason: "客户要求改色", changeSummary: "黑色改为白色" });
    assert.equal(resample.currentRound?.roundNo, 2);
    assert.equal(resample.currentRound?.status, "DRAFT");
    const r2Id = resample.currentRound!.id;
    await service.submitApproval(user, r2Id);
    await service.approve(user, r2Id, { comment: "R2 通过" });
    await service.disposition(user, r1.id, "RETURNED", { receiverName: "仓库", destination: "样品区" });
    await service.addFee(user, requestId, { feeType: "SAMPLE_MAKING", amount: 80, currency: "USD", sampleRoundId: r2Id, costNature: "ACTUAL_COST" });
    await service.addFee(user, requestId, { feeType: "MOLD", amount: 20, currency: "USD", sampleRoundId: "", costNature: "ACTUAL_COST" });

    const projected = (await service.list(user, customer.id)).find((item) => item.id === requestId);
    assert.equal(projected?.currentAction, "第 2 轮重新打样中");
    assert.equal(projected?.currentRound?.id, r2Id);
    assert.equal(projected?.rounds.find((round) => round.id === r1.id)?.dispositionStatus, "RETURNED");
    assert.equal(projected?.returnRecords.find((record) => record.dispositionStatus === "RETURNED")?.sampleRoundId, r1.id);
    assert.equal(projected?.costSummary.byCurrency[0].resampleCost, 80);
    assert.equal(projected?.costSummary.byCurrency[0].firstRoundCost, 20);

    const kept = await service.create(user, { customerId: customer.id, productSummary: "签收反馈阶段验收", specification: "R1", material: "ABS", process: "注塑", sampleQuantity: 2, samplePurpose: "CUSTOMER_TEST" });
    keptRequestId = kept.id;
    const keptR1 = kept.currentRound;
    await service.submitApproval(user, keptR1.id);
    await service.approve(user, keptR1.id, {});
    await service.retain(user, keptR1.id, { producedQuantity: 2, retainedQuantity: 1, retainedLocation: "A-02" });
    await service.ship(user, keptR1.id, { carrier: "DHL", trackingNo: "TEST-KEPT", shippedQuantity: 1 });
    await service.deliver(user, keptR1.id, {});
    const keptFeedback = await service.feedback(user, keptR1.id, { feedbackResult: "ACCEPTED", feedback: "客户确认通过并保留样品", dispositionStatus: "CUSTOMER_KEPT" });
    assert.equal(keptFeedback.status, "COMPLETED");
    const keptProjected = (await service.list(user, customer.id)).find((item) => item.id === keptRequestId);
    assert.equal(keptProjected?.currentRound?.feedbackResult, "ACCEPTED");

    const keptResample = await service.create(user, { customerId: customer.id, productSummary: "客户保留重打验收", specification: "R1", material: "ABS", process: "注塑", sampleQuantity: 2, samplePurpose: "CUSTOMER_TEST" });
    keptResampleRequestId = keptResample.id;
    const keptResampleR1 = keptResample.currentRound;
    await service.submitApproval(user, keptResampleR1.id);
    await service.approve(user, keptResampleR1.id, {});
    await service.retain(user, keptResampleR1.id, { producedQuantity: 2, retainedQuantity: 1, retainedLocation: "A-03" });
    await service.ship(user, keptResampleR1.id, { carrier: "DHL", trackingNo: "TEST-KEPT-RESAMPLE", shippedQuantity: 1 });
    await service.deliver(user, keptResampleR1.id, {});
    const completedResampleFeedback = await service.feedback(user, keptResampleR1.id, { feedbackResult: "RESAMPLE_REQUIRED", feedback: "客户保留原样并要求重打", dispositionStatus: "CUSTOMER_KEPT" });
    assert.equal(completedResampleFeedback.status, "COMPLETED");
    const keptResampleR2 = await service.createResampleDraft(user, keptResampleR1.id, { reason: "客户要求调整后重打", changeSummary: "保留原样作为对照" });
    assert.equal(keptResampleR2.currentRound?.roundNo, 2);
    assert.equal(keptResampleR2.currentRound?.status, "DRAFT");
    assert.equal(keptResampleR2.previousRound?.dispositionStatus, "CUSTOMER_KEPT");
    console.log("sample-workflow integration assertions passed");
  } finally {
    if (keptResampleRequestId) await prisma.sampleRequest.delete({ where: { id: keptResampleRequestId } });
    if (keptRequestId) await prisma.sampleRequest.delete({ where: { id: keptRequestId } });
    if (requestId) await prisma.sampleRequest.delete({ where: { id: requestId } });
    await prisma.$disconnect();
  }
}

void main();
