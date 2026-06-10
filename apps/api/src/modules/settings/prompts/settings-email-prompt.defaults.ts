import type { EmailDraftPurpose } from "@oem-crm/shared";
import type { EmailPromptConfigData } from "./settings-email-prompt.types";

/** Default email prompt settings used before an organization customizes them. */
export const DEFAULT_EMAIL_PROMPT_CONFIGS: Record<EmailDraftPurpose, EmailPromptConfigData> = {
  FIRST_OUTREACH: {
    goal: "撰写首封 OEM/ODM 开发信，首次触达未接触过的目标客户。",
    tone: "专业、简洁、热情、非推销感。",
    mustInclude: ["客户产品线或官网分析关联点", "我方 OEM/ODM 能力简述", "一个明确的合作角度", "轻量回复邀请"],
    mustAvoid: ["虚构价格", "虚构认证", "虚构合作历史", "编造展会信息", "过度推销"],
    structure: "称呼 -> 关联理由 -> 能力介绍 -> 合作建议 -> 轻量 CTA",
    customInstruction: "",
    isActive: true
  },
  NO_REPLY_FOLLOW_UP: {
    goal: "对首封开发信未回复的客户进行礼貌跟进。",
    tone: "礼貌、不催促、不自动化感、比首封更简短。",
    mustInclude: ["提及上一封邮件内容", "一条新的价值点", "轻量回复引导"],
    mustAvoid: ["催促语气", "不耐烦表达", "重复首封邮件全部内容"],
    structure: "简短开场 -> 回顾前邮件 -> 补充价值点 -> 轻量 yes/no 问题",
    customInstruction: "",
    isActive: true
  },
  PRODUCT_RECOMMENDATION: {
    goal: "基于客户产品线推荐我方匹配产品。",
    tone: "专业、数据驱动、有帮助。",
    mustInclude: ["客户现有产品线分析", "1-3 个推荐产品及匹配理由", "样品/目录/定制选项邀请"],
    mustAvoid: ["推荐过多产品（超过 5 个）", "虚构产品规格", "虚构价格"],
    structure: "产品匹配分析 -> 推荐产品及理由 -> 合作价值 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  REQUIREMENT_CONFIRMATION: {
    goal: "在客户回复或表达兴趣后确认具体需求。",
    tone: "响应式、专业、聚焦推进。",
    mustInclude: ["感谢客户回复", "针对性需求确认问题", "明确下一步"],
    mustAvoid: ["推荐无关产品", "过早报价", "不切实际的承诺"],
    structure: "感谢回复 -> 需求确认问题 -> 总结 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  QUOTATION: {
    goal: "在客户表达采购意向后发送正式报价。",
    tone: "专业、清晰、商业精确。",
    mustInclude: ["报价摘要", "价格条件说明", "假设与备注", "下一步"],
    mustAvoid: ["虚构价格/MOQ/交期", "虚构付款条款", "虚构运费"],
    structure: "简短开场 -> 报价摘要 -> 条件说明 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  SAMPLE_FOLLOW_UP: {
    goal: "跟进打样进度或样品反馈。",
    tone: "协作、负责、支持性。",
    mustInclude: ["样品状态或进度说明", "下一步确认", "测试反馈邀请"],
    mustAvoid: ["虚构物流单号", "虚构测试结果", "虚构交付日期"],
    structure: "样品状态 -> 关键信息 -> 问题/反馈 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  TRADE_SHOW_INVITATION: {
    goal: "展会邀约或展会后跟进。",
    tone: "热情、专业、有针对性。",
    mustInclude: ["展会名称/时间/地点（如有）", "可展示的产品/能力", "见面或后续步骤"],
    mustAvoid: ["虚构展会细节", "虚构展位号", "虚构会议记录"],
    structure: "展会信息 -> 相关产品/能力 -> 邀约/感谢 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  NEW_PRODUCT_LAUNCH: {
    goal: "向新老客户推荐新品。",
    tone: "商业有用、精准推荐、不像群发通讯。",
    mustInclude: ["新品简介", "与客户市场的匹配分析", "样品或目录邀请"],
    mustAvoid: ["虚构规格", "虚构认证", "虚构定价", "通用营销语言"],
    structure: "新品亮点 -> 客户匹配 -> 商业价值 -> 下一步",
    customInstruction: "",
    isActive: true
  },
  REORDER_REACTIVATION: {
    goal: "重新激活老客户或推动复购。",
    tone: "熟悉、专业、高效、非通用问候。",
    mustInclude: ["提及历史合作/采购（如有上下文）", "重开对话的商业理由", "一个实际下一步"],
    mustAvoid: ["虚构历史订单", "虚构季节性需求", "空洞问候语"],
    structure: "老客户问候 -> 重开价值点 -> 具体建议 -> 下一步",
    customInstruction: "",
    isActive: true
  }
};
