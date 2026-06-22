export type OemScoringWeights = {
  productLineFit: number;
  marketFit: number;
  priceBandFit: number;
  brandMaturity: number;
  websiteCompleteness: number;
  contactQuality: number;
  cooperationOpportunity: number;
  riskPenaltyMax: number;
};

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
  purpose: string;
  prompt: string;
  isActive: boolean;
  source: "override" | "saved";
};

export type UserRow = { id: string; email: string; name: string; title?: string; isActive: boolean; team?: { name: string }; userRoles: Array<{ role: { code: string; name: string } }> };
export type RoleRow = { id: string; code: string; name: string; dataScope: string; level: number; rolePermissions: Array<{ permission: { code: string; name: string } }> };
export type PermissionRow = { id: string; code: string; name: string; module: string; group: string; dependsOn: string[] };
export type DictionaryRow = { id: string; name: string; description?: string; isActive: boolean };
export type BlacklistRule = { id: string; type: string; value: string; reason?: string; isActive: boolean; createdAt: string };
export type AuditLog = { id: string; action: string; entityType: string; entityId?: string; actor?: { name: string; email: string }; createdAt: string };
