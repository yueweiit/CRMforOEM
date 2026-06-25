import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { EMAIL_DRAFT_PURPOSES, normalizeEmailDraftPurpose } from "@oem-crm/shared";
import { RequestUser } from "../../../common/auth/current-user.decorator";
import { hasPermission } from "../../../common/auth/permission.utils";
import { PrismaService } from "../../../infrastructure/prisma/prisma.service";
import type { UpdateEmailPromptConfigDto } from "../dto/settings.dto";
import { assembleFinalPrompt, DEFAULT_EMAIL_PROMPT_CONFIGS, mergeEmailPromptDefaults, toStringArray } from "../prompts/settings-email-prompt.defaults";
import type { EmailPromptConfigData, EmailPromptConfigRow, EmailPromptPreviewResult } from "../prompts/settings-email-prompt.types";

@Injectable()
export class EmailPromptConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfigs(user: RequestUser): Promise<Record<string, EmailPromptConfigData>> {
    const rows = await this.prisma.emailPromptConfig.findMany({
      where: { organizationId: user.organizationId }
    });
    const rowByPurpose = new Map(rows.map((row: { purpose: string; [key: string]: unknown }) => [row.purpose, row]));
    const result: Record<string, EmailPromptConfigData> = {};
    for (const purpose of EMAIL_DRAFT_PURPOSES) {
      const row = rowByPurpose.get(purpose);
      result[purpose] = row ? mergeEmailPromptDefaults(row as unknown as EmailPromptConfigRow) : { ...DEFAULT_EMAIL_PROMPT_CONFIGS[purpose] };
    }
    return result;
  }

  async updateConfig(user: RequestUser, purpose: string, dto: UpdateEmailPromptConfigDto): Promise<EmailPromptConfigData> {
    if (!hasPermission(user, "settings.email_prompt.manage")) {
      throw new ForbiddenException("You do not have permission to modify email prompt configuration");
    }
    const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
    if (!EMAIL_DRAFT_PURPOSES.includes(normalizedPurpose)) {
      throw new NotFoundException(`Unknown email purpose: ${purpose}`);
    }

    const oldRow = await this.prisma.emailPromptConfig.findUnique({
      where: { organizationId_purpose: { organizationId: user.organizationId, purpose: normalizedPurpose } }
    });
    const oldData = oldRow ? mergeEmailPromptDefaults(oldRow) : { ...DEFAULT_EMAIL_PROMPT_CONFIGS[normalizedPurpose] };

    const upserted = await this.prisma.emailPromptConfig.upsert({
      where: { organizationId_purpose: { organizationId: user.organizationId, purpose: normalizedPurpose } },
      update: {
        goal: dto.goal,
        tone: dto.tone,
        mustInclude: dto.mustInclude ?? [],
        mustAvoid: dto.mustAvoid ?? [],
        structure: dto.structure,
        customInstruction: dto.customInstruction,
        isActive: dto.isActive,
        updatedById: user.id
      },
      create: {
        organizationId: user.organizationId,
        purpose: normalizedPurpose,
        goal: dto.goal,
        tone: dto.tone,
        mustInclude: dto.mustInclude ?? [],
        mustAvoid: dto.mustAvoid ?? [],
        structure: dto.structure,
        customInstruction: dto.customInstruction,
        isActive: dto.isActive ?? true,
        createdById: user.id,
        updatedById: user.id
      }
    });

    const newData = mergeEmailPromptDefaults(upserted);

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "UPDATE",
        entityType: "EMAIL_PROMPT_CONFIG",
        entityId: upserted.id,
        before: oldData as never,
        after: newData as never
      }
    });

    return newData;
  }

  async resetConfig(user: RequestUser, purpose: string): Promise<EmailPromptConfigData> {
    if (!hasPermission(user, "settings.email_prompt.manage")) {
      throw new ForbiddenException("You do not have permission to reset email prompt configuration");
    }
    const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
    if (!EMAIL_DRAFT_PURPOSES.includes(normalizedPurpose)) {
      throw new NotFoundException(`Unknown email purpose: ${purpose}`);
    }

    const oldRow = await this.prisma.emailPromptConfig.findUnique({
      where: { organizationId_purpose: { organizationId: user.organizationId, purpose: normalizedPurpose } }
    });

    if (oldRow) {
      const oldData = mergeEmailPromptDefaults(oldRow);
      await this.prisma.emailPromptConfig.delete({
        where: { organizationId_purpose: { organizationId: user.organizationId, purpose: normalizedPurpose } }
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "DELETE",
          entityType: "EMAIL_PROMPT_CONFIG",
          entityId: oldRow.id,
          before: oldData as never,
          after: { ...DEFAULT_EMAIL_PROMPT_CONFIGS[normalizedPurpose] } as never
        }
      });
    }

    return { ...DEFAULT_EMAIL_PROMPT_CONFIGS[normalizedPurpose] };
  }

  async previewConfig(user: RequestUser, purpose: string, override?: UpdateEmailPromptConfigDto): Promise<EmailPromptPreviewResult> {
    const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
    if (!EMAIL_DRAFT_PURPOSES.includes(normalizedPurpose)) {
      throw new NotFoundException(`Unknown email purpose: ${purpose}`);
    }

    const row = await this.prisma.emailPromptConfig.findUnique({
      where: { organizationId_purpose: { organizationId: user.organizationId, purpose: normalizedPurpose } }
    });

    let config: EmailPromptConfigData;
    const overrideConfig = override && Object.keys(override).length > 0 ? override : null;
    if (overrideConfig) {
      const base = row ? mergeEmailPromptDefaults(row) : { ...DEFAULT_EMAIL_PROMPT_CONFIGS[normalizedPurpose] };
      config = {
        goal: overrideConfig.goal ?? base.goal,
        tone: overrideConfig.tone ?? base.tone,
        mustInclude: overrideConfig.mustInclude ?? base.mustInclude,
        mustAvoid: overrideConfig.mustAvoid ?? base.mustAvoid,
        structure: overrideConfig.structure ?? base.structure,
        customInstruction: overrideConfig.customInstruction ?? base.customInstruction,
        isActive: overrideConfig.isActive ?? base.isActive
      };
    } else {
      config = row ? mergeEmailPromptDefaults(row) : { ...DEFAULT_EMAIL_PROMPT_CONFIGS[normalizedPurpose] };
    }

    return {
      purpose: normalizedPurpose,
      prompt: assembleFinalPrompt(normalizedPurpose, config),
      isActive: config.isActive,
      source: overrideConfig ? "override" : "saved"
    };
  }

  async readOrgPromptConfig(organizationId: string, purpose?: string | null): Promise<EmailPromptConfigData | null> {
    const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
    const row = await this.prisma.emailPromptConfig.findUnique({
      where: { organizationId_purpose: { organizationId, purpose: normalizedPurpose } }
    });
    if (!row) return null;
    return mergeEmailPromptDefaults(row);
  }
}
