import { EMAIL_DRAFT_PURPOSE_LABELS, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import type { EmailPromptConfigData } from "../settings/settings.service";
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
  recipientTitle?: string,
  dbConfig?: EmailPromptConfigData | null
) {
  const recipientConstraint = recipientName
    ? `The recipient is ${recipientName}${recipientTitle ? ` (${recipientTitle})` : ""}. Address them accordingly.`
    : "";

  const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
  const template = EMAIL_PROMPT_TEMPLATES[normalizedPurpose] ?? EMAIL_PROMPT_TEMPLATES.DEFAULT;

  const dbConfigLines = buildDbConfigLines(normalizedPurpose, dbConfig);

  return [
    EMAIL_PROMPT_BASE,
    EMAIL_PROMPT_FACT_SAFETY_HINT,
    EMAIL_PROMPT_RECIPIENT_HINT,
    EMAIL_PROMPT_FOLLOW_UP_HINT,
    ...template,
    ...dbConfigLines,
    recipientConstraint
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDbConfigLines(purpose: string, config?: EmailPromptConfigData | null): string[] {
  if (!config || !config.isActive) return [];

  const label = EMAIL_DRAFT_PURPOSE_LABELS[purpose as keyof typeof EMAIL_DRAFT_PURPOSE_LABELS] ?? purpose;
  const lines: string[] = [];

  if (config.goal) lines.push(`Email type: ${label}. Goal: ${config.goal}`);
  if (config.tone) lines.push(`Tone and style: ${config.tone}`);
  if (config.mustInclude.length) lines.push(`Must include in the email: ${config.mustInclude.join("; ")}`);
  if (config.mustAvoid.length) lines.push(`Must avoid: ${config.mustAvoid.join("; ")}`);
  if (config.structure) lines.push(`Recommended email structure: ${config.structure}`);
  if (config.customInstruction) lines.push(`Additional business instructions: ${config.customInstruction}`);

  return lines;
}
