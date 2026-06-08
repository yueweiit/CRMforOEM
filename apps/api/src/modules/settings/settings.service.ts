import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { RequestUser } from "../../common/auth/current-user.decorator";
import { hasPermission } from "../../common/auth/permission.utils";
import { PrismaService } from "../../prisma/prisma.service";
import { PermissionService } from "./permission.service";
import { CreateBlacklistRuleDto, CreateCustomerDictionaryDto, CreateUserDto, UpdateBlacklistRuleDto, UpdateCustomerDictionaryDto, UpdateEmailPromptConfigDto, UpdateOemScoringWeightsDto, UpdateUserDto } from "./dto/settings.dto";
import {
  EMAIL_DRAFT_PURPOSE_LABELS,
  type EmailDraftPurpose,
  EMAIL_DRAFT_PURPOSES,
  normalizeEmailDraftPurpose
} from "@oem-crm/shared";

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

export const DEFAULT_OEM_SCORING_WEIGHTS: OemScoringWeights = {
  productLineFit: 20,
  marketFit: 15,
  priceBandFit: 15,
  brandMaturity: 15,
  websiteCompleteness: 10,
  contactQuality: 10,
  cooperationOpportunity: 15,
  riskPenaltyMax: 10
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
  purpose: EmailDraftPurpose;
  prompt: string;
  isActive: boolean;
  source: "override" | "saved";
};

export const DEFAULT_EMAIL_PROMPT_CONFIGS: Record<EmailDraftPurpose, EmailPromptConfigData> = {
  FIRST_OUTREACH: {
    goal: "撰写首封 OEM/ODM 开发信，首次触达未接触过的目标客户。",
    tone: "专业、简洁、热情、非推销感。",
    mustInclude: ["客户产品线/官网分析关联点", "我方 OEM/ODM 能力简述", "一个明确的合作角度", "轻量回复邀请"],
    mustAvoid: ["虚构价格", "虚构认证", "虚构合作历史", "编造展会信息", "过度推销"],
    structure: "称呼 → 关联理由（基于客户情况）→ 能力介绍 → 合作建议 → 轻量 CTA",
    customInstruction: "",
    isActive: true
  },
  NO_REPLY_FOLLOW_UP: {
    goal: "对首封开发信未回复的客户进行礼貌跟进。",
    tone: "礼貌、不催促、不自动化感、比首封更简短。",
    mustInclude: ["提及上一封邮件内容", "一条新的价值点", "轻量回复引导"],
    mustAvoid: ["催促语气", "不耐烦表达", "重复首封邮件全部内容"],
    structure: "简短开场 → 回顾前邮 → 补充价值点 → 轻量 yes/no 问题",
    customInstruction: "",
    isActive: true
  },
  PRODUCT_RECOMMENDATION: {
    goal: "基于客户产品线推荐我方匹配产品。",
    tone: "专业、数据驱动、有帮助性。",
    mustInclude: ["客户现有产品线分析", "1-3 个推荐产品及匹配理由", "样品/目录/定制选项邀请"],
    mustAvoid: ["推荐过多产品（超过 5 个）", "虚构产品规格", "虚构价格"],
    structure: "产品匹配分析 → 推荐产品及理由 → 合作价值 → 下一步",
    customInstruction: "",
    isActive: true
  },
  REQUIREMENT_CONFIRMATION: {
    goal: "在客户回复或表达兴趣后确认具体需求。",
    tone: "响应式、专业、聚焦推进。",
    mustInclude: ["感谢客户回复", "针对性需求确认问题", "明确下一步"],
    mustAvoid: ["推荐无关产品", "过早报价", "不切实际的承诺"],
    structure: "感谢回复 → 需求确认问题 → 总结 → 下一步",
    customInstruction: "",
    isActive: true
  },
  QUOTATION: {
    goal: "在客户表达采购意向后发送正式报价。",
    tone: "专业、清晰、商业精准。",
    mustInclude: ["报价摘要", "价格条件说明", "假设与备注", "下一步"],
    mustAvoid: ["虚构价格/MOQ/交期", "虚构付款条款", "虚构运费"],
    structure: "简短开场 → 报价摘要 → 条件说明 → 下一步",
    customInstruction: "",
    isActive: true
  },
  SAMPLE_FOLLOW_UP: {
    goal: "跟进打样进度或样品反馈。",
    tone: "协作、负责、支持性。",
    mustInclude: ["样品状态/进度说明", "下一步确认", "测试反馈邀请"],
    mustAvoid: ["虚构物流单号", "虚构测试结果", "虚构交付日期"],
    structure: "样品状态 → 关键信息 → 问题/反馈 → 下一步",
    customInstruction: "",
    isActive: true
  },
  TRADE_SHOW_INVITATION: {
    goal: "展会邀约或展会后跟进。",
    tone: "热情、专业、有针对性。",
    mustInclude: ["展会名称/时间/地点（如有）", "可展示的产品/能力", "见面或后续步骤"],
    mustAvoid: ["虚构展会细节", "虚构展位号", "虚构会议记录"],
    structure: "展会信息 → 相关产品/能力 → 邀约/感谢 → 下一步",
    customInstruction: "",
    isActive: true
  },
  NEW_PRODUCT_LAUNCH: {
    goal: "向新老客户推荐新品。",
    tone: "商业有用、精准推荐、不像群发通讯。",
    mustInclude: ["新品简介", "与客户市场的匹配分析", "样品或目录邀请"],
    mustAvoid: ["虚构规格", "虚构认证", "虚构定价", "通用营销语言"],
    structure: "新品亮点 → 客户匹配 → 商业价值 → 下一步",
    customInstruction: "",
    isActive: true
  },
  REORDER_REACTIVATION: {
    goal: "重新激活老客户或推动复购。",
    tone: "熟悉、专业、高效、非通用问候。",
    mustInclude: ["提及历史合作/采购（如有上下文）", "重开对话的商业理由", "一个实际下一步"],
    mustAvoid: ["虚构历史订单", "虚构季节性需求", "空洞问候语"],
    structure: "老客户问好 → 重开价值点 → 具体建议 → 下一步",
    customInstruction: "",
    isActive: true
  }
};

