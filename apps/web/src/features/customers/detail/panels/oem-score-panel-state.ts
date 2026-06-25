type ScoreSummary = {
  score: number;
  grade: string;
};

export function getOemScorePanelDisplayState(input: { isGenerating: boolean; score?: ScoreSummary }) {
  const hasScore = Boolean(input.score);

  return {
    titleStatus: input.isGenerating
      ? "生成中"
      : input.score
        ? `${input.score.score} / ${input.score.grade}`
        : "未评分",
    showGeneratingNotice: input.isGenerating,
    showEmptyState: !input.isGenerating && !hasScore,
    showExistingScore: hasScore
  };
}
