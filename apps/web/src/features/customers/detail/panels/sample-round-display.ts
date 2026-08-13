export function sampleRoundDisplayStatus(round: {
  status: string;
  feedbackResult?: string | null;
  dispositionStatus?: string | null;
}) {
  if (round.feedbackResult === "ACCEPTED" && round.status === "COMPLETED") return "PASSED";
  if (round.feedbackResult === "CUSTOMER_REJECTED" && round.status === "FEEDBACK_RECEIVED" && round.dispositionStatus === "PENDING") return "PENDING_DISPOSITION";
  if (round.status !== "COMPLETED" || round.dispositionStatus === "PENDING") return null;
  return ["RETURNED", "CUSTOMER_KEPT", "DISPOSED"].includes(round.dispositionStatus ?? "")
    ? round.dispositionStatus ?? null
    : null;
}
