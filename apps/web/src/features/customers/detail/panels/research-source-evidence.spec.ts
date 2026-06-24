import * as assert from "node:assert/strict";
import {
  buildResearchSourceEvidenceView,
  formatSourceBasisItem,
  hasResearchSourceEvidence
} from "./research-source-evidence";

const view = buildResearchSourceEvidenceView(
  {},
  {
    source_basis: [
      {
        section: "Core business",
        source: "Website",
        evidence: "https://example.com/products"
      }
    ]
  }
);

assert.equal(hasResearchSourceEvidence(view), true);
assert.equal(view.sourceBasis.length, 1);
assert.equal(formatSourceBasisItem(view.sourceBasis[0], 0), ["Core business", "Website", "https://example.com/products"].join(" · "));