const BONUS_WEIGHT_KEYS = [
  "productLineFit",
  "marketFit",
  "priceBandFit",
  "brandMaturity",
  "websiteCompleteness",
  "contactQuality",
  "cooperationOpportunity"
] as const;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionService: PermissionService
  ) {}

  users(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        title: true,
        teamId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
        userRoles: { include: { role: { select: { id: true, code: true, name: true, dataScope: true } } } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  roles(user: RequestUser) {
    return this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { code: "asc" }
    });
  }

  teams(user: RequestUser) {
    return this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  auditLogs(user: RequestUser) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: user.organizationId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  }

  async customerSources(user: RequestUser) {
    await this.ensureDefaultCustomerDictionaries(user.organizationId);
    return this.prisma.customerSource.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createCustomerSource(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerSource.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateCustomerSource(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerSource.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer source not found");
    return this.prisma.customerSource.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive
      }
    });
  }

  async customerTypes(user: RequestUser) {
    await this.ensureDefaultCustomerDictionaries(user.organizationId);
    return this.prisma.customerType.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" }
    });
  }

  createCustomerType(user: RequestUser, dto: CreateCustomerDictionaryDto) {
    return this.prisma.customerType.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name.trim(),
        description: dto.description
      }
    });
  }

  async updateCustomerType(user: RequestUser, id: string, dto: UpdateCustomerDictionaryDto) {
    const existing = await this.prisma.customerType.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Customer type not found");
    return this.prisma.customerType.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        description: dto.description,
        isActive: dto.isActive
      }
    });
  }

  async createUser(user: RequestUser, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("User email already exists");

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: user.organizationId,
          teamId: dto.teamId,
          email: dto.email,
          name: dto.name,
          title: dto.title,
          passwordHash: await bcrypt.hash(dto.password, 10)
        }
      });
      await this.replaceUserRoles(tx, user.organizationId, created.id, dto.roleCodes ?? ["SALES_REP"]);
      return created;
    });
  }

  async updateUser(user: RequestUser, id: string, dto: UpdateUserDto) {
    const existing = await this.ensureUser(user, id);

    const wasActive = existing.isActive;
    const wasTeamId = existing.teamId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          name: dto.name,
          teamId: dto.teamId,
          title: dto.title,
          isActive: dto.isActive
        }
      });
      if (dto.roleCodes) {
        await this.replaceUserRoles(tx, user.organizationId, id, dto.roleCodes);
      }
      return result;
    });

    // Emit events after successful DB transaction — must fail closed for security
    if (dto.isActive === false && wasActive) {
      try {
        await this.eventEmitter.emitAsync("auth.user.disabled", { userId: id });
      } catch (err) {
        this.logger.error("Failed to revoke disabled user sessions", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("User disabled but session revoke failed, please retry");
      }
    }
    if (dto.roleCodes) {
      try {
        await this.eventEmitter.emitAsync("auth.user.roles_changed", { userId: id });
      } catch (err) {
        this.logger.error("Failed to bump permission version for role change", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("Roles changed but live session invalidation failed, please retry");
      }
    }
    if (dto.teamId !== undefined && dto.teamId !== wasTeamId) {
      try {
        await this.eventEmitter.emitAsync("auth.user.roles_changed", { userId: id });
      } catch (err) {
        this.logger.error("Failed to bump permission version for team change", err instanceof Error ? err.stack : String(err));
        throw new ServiceUnavailableException("Team changed but live session invalidation failed, please retry");
      }
    }

    return updated;
  }

  blacklistRules(user: RequestUser) {
    return this.prisma.blacklistRule.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: "desc" }
    });
  }

  createBlacklistRule(user: RequestUser, dto: CreateBlacklistRuleDto) {
    return this.prisma.blacklistRule.create({
      data: {
        organizationId: user.organizationId,
        type: dto.type as never,
        value: normalizeBlacklistValue(dto.type, dto.value),
        reason: dto.reason,
        createdById: user.id
      }
    });
  }

  async updateBlacklistRule(user: RequestUser, id: string, dto: UpdateBlacklistRuleDto) {
    const existing = await this.prisma.blacklistRule.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("Blacklist rule not found");
    return this.prisma.blacklistRule.update({
      where: { id },
      data: { reason: dto.reason, isActive: dto.isActive }
    });
  }

  async getOemScoringWeights(user: RequestUser): Promise<OemScoringWeights> {
    const config = await this.prisma.oemScoringConfig.findUnique({
      where: { organizationId: user.organizationId }
    });
    if (!config) return { ...DEFAULT_OEM_SCORING_WEIGHTS };
    return mergeWithDefaults(config.weights as Partial<OemScoringWeights>);
  }

  async updateOemScoringWeights(user: RequestUser, dto: UpdateOemScoringWeightsDto): Promise<OemScoringWeights> {
    if (!hasPermission(user, "settings.scoring_weights.manage")) {
      throw new ForbiddenException("You do not have permission to modify scoring weights");
    }

    const bonusSum = BONUS_WEIGHT_KEYS.reduce((sum, key) => sum + dto[key], 0);
    if (bonusSum !== 100) {
      throw new ForbiddenException("Bonus item weights must sum to 100");
    }

    const oldConfig = await this.prisma.oemScoringConfig.findUnique({
      where: { organizationId: user.organizationId }
    });
    const oldWeights = oldConfig ? mergeWithDefaults(oldConfig.weights as Partial<OemScoringWeights>) : { ...DEFAULT_OEM_SCORING_WEIGHTS };

    const newWeights: OemScoringWeights = {
      productLineFit: dto.productLineFit,
      marketFit: dto.marketFit,
      priceBandFit: dto.priceBandFit,
      brandMaturity: dto.brandMaturity,
      websiteCompleteness: dto.websiteCompleteness,
      contactQuality: dto.contactQuality,
      cooperationOpportunity: dto.cooperationOpportunity,
      riskPenaltyMax: dto.riskPenaltyMax
    };

    const config = await this.prisma.oemScoringConfig.upsert({
      where: { organizationId: user.organizationId },
      update: { weights: newWeights as never },
      create: {
        organizationId: user.organizationId,
        weights: newWeights as never
      }
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "UPDATE",
        entityType: "OEM_SCORING_CONFIG",
        entityId: config.id,
        before: oldWeights as never,
        after: newWeights as never
      }
    });

    return newWeights;
  }

  // ── Email Prompt Config ──

  async getEmailPromptConfigs(user: RequestUser): Promise<Record<string, EmailPromptConfigData>> {
    const rows = await this.prisma.emailPromptConfig.findMany({
      where: { organizationId: user.organizationId }
    });
    const rowByPurpose = new Map(rows.map((row) => [row.purpose, row]));
    const result: Record<string, EmailPromptConfigData> = {};
    for (const purpose of EMAIL_DRAFT_PURPOSES) {
      const row = rowByPurpose.get(purpose);
      result[purpose] = row ? mergeEmailPromptDefaults(row as EmailPromptConfigRow) : { ...DEFAULT_EMAIL_PROMPT_CONFIGS[purpose] };
    }
    return result;
  }

  async updateEmailPromptConfig(user: RequestUser, purpose: string, dto: UpdateEmailPromptConfigDto): Promise<EmailPromptConfigData> {
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

  async resetEmailPromptConfig(user: RequestUser, purpose: string): Promise<EmailPromptConfigData> {
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

  async previewEmailPrompt(user: RequestUser, purpose: string, override?: UpdateEmailPromptConfigDto): Promise<EmailPromptPreviewResult> {
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

  // ── Permissions ──

  permissions(user: RequestUser) {
    return this.prisma.permission.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ module: "asc" }, { code: "asc" }]
    });
  }

  async updateRolePermissions(user: RequestUser, roleId: string, dto: { permissionCodes: string[] }) {
    if (!hasPermission(user, "settings.roles.manage")) {
      throw new ForbiddenException("You do not have permission to modify role permissions");
    }

    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId: user.organizationId },
      include: { rolePermissions: { include: { permission: true } } }
    });
    if (!role) throw new NotFoundException("Role not found");

    // Prevent admin from locking themselves out
    if (role.code === "ADMIN" && dto.permissionCodes.length === 0) {
      throw new ForbiddenException("Cannot remove all permissions from ADMIN role");
    }

    // Resolve all requested permissions + dependency expansion
    const allPerms = await this.prisma.permission.findMany({
      where: { organizationId: user.organizationId }
    });
    const permByCode = new Map(allPerms.map((p) => [p.code, p]));

    // Recursively expand all transitive dependencies (BFS with cycle protection)
    const expandedCodes = new Set<string>();
    const queue = [...dto.permissionCodes];
    while (queue.length > 0) {
      const code = queue.shift()!;
      if (expandedCodes.has(code)) continue;

      const permission = permByCode.get(code);
      if (!permission) {
        throw new NotFoundException(`Unknown permission: ${code}`);
      }

      expandedCodes.add(code);

      for (const dep of toStringArray(permission.dependsOn)) {
        if (!permByCode.has(dep)) {
          throw new NotFoundException(`Permission "${code}" depends on unknown permission "${dep}"`);
        }
        if (!expandedCodes.has(dep)) queue.push(dep);
      }
    }

    const expandedPermIds = [...expandedCodes]
      .map((code) => permByCode.get(code)?.id)
      .filter((id): id is string => Boolean(id));

    const oldCodes = role.rolePermissions.map((rp) => rp.permission.code).sort();

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (expandedPermIds.length > 0) {
        await tx.rolePermission.createMany({
          data: expandedPermIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true
        });
      }
    });

    const newCodes = [...expandedCodes].sort();

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "UPDATE",
        entityType: "ROLE_PERMISSIONS",
        entityId: roleId,
        before: { roleCode: role.code, permissions: oldCodes } as never,
        after: { roleCode: role.code, permissions: newCodes } as never
      }
    });

    // Invalidate affected user sessions via event — must fail closed
    try {
      await this.emitPermissionChanged(user.organizationId, roleId, role.code);
    } catch (err) {
      this.logger.error("Failed to apply permission version bump", err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException("Permissions changed but live session invalidation failed, please retry");
    }

    return { roleCode: role.code, permissionCodes: newCodes, expandedFrom: dto.permissionCodes };
  }

  private async emitPermissionChanged(organizationId: string, roleId: string, roleCode: string) {
    // Direct users: those who have this role assigned
    const directUsers = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true }
    });
    const affectedDirectUserIds = directUsers.map((ur) => ur.userId);

    // Inherited users: parent roles that include this role as child
    const parentRoleCodes = this.permissionService.getParentRoleCodes(roleCode);
    let affectedInheritedUserIds: string[] = [];
    if (parentRoleCodes.length > 0) {
      const parentRoles = await this.prisma.role.findMany({
        where: { organizationId, code: { in: parentRoleCodes } },
        select: { id: true }
      });
      const parentRoleIds = parentRoles.map((r) => r.id);
      if (parentRoleIds.length > 0) {
        const inheritedUsers = await this.prisma.userRole.findMany({
          where: { roleId: { in: parentRoleIds } },
          select: { userId: true }
        });
        affectedInheritedUserIds = [...new Set(inheritedUsers.map((ur) => ur.userId))];
      }
    }

    if (affectedDirectUserIds.length > 0 || affectedInheritedUserIds.length > 0) {
      await this.eventEmitter.emitAsync("auth.permission.changed", {
        affectedDirectUserIds,
        affectedInheritedUserIds
      });
    }
  }

  async readOrgPromptConfig(organizationId: string, purpose?: string | null): Promise<EmailPromptConfigData | null> {
    const normalizedPurpose = normalizeEmailDraftPurpose(purpose);
    const row = await this.prisma.emailPromptConfig.findUnique({
      where: { organizationId_purpose: { organizationId, purpose: normalizedPurpose } }
    });
    if (!row) return null;
    return mergeEmailPromptDefaults(row);
  }

  private async ensureUser(user: RequestUser, id: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!existing) throw new NotFoundException("User not found");
    return existing;
  }

  private async replaceUserRoles(tx: Prisma.TransactionClient, organizationId: string, userId: string, roleCodes: string[]) {
    const roles = await tx.role.findMany({ where: { organizationId, code: { in: roleCodes } } });
    await tx.userRole.deleteMany({ where: { userId } });
    if (!roles.length) return;
    await tx.userRole.createMany({
      data: roles.map((role) => ({ userId, roleId: role.id })),
      skipDuplicates: true
    });
  }

  private async ensureDefaultCustomerDictionaries(organizationId: string) {
    await Promise.all([
      ...DEFAULT_CUSTOMER_SOURCES.map(([name, description]) =>
        this.prisma.customerSource.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description },
          create: { organizationId, name, description }
        })
      ),
      ...DEFAULT_CUSTOMER_TYPES.map(([name, description]) =>
        this.prisma.customerType.upsert({
          where: { organizationId_name: { organizationId, name } },
          update: { description },
          create: { organizationId, name, description }
        })
      )
    ]);
  }
}

