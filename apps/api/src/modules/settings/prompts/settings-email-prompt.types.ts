import type { EmailDraftPurpose } from "@oem-crm/shared";

export type EmailPromptConfigData = {
  goal: string;
  tone: string;
  mustInclude: string[];
  mustAvoid: string[];
  structure: string;
  customInstruction: string;
  isActive: boolean;
};

export type EmailPromptPreviewResult = {
  purpose: EmailDraftPurpose;
  prompt: string;
  isActive: boolean;
  source: "override" | "saved";
};

export type EmailPromptConfigRow = {
  goal: unknown;
  tone: unknown;
  mustInclude: unknown;
  mustAvoid: unknown;
  structure: unknown;
  customInstruction: unknown;
  isActive: unknown;
};
