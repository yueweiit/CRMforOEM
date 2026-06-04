import { normalizeEmailDraftPurpose } from "@oem-crm/shared";
import {
  EMAIL_PROMPT_BASE,
  EMAIL_PROMPT_FACT_SAFETY_HINT,
  EMAIL_PROMPT_FOLLOW_UP_HINT,
  EMAIL_PROMPT_RECIPIENT_HINT,
  EMAIL_PROMPT_TEMPLATES
} from "./email-prompt-constants";

export function buildEmailSystemPrompt(
  purpose?: string,
  recipientName?: string,
  recipientTitle?: string
) {
  const recipientConstraint = recipientName
    ? `The recipient is ${recipientName}${recipientTitle ? ` (${recipientTitle})` : ""}. Address them accordingly.`
    : "";

  const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
  const template = EMAIL_PROMPT_TEMPLATES[normalizedPurpose] ?? EMAIL_PROMPT_TEMPLATES.DEFAULT;

  return [
    ...template,
    recipientConstraint,
    EMAIL_PROMPT_RECIPIENT_HINT,
    EMAIL_PROMPT_FOLLOW_UP_HINT,
    EMAIL_PROMPT_FACT_SAFETY_HINT,
    EMAIL_PROMPT_BASE
  ]
    .filter(Boolean)
    .join(" ");
}
