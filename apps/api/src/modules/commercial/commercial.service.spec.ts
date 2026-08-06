import * as assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { calculateQuotePricing } from "@oem-crm/shared";
import * as ExcelJS from "exceljs";
import { CommercialService } from "./commercial.service";
import type { RequestUser } from "../../common/auth/current-user.decorator";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  roleCodes: [],
  permissions: [],
  dataScope: "ALL"
};

function buildService(sampleStatus = "PREPARING", quoteState?: { status: string; approvalStatus: string }) {
  const calls: {
    quoteCreate?: Record<string, unknown>;
    sampleCreate?: Record<string, unknown>;
    sampleFeeCreates?: Record<string, unknown>[];
    sampleFeeDeletes?: Record<string, unknown>[];
    sampleUpdate?: Record<string, unknown>;
    quoteUpdate?: Record<string, unknown>;
  } = {};

  const sample = {
    id: "sample-1",
    customerId: "customer-1",
    quoteId: null,
    quote: null,
    productSummary: "Test sample",
    specification: "Spec A",
    material: "ABS",
    process: "Injection molding",
    sampleQuantity: 2,
    samplePurpose: "CUSTOMER_TEST",
    deliveryDeadline: new Date("2026-07-10T00:00:00.000Z"),
    status: sampleStatus,
    fileAssetIds: ["file-a"],
    trackingNo: null,
    carrier: null,
    shippedAt: null,
    deliveredAt: null,
    approvedAt: null,
    approvalComment: null,
    returnedAt: null,
    storedAt: null,
    voidedAt: null,
    closedAt: null,
    feedback: null,
    fees: [
      {
        id: "fee-1",
        feeType: "SAMPLE_MAKING",
        amount: "88.00",
        currency: "USD",
        note: "旧备注",
        incurredAt: new Date("2026-07-07T00:00:00.000Z"),
        createdAt: new Date("2026-07-07T00:00:00.000Z")
      }
    ],
    returnRecords: [],
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    updatedAt: new Date("2026-07-06T00:00:00.000Z")
  };

  const quoteBase = quoteState
    ? {
        id: "quote-1",
        customerId: "customer-1",
        quoteNo: "Q-1",
        productName: "Test quote",
        specification: "Spec Q",
        moq: 1,
        quantity: 10,
        unitPrice: "10.00",
        status: quoteState.status,
        approvalStatus: quoteState.approvalStatus,
        currency: "USD",
        amount: "100.00",
        materialCost: "60.00",
        processingCost: "20.00",
        taxCost: "10.00",
        shippingCost: "10.00",
        discountAmount: "0.00",
        validUntil: null,
        fileAssetId: null,
        notes: null,
        approvalComment: null,
        approvalSubmittedAt: null,
        approvalSubmittedById: null,
        approvalReviewedAt: null,
        approvalReviewedById: null,
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
        updatedAt: new Date("2026-07-06T00:00:00.000Z")
      }
    : null;

  const tx = {
    quote: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.quoteCreate = data;
        return {
          id: "quote-created",
          customerId: data.customerId,
          quoteNo: data.quoteNo,
          productName: data.productName,
          specification: data.specification ?? null,
          moq: data.moq,
          quantity: data.quantity,
          unitPrice: data.unitPrice,
          status: data.status,
          approvalStatus: data.approvalStatus,
          currency: data.currency,
          amount: data.amount,
          materialCost: data.materialCost,
          processingCost: data.processingCost,
          taxCost: data.taxCost,
          shippingCost: data.shippingCost,
          discountAmount: data.discountAmount,
          validUntil: data.validUntil ?? null,
          fileAssetId: data.fileAssetId ?? null,
          notes: data.notes ?? null,
          approvalComment: null,
          approvalSubmittedAt: null,
          approvalSubmittedById: null,
          approvalReviewedAt: null,
          approvalReviewedById: null,
          createdAt: new Date("2026-07-06T00:00:00.000Z"),
          updatedAt: new Date("2026-07-06T00:00:00.000Z")
        };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.quoteUpdate = data;
        if (!quoteState) {
          return null;
        }
        quoteState = {
          status: (data.status ?? quoteState.status) as string,
          approvalStatus: (data.approvalStatus ?? quoteState.approvalStatus) as string
        };
        return {
          ...quoteBase,
          ...quoteState,
          ...data,
          updatedAt: new Date("2026-07-06T01:00:00.000Z")
        };
      }
    },
    sampleRequest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.sampleCreate = data;
        return {
          id: "sample-created",
          customerId: "customer-1",
          quoteId: data.quoteId ?? null,
          productSummary: data.productSummary,
          specification: data.specification,
          material: data.material,
          process: data.process,
          sampleQuantity: data.sampleQuantity,
          samplePurpose: data.samplePurpose,
          deliveryDeadline: data.deliveryDeadline,
          status: data.status,
          fileAssetIds: data.fileAssetIds ?? [],
          trackingNo: data.trackingNo ?? null,
          carrier: data.carrier ?? null,
          shippedAt: null,
          deliveredAt: null,
          approvedAt: null,
          approvalComment: null,
          returnedAt: null,
          storedAt: null,
          voidedAt: null,
          closedAt: null,
          feedback: null,
          createdAt: new Date("2026-07-06T00:00:00.000Z"),
          updatedAt: new Date("2026-07-06T00:00:00.000Z")
        };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.sampleUpdate = data;
        return {
          ...sample,
          ...data,
          fileAssetIds: data.fileAssetIds ?? sample.fileAssetIds,
          trackingNo: data.trackingNo ?? sample.trackingNo,
          carrier: data.carrier ?? sample.carrier,
          approvalComment: data.approvalComment ?? sample.approvalComment,
          status: data.status ?? sample.status,
          updatedAt: new Date("2026-07-06T01:00:00.000Z")
        };
      }
    },
    sampleFee: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.sampleFeeCreates = calls.sampleFeeCreates ?? [];
        calls.sampleFeeCreates.push(data);
        return {
          id: "fee-1",
          sampleRequestId: "sample-created",
          feeType: data.feeType,
          amount: data.amount,
          currency: data.currency,
          note: data.note ?? null,
          incurredAt: data.incurredAt,
          createdById: data.createdById ?? null,
          createdAt: new Date("2026-07-06T00:00:00.000Z")
        };
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === "fee-1") {
          return sample.fees[0];
        }
        return null;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        return {
          id: "fee-1",
          sampleRequestId: "sample-1",
          feeType: data.feeType ?? "SAMPLE_MAKING",
          amount: data.amount ?? "88.00",
          currency: data.currency ?? "USD",
          note: data.note ?? "旧备注",
          incurredAt: data.incurredAt ?? new Date("2026-07-07T00:00:00.000Z"),
          createdById: "user-1",
          createdAt: new Date("2026-07-07T00:00:00.000Z")
        };
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        calls.sampleFeeDeletes = calls.sampleFeeDeletes ?? [];
        calls.sampleFeeDeletes.push(where);
        return {
          id: "fee-1",
          sampleRequestId: "sample-1",
          feeType: "SAMPLE_MAKING",
          amount: "88.00",
          currency: "USD",
          note: "旧备注",
          incurredAt: new Date("2026-07-07T00:00:00.000Z"),
          createdById: "user-1",
          createdAt: new Date("2026-07-07T00:00:00.000Z")
        };
      }
    },
    sampleHistory: {
      create: async () => ({ id: "history-1" })
    },
    quoteHistory: {
      create: async () => ({ id: "quote-history-1" })
    }
  };

  const prisma = {
    customer: {
      findFirst: async () => ({ id: "customer-1", organizationId: "org-1" })
    },
    quote: {
      findFirst: async () => quoteBase
    },
    user: {
      findUnique: async () => ({ name: "Tester", email: "tester@example.com" })
    },
    sampleRequest: {
      findFirst: async () => sample
    },
    sampleFee: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id === "fee-1") {
          return sample.fees[0];
        }
        return null;
      }
    },
    $transaction: async <T>(callback: (trx: typeof tx) => Promise<T>) => callback(tx)
  };

  const customerStageService = {
    advanceCustomerStage: async () => undefined
  };

  return {
    calls,
    service: new CommercialService(prisma as never, customerStageService as never)
  };
}