export function mergeWithDefaults(partial: Partial<OemScoringWeights>): OemScoringWeights {
  return {
    productLineFit: safeInt(partial.productLineFit, DEFAULT_OEM_SCORING_WEIGHTS.productLineFit),
    marketFit: safeInt(partial.marketFit, DEFAULT_OEM_SCORING_WEIGHTS.marketFit),
    priceBandFit: safeInt(partial.priceBandFit, DEFAULT_OEM_SCORING_WEIGHTS.priceBandFit),
    brandMaturity: safeInt(partial.brandMaturity, DEFAULT_OEM_SCORING_WEIGHTS.brandMaturity),
    websiteCompleteness: safeInt(partial.websiteCompleteness, DEFAULT_OEM_SCORING_WEIGHTS.websiteCompleteness),
    contactQuality: safeInt(partial.contactQuality, DEFAULT_OEM_SCORING_WEIGHTS.contactQuality),
    cooperationOpportunity: safeInt(partial.cooperationOpportunity, DEFAULT_OEM_SCORING_WEIGHTS.cooperationOpportunity),
    riskPenaltyMax: safeInt(partial.riskPenaltyMax, DEFAULT_OEM_SCORING_WEIGHTS.riskPenaltyMax)
  };
}

export function safeInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) ? value : fallback;
}

