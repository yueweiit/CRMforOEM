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

function buildService(sampleStatus = "PREPARING") {
  const calls: {
    sampleCreate?: Record<string, unknown>;
    sampleUpdate?: Record<string, unknown>;
  } = {};

  const sample = {
    id: "sample-1",
    customerId: "customer-1",
    quoteId: null,
    quote: null,
    productSummary: "Test sample",
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
    fees: [],
    returnRecords: [],
    createdAt: new Date("2026-07-06T00:00:00.000Z"),
    updatedAt: new Date("2026-07-06T00:00:00.000Z")
  };

  const tx = {
    sampleRequest: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.sampleCreate = data;
        return {
          id: "sample-created",
          customerId: "customer-1",
          quoteId: data.quoteId ?? null,
          productSummary: data.productSummary,
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
    sampleHistory: {
      create: async () => ({ id: "history-1" })
    }
  };

  const prisma = {
    customer: {
      findFirst: async () => ({ id: "customer-1", organizationId: "org-1" })
    },
    quote: {
      findFirst: async () => null
    },
    user: {
      findUnique: async () => ({ name: "Tester", email: "tester@example.com" })
    },
    sampleRequest: {
      findFirst: async () => sample
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
      fileAssetIds: ["file-1", "file-2"]
    });

    assert.equal(calls.sampleCreate?.status, "APPROVING");
    assert.deepEqual(calls.sampleCreate?.fileAssetIds, ["file-1", "file-2"]);
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

  console.log("commercial.service.spec.ts OK");
}

void main();
