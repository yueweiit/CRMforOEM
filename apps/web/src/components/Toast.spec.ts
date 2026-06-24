import * as assert from "node:assert/strict";
import { toAppHref } from "./Toast";

assert.equal(toAppHref("/customers/customer-1/email", "/oemcrm"), "/oemcrm/customers/customer-1/email");
assert.equal(toAppHref("/oemcrm/customers/customer-1/email", "/oemcrm"), "/oemcrm/customers/customer-1/email");
assert.equal(toAppHref("https://example.com/customers/customer-1/email", "/oemcrm"), "https://example.com/customers/customer-1/email");
assert.equal(toAppHref("#email", "/oemcrm"), "#email");
assert.equal(toAppHref("mailto:sales@example.com", "/oemcrm"), "mailto:sales@example.com");
assert.equal(toAppHref("/customers/customer-1/email", "/"), "/customers/customer-1/email");