function normalizeBlacklistValue(type: string, value: string) {
  const trimmed = value.trim();
  if (type === "EMAIL" || type === "DOMAIN" || type === "COMPANY_NAME") return trimmed.toLowerCase();
  return trimmed;
}

// ── Email Prompt helpers ──

type EmailPromptConfigRow = {
  goal: unknown;
  tone: unknown;
  mustInclude: unknown;
  mustAvoid: unknown;
  structure: unknown;
  customInstruction: unknown;
  isActive: unknown;
};

function mergeEmailPromptDefaults(row: EmailPromptConfigRow): EmailPromptConfigData {
  return {
    goal: typeof row.goal === "string" ? row.goal : "",
    tone: typeof row.tone === "string" ? row.tone : "",
    mustInclude: Array.isArray(row.mustInclude) ? row.mustInclude.filter((v): v is string => typeof v === "string") : [],
    mustAvoid: Array.isArray(row.mustAvoid) ? row.mustAvoid.filter((v): v is string => typeof v === "string") : [],
    structure: typeof row.structure === "string" ? row.structure : "",
    customInstruction: typeof row.customInstruction === "string" ? row.customInstruction : "",
    isActive: typeof row.isActive === "boolean" ? row.isActive : true
  };
}

function assembleFinalPrompt(purpose: EmailDraftPurpose, config: EmailPromptConfigData): string {
  const label = EMAIL_DRAFT_PURPOSE_LABELS[purpose] ?? purpose;
  const parts: string[] = [
    `You are writing a ${label} email in English.`,
    "Keep it specific, concise, non-spammy, and based only on the provided evidence.",
    "Do not invent prices, sample status, exhibition details, order history, shipment tracking, certifications, or previous cooperation unless they are provided in the context or user instructions.",
    "Address the email to the intendedRecipient provided in the context.",
    "Make the next step explicit enough for a salesperson to create or complete a follow-up task."
  ];

  if (config.goal) parts.push(`Email goal: ${config.goal}`);
  if (config.tone) parts.push(`Tone and style: ${config.tone}`);
  if (config.mustInclude.length) parts.push(`Must include: ${config.mustInclude.join("; ")}`);
  if (config.mustAvoid.length) parts.push(`Must avoid: ${config.mustAvoid.join("; ")}`);
  if (config.structure) parts.push(`Recommended structure: ${config.structure}`);
  if (config.customInstruction) parts.push(`Additional instructions: ${config.customInstruction}`);
  if (!config.isActive) parts.push("Note: Custom configuration is disabled. Use the standard default template.");

  return parts.join(" ");
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

const DEFAULT_CUSTOMER_SOURCES = [
  ["手动录入", "Manual customer entry"],
  ["线下", "Offline lead or existing offline customer"],
  ["Google搜索", "Customers found through Google search"],
  ["LinkedIn", "Customers found through LinkedIn"],
  ["展会", "Trade show leads"],
  ["阿里国际站", "Alibaba international leads"],
  ["老客推荐", "Customer referral"],
  ["行业名录", "Industry directory"]
] as const;

const DEFAULT_CUSTOMER_TYPES = [
  ["品牌商", "Brand owner"],
  ["最终客户", "End customer"],
  ["代理商", "Agent or buying representative"],
  ["批发商", "Wholesaler"],
  ["分销商", "Distributor"],
  ["零售商", "Retailer"],
  ["跨境电商", "Cross-border ecommerce"],
  ["采购商", "Procurement buyer"],
  ["OEM/ODM Target", "General OEM/ODM target"]
] as const;
