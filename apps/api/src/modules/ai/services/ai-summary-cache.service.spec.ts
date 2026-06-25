import * as assert from "node:assert/strict";
import { AiSummaryCache } from "./ai-summary-cache.service";

function run() {
  // ── Basic get/set/has ──
  {
    const cache = new AiSummaryCache();
    const key = {
      scope: "test",
      groupName: "customer_profile",
      batchIndex: 0,
      contentHash: "abc123",
      promptVersion: "v1"
    };

    assert.equal(cache.has(key), false, "cache miss initially");
    assert.equal(cache.get(key), undefined, "get returns undefined on miss");

    cache.set(key, "result data");
    assert.equal(cache.has(key), true, "cache hit after set");
    assert.equal(cache.get(key), "result data", "get returns stored value");
    assert.equal(cache.size, 1, "cache size is 1");
  }

  // ── Same contentHash + promptVersion hits cache ──
  {
    const cache = new AiSummaryCache();
    const key1 = {
      scope: "analysis-1",
      groupName: "website_summary",
      batchIndex: 0,
      contentHash: "def456",
      promptVersion: "v2"
    };
    const key2 = { ...key1 }; // identical

    cache.set(key1, "cached output");
    assert.equal(cache.get(key2), "cached output", "same key hits cache");
  }

  // ── Different promptVersion misses cache ──
  {
    const cache = new AiSummaryCache();
    const key1 = {
      scope: "analysis-1",
      groupName: "website_summary",
      batchIndex: 0,
      contentHash: "def456",
      promptVersion: "v1"
    };
    const key2 = { ...key1, promptVersion: "v2" };

    cache.set(key1, "v1 output");
    assert.equal(cache.has(key2), false, "different promptVersion misses cache");
  }

  // ── Different contentHash misses cache ──
  {
    const cache = new AiSummaryCache();
    const key1 = {
      scope: "analysis-1",
      groupName: "website_summary",
      batchIndex: 0,
      contentHash: "aaa",
      promptVersion: "v1"
    };
    const key2 = { ...key1, contentHash: "bbb" };

    cache.set(key1, "output for aaa");
    assert.equal(cache.has(key2), false, "different contentHash misses cache");
  }

  // ── Different scope, groupName, batchIndex also differentiate ──
  {
    const cache = new AiSummaryCache();
    const base = {
      scope: "scope-a",
      groupName: "group-1",
      batchIndex: 0,
      contentHash: "hash1",
      promptVersion: "v1"
    };

    cache.set(base, "base output");
    assert.equal(cache.has({ ...base, scope: "scope-b" }), false, "different scope");
    assert.equal(cache.has({ ...base, groupName: "group-2" }), false, "different groupName");
    assert.equal(cache.has({ ...base, batchIndex: 1 }), false, "different batchIndex");
  }

  // ── computeContentHash is stable ──
  {
    const cache = new AiSummaryCache();
    const h1 = cache.computeContentHash("hello world");
    const h2 = cache.computeContentHash("hello world");
    const h3 = cache.computeContentHash("hello world!");
    assert.equal(h1, h2, "same content produces same hash");
    assert.notEqual(h1, h3, "different content produces different hash");
    assert.ok(typeof h1 === "string" && h1.length > 0, "hash is non-empty string");
  }

  // ── Call count control ──
  {
    const cache = new AiSummaryCache();
    const scopeId = "test-scope";

    // Default max calls
    assert.equal(cache.canCall(scopeId), true);
    cache.recordCall(scopeId);
    assert.equal(cache.getCallCount(scopeId), 1);
    assert.equal(cache.canCall(scopeId), true); // default max > 1

    // Custom max calls
    const scopeId2 = "limited-scope";
    assert.equal(cache.canCall(scopeId2, 2), true);
    cache.recordCall(scopeId2);
    assert.equal(cache.canCall(scopeId2, 2), true);
    cache.recordCall(scopeId2);
    assert.equal(cache.canCall(scopeId2, 2), false, "at max calls");
    assert.equal(cache.getCallCount(scopeId2), 2);
    assert.equal(cache.getCallLimit(scopeId2), 2);
  }

  // ── getMaxCalls by evidence size ──
  {
    const cache = new AiSummaryCache();
    // Small: <= 20 evidence, <= 3 pages
    assert.equal(cache.getMaxCalls(10, 2), 2, "small -> 2 calls");
    // Normal: <= 60 evidence, <= 10 pages
    assert.equal(cache.getMaxCalls(40, 5), 6, "normal -> 6 calls");
    // Large: anything bigger
    assert.equal(cache.getMaxCalls(80, 15), 10, "large -> 10 calls");
  }

  // ── registerScope ──
  {
    const cache = new AiSummaryCache();
    cache.registerScope("registered", 3);
    assert.equal(cache.getCallLimit("registered"), 3);

    // Re-registering doesn't reset count
    cache.recordCall("registered");
    cache.registerScope("registered", 5);
    assert.equal(cache.getCallCount("registered"), 1, "re-register preserves count");
    assert.equal(cache.getCallLimit("registered"), 3, "re-register preserves limit");
  }

  // ── Eviction when max entries reached ──
  {
    const cache = new AiSummaryCache(3);
    const base = { scope: "s", groupName: "g", batchIndex: 0, contentHash: "h", promptVersion: "v" };

    cache.set({ ...base, contentHash: "h1" }, "1");
    cache.set({ ...base, contentHash: "h2" }, "2");
    cache.set({ ...base, contentHash: "h3" }, "3");
    assert.equal(cache.size, 3);

    // Adding 4th evicts oldest
    cache.set({ ...base, contentHash: "h4" }, "4");
    assert.equal(cache.size, 3, "size stays at max");
    assert.equal(cache.has({ ...base, contentHash: "h1" }), false, "oldest entry evicted");
    assert.equal(cache.has({ ...base, contentHash: "h4" }), true, "newest entry present");
    assert.equal(cache.has({ ...base, contentHash: "h2" }), true, "middle entries present");
  }

  // ── clear resets everything ──
  {
    const cache = new AiSummaryCache();
    const key = { scope: "s", groupName: "g", batchIndex: 0, contentHash: "h", promptVersion: "v" };
    cache.set(key, "data");
    cache.recordCall("scope-1");
    cache.clear();
    assert.equal(cache.size, 0, "store cleared");
    assert.equal(cache.getCallCount("scope-1"), 0, "call trackers cleared");
  }

  console.log("ai-summary-cache.service.spec.ts OK");
}

void run();