async function main() {
  {
    const { service, calls } = buildService();

    const pricing = calculateQuotePricing({
      materialCost: "12.345",
      processingCost: "0.335",
      taxCost: "1.5",
      shippingCost: "0.8",
      discountAmount: "0.2",
      quantity: "3",
      moq: "1"
    });

    assert.equal(pricing.subtotal, 14.99);
    assert.equal(pricing.total, 14.79);
    assert.equal(pricing.unitPrice, 4.93);
    assert.equal(pricing.moqValid, true);
    assert.equal(pricing.totalValid, true);

    // 公式模式：物料A 6×2×(1+0.05) + 物料B 4×2×(1+0.05) = 21，21×(1+0.10利润)=23.10 物料报价
    // 工时2×费率5×(1+0.10利润)=11.00 加工费报价
    // 体积重=10×10×10÷200=5，Max(毛重3,体积重5)×2单价=10.00 运费
    // (23.10+11.00+10.00)×0.13增值税率=5.73 税费
    // subtotal=49.83 total=49.83-1.00=48.83 unitPrice=48.83/3=16.28
    const formulaPricing = calculateQuotePricing({
      calcMode: "formula",
      materialItems: [
        { name: "物料A", usage: 6, unitPrice: 2, lossRate: 0.05 },
        { name: "物料B", usage: 4, unitPrice: 2, lossRate: 0.05 }
      ],
      materialProfitRate: 0.10,
      processingTime: 2,
      processingHourlyRate: 5,
      processingProfitRate: 0.10,
      grossWeight: 3,
      packageLength: 10,
      packageWidth: 10,
      packageHeight: 10,
      volumeDivisor: 200,
      shippingUnitPrice: 2,
      vatRate: 0.13,
      discountAmount: 1,
      quantity: 3,
      moq: 1
    });
    assert.equal(formulaPricing.materialCost, 23.10);
    assert.equal(formulaPricing.processingCost, 11.00);
    assert.equal(formulaPricing.shippingCost, 10.00);
    assert.equal(formulaPricing.taxCost, 5.73);
    assert.equal(formulaPricing.subtotal, 49.83);
    assert.equal(formulaPricing.total, 48.83);
    assert.equal(formulaPricing.unitPrice, 16.28);
    assert.equal(formulaPricing.totalValid, true);
    assert.equal(formulaPricing.calcMode, "formula");
    assert.equal(formulaPricing.breakdown?.materialBaseCost, 20.00);
    assert.equal(formulaPricing.breakdown?.materialCost, 21.00);
    assert.equal(formulaPricing.breakdown?.materialQuote, 23.10);
    assert.equal(formulaPricing.breakdown?.materialItems.length, 2);
    assert.equal(formulaPricing.breakdown?.materialItems[0]?.lossRate, 0.05);
    assert.equal(formulaPricing.breakdown?.materialItems[0]?.baseCost, 12.00);
    assert.equal(formulaPricing.breakdown?.materialItems[0]?.cost, 12.60);
    assert.equal(formulaPricing.breakdown?.volumeWeight, 5);
    assert.equal(formulaPricing.breakdown?.chargeableWeight, 5);
    assert.equal(formulaPricing.breakdown?.taxBase, 44.10);

    // MOQ大于数量时应报错（边界情况：quantity=0）
    const edgeCase = calculateQuotePricing({ quantity: "0", moq: "60" });
    assert.equal(edgeCase.moqValid, false);

    // MOQ大于数量时应报错（正常情况）
    const moqExceedsQty = calculateQuotePricing({ quantity: "50", moq: "60" });
    assert.equal(moqExceedsQty.moqValid, false);

    const negativeTotal = calculateQuotePricing({
      materialCost: 1,
      processingCost: 1,
      taxCost: 1,
      shippingCost: 1,
      discountAmount: 5,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeTotal.total, -1);
    assert.equal(negativeTotal.totalValid, false);

    // 单项负数但总价仍 ≥0：优惠金额为负（优惠变加价），应被 nonNegativeItemValid 拦截
    const negativeDiscount = calculateQuotePricing({
      materialCost: 100,
      processingCost: 50,
      taxCost: 10,
      shippingCost: 10,
      discountAmount: -50,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeDiscount.total, 220);
    assert.equal(negativeDiscount.totalValid, true);
    assert.equal(negativeDiscount.nonNegativeItemValid, false);

    // 单项负数但总价仍 ≥0：加工费为负，应被 nonNegativeItemValid 拦截
    const negativeProcessing = calculateQuotePricing({
      materialCost: 100,
      processingCost: -50,
      taxCost: 10,
      shippingCost: 10,
      discountAmount: 0,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeProcessing.totalValid, true);
    assert.equal(negativeProcessing.nonNegativeItemValid, false);

    // 公式模式：物料单价为负，应被 nonNegativeItemValid 拦截
    const negativeFormulaMaterial = calculateQuotePricing({
      calcMode: "formula",
      materialItems: [{ name: "A", usage: 1, unitPrice: -10, lossRate: 0 }],
      processingTime: 0,
      processingHourlyRate: 0,
      grossWeight: 0,
      packageLength: 0,
      packageWidth: 0,
      packageHeight: 0,
      volumeDivisor: 1,
      shippingUnitPrice: 0,
      vatRate: 0,
      discountAmount: 0,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeFormulaMaterial.nonNegativeItemValid, false);

    // 利润率/损耗率允许为负（让利/亏损），不应触发 nonNegativeItemValid；增值税率不在此列
    const negativeRate = calculateQuotePricing({
      calcMode: "formula",
      materialItems: [{ name: "A", usage: 1, unitPrice: 10, lossRate: 0 }],
      materialProfitRate: -0.2,
      processingTime: 1,
      processingHourlyRate: 10,
      processingProfitRate: -0.1,
      grossWeight: 0,
      packageLength: 0,
      packageWidth: 0,
      packageHeight: 0,
      volumeDivisor: 1,
      shippingUnitPrice: 0,
      vatRate: 0,
      discountAmount: 0,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeRate.nonNegativeItemValid, true);

    // 增值税率不允许为负，应被 nonNegativeItemValid 拦截
    const negativeVatRate = calculateQuotePricing({
      calcMode: "formula",
      materialItems: [{ name: "A", usage: 1, unitPrice: 10, lossRate: 0 }],
      materialProfitRate: 0,
      processingTime: 1,
      processingHourlyRate: 10,
      processingProfitRate: 0,
      grossWeight: 0,
      packageLength: 0,
      packageWidth: 0,
      packageHeight: 0,
      volumeDivisor: 1,
      shippingUnitPrice: 0,
      vatRate: -0.13,
      discountAmount: 0,
      quantity: 1,
      moq: 1
    });
    assert.equal(negativeVatRate.nonNegativeItemValid, false);

    // 正常输入：nonNegativeItemValid 应为 true
    const validPricing = calculateQuotePricing({
      materialCost: 100,
      processingCost: 50,
      taxCost: 10,
      shippingCost: 10,
      discountAmount: 20,
      quantity: 1,
      moq: 1
    });
    assert.equal(validPricing.nonNegativeItemValid, true);

    await service.createQuote(user, {
      customerId: "customer-1",
      quoteNo: "Q-NEW",
      productName: "New quote",
      specification: "Spec D",
      moq: 1,
      quantity: 3,
      currency: "USD",
      materialCost: 12.345,
      processingCost: 0.335,
      taxCost: 1.5,
      shippingCost: 0.8,
      discountAmount: 0.2
    });

    assert.equal((calls.quoteCreate?.amount as { toString(): string }).toString(), "14.79");
    assert.equal((calls.quoteCreate?.unitPrice as { toString(): string }).toString(), "4.93");
    assert.equal(calls.quoteCreate?.status, "DRAFT");
    assert.equal(calls.quoteCreate?.approvalStatus, "DRAFT");
  }

  {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.createQuote(user, {
          customerId: "customer-1",
          quoteNo: "Q-INVALID",
          productName: "Invalid quote",
          moq: 10,
          quantity: 5,
          currency: "USD"
        }),
      BadRequestException
    );
  }

  {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.createQuote(user, {
          customerId: "customer-1",
          quoteNo: "Q-NEGATIVE",
          productName: "Negative quote",
          moq: 1,
          quantity: 1,
          currency: "USD",
          materialCost: 1,
          processingCost: 1,
          taxCost: 1,
          shippingCost: 1,
          discountAmount: 5
        }),
      BadRequestException
    );
  }

  {
    const { service } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "DRAFT" });

    await assert.rejects(
      () => service.updateQuote(user, "quote-1", { discountAmount: 200 }),
      BadRequestException
    );
  }

  // 单项负数但总价仍 ≥0：应被 nonNegativeItemValid 拦截（禁止负数报价意图）
  {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.createQuote(user, {
          customerId: "customer-1",
          quoteNo: "Q-NEGATIVE-DISCOUNT",
          productName: "Negative discount quote",
          moq: 1,
          quantity: 1,
          currency: "USD",
          materialCost: 100,
          processingCost: 50,
          taxCost: 10,
          shippingCost: 10,
          discountAmount: -50
        }),
      BadRequestException
    );
  }

  {
    const { service } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "DRAFT" });

    await assert.rejects(
      () => service.updateQuote(user, "quote-1", { processingCost: -50 }),
      BadRequestException
    );
  }

  {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.createQuote(user, {
          customerId: "customer-1",
          quoteNo: "Q-NEGATIVE-PROCESSING",
          productName: "Negative processing quote",
          moq: 1,
          quantity: 1,
          currency: "USD",
          materialCost: 100,
          processingCost: -50,
          taxCost: 10,
          shippingCost: 10,
          discountAmount: 0
        }),
      BadRequestException
    );
  }

  {
    const { service, calls } = buildService();

    await service.createSample(user, {
      customerId: "customer-1",
      productSummary: "New sample",
      specification: "Spec B",
      material: "PP",
      process: "3D printing",
      sampleQuantity: 3,
      samplePurpose: "EXHIBITION",
      deliveryDeadline: "2026-07-20",
      fileAssetIds: ["file-1", "file-2"],
      initialFees: [
        {
          feeType: "SAMPLE_MAKING",
          amount: 88,
          currency: "USD"
        },
        {
          feeType: "COURIER",
          amount: 12,
          currency: "USD",
          note: "首单快递"
        }
      ]
    });

    assert.equal(calls.sampleCreate?.status, "APPROVING");
    assert.deepEqual(calls.sampleCreate?.fileAssetIds, ["file-1", "file-2"]);
    assert.equal(calls.sampleFeeCreates?.length, 2);
    assert.equal(calls.sampleFeeCreates?.[0]?.feeType, "SAMPLE_MAKING");
    assert.equal(calls.sampleFeeCreates?.[1]?.feeType, "COURIER");
  }

  {
    const { service, calls } = buildService();

    await service.createSample(user, {
      customerId: "customer-1",
      productSummary: "No fee sample",
      specification: "Spec D",
      material: "ABS",
      process: "Molding",
      sampleQuantity: 2,
      samplePurpose: "APPEARANCE_CONFIRMATION",
      fileAssetIds: [],
      initialFees: []
    });

    assert.equal(calls.sampleCreate?.status, "APPROVING");
    assert.equal(calls.sampleFeeCreates?.length ?? 0, 0);
  }

  {
    const { service, calls } = buildService();

    await service.createSample(user, {
      customerId: "customer-1",
      productSummary: "No deadline sample",
      specification: "Spec C",
      material: "ABS",
      process: "Molding",
      sampleQuantity: 1,
      samplePurpose: "CUSTOMER_TEST",
      fileAssetIds: [],
      initialFees: [
        {
          feeType: "SAMPLE_MAKING",
          amount: 15,
          currency: "USD"
        }
      ]
    });

    assert.equal(calls.sampleCreate?.deliveryDeadline, undefined);
  }

  {
    const { service } = buildService();

    await assert.rejects(
      () =>
        service.updateSample(user, "sample-1", {
          status: "SHIPPED",
          carrier: "",
          trackingNo: ""
        }),
      BadRequestException
    );
  }

  {
    const { service, calls } = buildService("APPROVING");

    await service.updateSample(user, "sample-1", {
      status: "PREPARING",
      comment: "样品审核通过"
    });

    assert.equal(calls.sampleUpdate?.status, "PREPARING");
    assert.equal(calls.sampleUpdate?.approvalComment, "样品审核通过");
  }

  {
    const { service, calls } = buildService("APPROVING");

    await service.updateSample(user, "sample-1", {
      status: "REJECTED",
      comment: "资料还不完整"
    });

    assert.equal(calls.sampleUpdate?.status, "REJECTED");
    assert.equal(calls.sampleUpdate?.approvalComment, "资料还不完整");
  }

  {
    const { service, calls } = buildService("APPROVING");

    await service.updateSample(user, "sample-1", {
      status: "PREPARING",
      comment: ""
    });

    assert.equal(calls.sampleUpdate?.approvalComment, null);
  }

  {
    const { service } = buildService();

    const updatedFee = await service.updateSampleFee(user, "sample-1", "fee-1", {
      feeType: "COURIER",
      amount: 18,
      currency: "USD",
      note: "补充快递费"
    });

    assert.equal(updatedFee.feeType, "COURIER");
  }

  {
    const { service, calls } = buildService();

    const deletedFee = await service.deleteSampleFee(user, "sample-1", "fee-1");

    assert.equal(deletedFee.id, "fee-1");
    assert.equal(calls.sampleFeeDeletes?.length, 1);
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "DRAFT" });
    await service.submitQuoteReview(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.approvalStatus, "PENDING_APPROVAL");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "DRAFT" });
    await service.submitQuoteReview(user, "quote-1", { comment: "" });
    assert.equal(calls.quoteUpdate?.approvalComment, null);
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "PENDING_APPROVAL" });
    await service.approveQuote(user, "quote-1", { comment: "审批通过，建议继续发送" });
    assert.equal(calls.quoteUpdate?.approvalStatus, "APPROVED");
    assert.equal(calls.quoteUpdate?.approvalComment, "审批通过，建议继续发送");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "PENDING_APPROVAL" });
    await service.rejectQuote(user, "quote-1", { comment: "报价参数需要调整" });
    assert.equal(calls.quoteUpdate?.approvalStatus, "REJECTED");
    assert.equal(calls.quoteUpdate?.approvalComment, "报价参数需要调整");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "APPROVED" });
    await service.sendQuote(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "SENT");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "SENT", approvalStatus: "APPROVED" });
    await service.acceptQuote(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "ACCEPTED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "SENT", approvalStatus: "APPROVED" });
    const updated = await service.rejectQuoteByCustomer(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "REJECTED");
    assert.equal(updated.approvalStatus, "APPROVED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "SENT", approvalStatus: "APPROVED" });
    await service.expireQuote(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "EXPIRED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "REJECTED", approvalStatus: "APPROVED" });
    const updated = await service.updateQuote(user, "quote-1", { notes: "revised" });
    assert.equal(calls.quoteUpdate?.notes, "revised");
    assert.equal(updated.status, "REJECTED");
    assert.equal(updated.approvalStatus, "APPROVED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "APPROVED" });
    await service.updateQuote(user, "quote-1", { status: "SENT" });
    assert.equal(calls.quoteUpdate?.status, "SENT");
    assert.equal(calls.quoteUpdate?.approvalStatus, "APPROVED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "DRAFT", approvalStatus: "APPROVED" });
    await service.updateQuote(user, "quote-1", { status: "CUSTOMER_REJECTED" });
    assert.equal(calls.quoteUpdate?.status, "CUSTOMER_REJECTED");
    assert.equal(calls.quoteUpdate?.approvalStatus, "APPROVED");
  }

  {
    const { service } = buildService();
    const quote = {
      quoteNo: "Q-EXPORT-1",
      productName: "导出测试产品",
      specification: "白色",
      moq: 50,
      quantity: 50,
      unitPrice: "0.98",
      status: "DRAFT",
      approvalStatus: "DRAFT",
      currency: "USD",
      amount: "48.83",
      materialCost: "23.10",
      processingCost: "11.00",
      taxCost: "5.73",
      shippingCost: "10.00",
      discountAmount: "1.00",
      calcMode: "formula",
      materialItems: [
        { name: "物料A", usage: 6, unitPrice: 2, lossRate: 0.05 },
        { name: "物料B", usage: 4, unitPrice: 2, lossRate: 0.05 }
      ],
      materialProfitRate: "0.10",
      processingTime: "2",
      processingHourlyRate: "5",
      processingProfitRate: "0.10",
      grossWeight: "3",
      packageLength: "10",
      packageWidth: "10",
      packageHeight: "10",
      volumeDivisor: "200",
      shippingUnitPrice: "2",
      vatRate: "0.13",
      validUntil: null,
      notes: null,
      approvalComment: null,
      approvalSubmittedAt: null,
      approvalReviewedAt: null,
      customer: { name: "测试客户" },
      createdAt: new Date("2026-08-05T00:00:00.000Z"),
      updatedAt: new Date("2026-08-05T01:00:00.000Z")
    };
    const exportService = service as unknown as {
      buildQuotesWorkbook(quotes: typeof quote[]): Promise<Buffer>;
    };
    const output = await exportService.buildQuotesWorkbook([quote]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output as never);

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["报价汇总", "价格明细"]);
    const summarySheet = workbook.getWorksheet("报价汇总");
    const detailSheet = workbook.getWorksheet("价格明细");
    assert.equal(summarySheet?.getRow(2).getCell(1).value, "Q-EXPORT-1");
    assert.equal(summarySheet?.getRow(2).getCell(8).value, 48.83);
    const fillColor = (columnNumber: number) => (
      summarySheet?.getRow(1).getCell(columnNumber).fill as { fgColor?: { argb?: string } }
    ).fgColor?.argb;
    assert.equal(fillColor(1), "FF007F73");
    assert.equal(fillColor(12), "FF007F73");
    assert.equal(fillColor(15), "FF007F73");
    assert.equal(fillColor(16), undefined);
    assert.equal(detailSheet?.getRow(2).getCell(5).value, "物料");
    assert.equal(detailSheet?.getRow(2).getCell(6).value, "物料A");
    assert.equal(detailSheet?.getRow(9).getCell(6).value, "报价总额");
    assert.equal(detailSheet?.getRow(9).getCell(11).value, 48.83);
  }

  console.log("commercial.service.spec.ts OK");
}

void main();
