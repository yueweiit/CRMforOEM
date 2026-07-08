import * as assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
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
      status: "REQUESTED"
    });

    assert.equal(calls.sampleUpdate?.status, "REQUESTED");
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
    await service.rejectQuoteByCustomer(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "REJECTED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "SENT", approvalStatus: "APPROVED" });
    await service.expireQuote(user, "quote-1", {});
    assert.equal(calls.quoteUpdate?.status, "EXPIRED");
  }

  {
    const { service, calls } = buildService("PREPARING", { status: "REJECTED", approvalStatus: "APPROVED" });
    await service.updateQuote(user, "quote-1", { notes: "revised" });
    assert.equal(calls.quoteUpdate?.status, "REJECTED");
    assert.equal(calls.quoteUpdate?.approvalStatus, "APPROVED");
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

  console.log("commercial.service.spec.ts OK");
}

void main();
