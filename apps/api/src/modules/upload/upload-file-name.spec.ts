import * as assert from "node:assert/strict";
import { repairMojibakeFileName, resolveUploadFileName } from "./upload-file-name";

const mojibakeFileName = Buffer.from("测试附件.xlsx", "utf8").toString("latin1");

assert.equal(repairMojibakeFileName(mojibakeFileName), "测试附件.xlsx");
assert.equal(repairMojibakeFileName("café.xlsx"), "café.xlsx");
assert.equal(resolveUploadFileName("报价资料.xlsx", mojibakeFileName), "报价资料.xlsx");
assert.equal(resolveUploadFileName("C:\\fake\\报价资料.xlsx", "fallback.xlsx"), "报价资料.xlsx");
assert.equal(resolveUploadFileName("   ", "fallback.xlsx"), "fallback.xlsx");
