import * as assert from "node:assert/strict";
import { shouldShowWebsiteAnalysisReport } from "./website-analysis-panel-state";

assert.equal(shouldShowWebsiteAnalysisReport(undefined, false), false);
assert.equal(shouldShowWebsiteAnalysisReport("QUEUED", false), false);
assert.equal(shouldShowWebsiteAnalysisReport("QUEUED", true), false);
assert.equal(shouldShowWebsiteAnalysisReport("RUNNING", false), false);
assert.equal(shouldShowWebsiteAnalysisReport("RUNNING", true), false);
assert.equal(shouldShowWebsiteAnalysisReport("SUCCEEDED", false), true);
assert.equal(shouldShowWebsiteAnalysisReport("SUCCEEDED", true), true);
assert.equal(shouldShowWebsiteAnalysisReport("FAILED", false), false);
assert.equal(shouldShowWebsiteAnalysisReport("FAILED", true), true);

console.log("website-analysis-panel-state.spec.ts OK");
