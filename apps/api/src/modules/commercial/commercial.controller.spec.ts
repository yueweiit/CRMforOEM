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
    getQuotesExport: async () => ({ workbook, fileName: "quotes.xlsx" })
  };
  const controller = new CommercialController(service as never);

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
