export type EmailPromptConfigData = {
  goal: string;
  tone: string;
  mustInclude: string[];
  mustAvoid: string[];
  structure: string;
  customInstruction: string;
  isActive: boolean;
};
