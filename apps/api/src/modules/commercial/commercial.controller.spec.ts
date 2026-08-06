import * as assert from "node:assert/strict";
import { CommercialController } from "./commercial.controller";
import type { RequestUser } from "../../common/auth/current-user.decorator";

const user: RequestUser = {
  id: "user-1",
  organizationId: "org-1",
  roleCodes: [],
  permissions: [],
  dataScope: "ALL"
};

function createResponse() {
  const headers = new Map<string, string>();
  let sent: unknown;
  const response = {
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return response;
    },
    send(value: unknown) {
      sent = value;
      return response;
    }
  };
  return { response, headers, getSent: () => sent };
}

async function main() {
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const service = {
    getQuoteExport: async () => ({ workbook, fileName: "quote-Q-1.xlsx" }),
    getQuotesExport: async () => ({ workbook, fileName: "quotes.xlsx" }),
    listQuoteRevisions: async (_user: RequestUser, quoteId: string) => [{ id: quoteId, revisionNo: 1 }],
    createQuoteRevision: async (_user: RequestUser, quoteId: string, dto: { reason: string }) => ({
      id: "quote-2",
      previousRevisionId: quoteId,
      revisionNo: 2,
      revisionReason: dto.reason
    })
  };
  const controller = new CommercialController(service as never, {} as never);

  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.quotes), ["quotes.read"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.exportQuote), ["quotes.export"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.approveQuote), ["quotes.approve"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.sendQuote), ["quotes.send"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.quoteReferenceCandidates), ["quotes.reference.read"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.quoteRevisions), ["quotes.read"]);
  assert.deepEqual(Reflect.getMetadata("permissions", CommercialController.prototype.createQuoteRevision), ["quotes.write"]);

  assert.deepEqual(await controller.quoteRevisions(user, "quote-1"), [{ id: "quote-1", revisionNo: 1 }]);
  assert.deepEqual(await controller.createQuoteRevision(user, "quote-1", { reason: "客户要求调整价格" }), {
    id: "quote-2",
    previousRevisionId: "quote-1",
    revisionNo: 2,
    revisionReason: "客户要求调整价格"
  });

  const singleResponse = createResponse();
  await controller.exportQuote(user, "quote-1", singleResponse.response as never);
  assert.strictEqual(singleResponse.getSent(), workbook);
  assert.equal(singleResponse.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(singleResponse.headers.get("Content-Disposition"), "attachment; filename=\"quote-Q-1.xlsx\"");

  const batchResponse = createResponse();
  await controller.exportQuotes(user, "customer-1", batchResponse.response as never);
  assert.strictEqual(batchResponse.getSent(), workbook);
  assert.equal(batchResponse.headers.get("Content-Disposition"), "attachment; filename=\"quotes.xlsx\"");

  console.log("commercial.controller.spec.ts OK");
}

void main();
