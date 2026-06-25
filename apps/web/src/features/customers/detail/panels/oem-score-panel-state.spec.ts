import * as assert from "node:assert/strict";
import { getOemScorePanelDisplayState } from "./oem-score-panel-state";

assert.deepEqual(
  getOemScorePanelDisplayState({ isGenerating: false, score: undefined }),
  {
    titleStatus: "未评分",
    showGeneratingNotice: false,
    showEmptyState: true,
    showExistingScore: false
  }
);

assert.deepEqual(
  getOemScorePanelDisplayState({ isGenerating: true, score: undefined }),
  {
    titleStatus: "生成中",
    showGeneratingNotice: true,
    showEmptyState: false,
    showExistingScore: false
  }
);

assert.deepEqual(
  getOemScorePanelDisplayState({ isGenerating: false, score: { score: 86, grade: "A" } }),
  {
    titleStatus: "86 / A",
    showGeneratingNotice: false,
    showEmptyState: false,
    showExistingScore: true
  }
);

assert.deepEqual(
  getOemScorePanelDisplayState({ isGenerating: true, score: { score: 76, grade: "B" } }),
  {
    titleStatus: "生成中",
    showGeneratingNotice: true,
    showEmptyState: false,
    showExistingScore: true
  }
);

console.log("oem-score-panel-state.spec.ts OK");
