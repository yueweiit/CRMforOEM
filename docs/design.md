# OEM Customer Development CRM Design

## 1. 系统整体架构图文字版

```text
用户浏览器
  -> React Web App
    -> API Gateway / NestJS REST API
      -> Auth / RBAC / Data Scope Guard
      -> Customer Domain
      -> Knowledge Base Domain
      -> Website Analysis Domain
      -> Research Report Domain
      -> OEM Scoring Domain
      -> AI Generation Domain
      -> Email Domain
      -> Follow-up Domain
      -> Dashboard Domain
      -> Audit / Log Domain

NestJS REST API
  -> PostgreSQL: 业务主数据、AI 留痕、邮件归档、看板统计
  -> Redis: 缓存、限流、BullMQ 任务队列
  -> Object Storage / Local Storage: 官网图片、附件、证书、样品、邮件附件
  -> Playwright Worker: 官网抓取、页面截图、产品页解析
  -> AI Provider Adapter: 背调报告、官网分析总结、OEM 评分解释、邮件草稿
  -> SMTP Adapter: 仅发送人工审核后的邮件
  -> IMAP Adapter: 同步客户回复、线程归档
  -> Scheduler Worker: 跟进任务、IMAP 同步、发送频率窗口、看板快照
```

核心约束：

- 邮件永远先生成草稿，业务员审核确认后才能发送。
- 所有 AI 内容保存原始输入、AI 原始输出、人工修改版本、最终版本。
- 官网抓取、AI 生成、IMAP 同步、看板快照全部走异步任务。
- 权限由角色权限和客户数据范围共同决定。
- 支持私有化部署，外部依赖通过 adapter 隔离。

## 2. 功能模块清单

| 模块 | 主要能力 |
| --- | --- |
| 认证与用户 | 登录、刷新令牌、用户管理、角色绑定、团队组织 |
| 权限与数据隔离 | RBAC、数据范围、字段级敏感信息保护、操作日志 |
| 客户管理 | 客户录入、来源、类型、阶段、负责人、分配历史、联系人 |
| 黑名单 | 域名、邮箱、公司名、国家或关键词黑名单，发送前强校验 |
| 企业资料库 | 我方公司信息、品牌、OEM 能力、产品资料、证书、成功案例、邮件素材 |
| 官网分析 | Playwright 抓取、语言国家识别、联系方式提取、产品分类、机会缺口 |
| 客户背调 | 结构化报告、风险、品牌成熟度、市场信息、合作建议 |
| OEM 匹配评分 | 产品线匹配、市场匹配、价格带、成熟度、官网完整度、联系人质量、机会、风险 |
| AI 邮件 | 个性化英文开发信、主题、多版本、人工编辑、最终版本留档 |
| 邮箱中心 | SMTP 发送、IMAP 同步、线程归档、附件归档、发送限频 |
| 跟进任务 | 首封后 N 天跟进、回复后需求确认、报价后提醒、样品后提醒、逾期升级 |
| 报价样品订单 | 报价记录、样品记录、谈判阶段、成交转化；样品多轮打样与费用规则见 [样品多轮打样与费用统计方案](样品多轮打样与费用统计方案.md) |
| 看板报表 | 个人漏斗、团队漏斗、回复率、转化率、阶段停留、邮件效果、AI 使用效果 |
| 系统配置 | 邮箱参数、AI 模型、抓取策略、评分权重、发送频率、任务规则 |

## 3. 数据库 ER 设计

```text
Organization 1--N Team 1--N User
User N--N Role N--N Permission
User 1--N EmailAccount

CustomerSource 1--N Customer
CustomerType 1--N Customer
Customer 1--N Contact
Customer 1--N CustomerStageHistory
Customer 1--N AssignmentHistory
Customer 1--N WebsiteAnalysis
Customer 1--N ResearchReport
Customer 1--N OemFitScore
Customer 1--N FollowUpTask
Customer 1--N Quote
Customer 1--N SampleRequest
SampleRequest 1--N SampleRound
SampleRound 1--1 SampleRetentionRecord
SampleRequest 1--N SampleFee
SampleRound 1--N SampleFee(optional round cost)
SampleRound 1--N SampleReturnRecord
Customer 1--N EmailThread

EmailThread 1--N EmailMessage
EmailMessage 1--N EmailAttachment
EmailDraft 1--1 EmailMessage(sent after approval)
EmailDraft N--1 AiGenerationRun

AiGenerationRun 1--N AiContentVersion
WebsiteAnalysis N--1 AiGenerationRun(optional)
ResearchReport N--1 AiGenerationRun(optional)
OemFitScore N--1 AiGenerationRun(optional)

CompanyProfile 1--N Brand
CompanyProfile 1--N OemCapability
CompanyProfile 1--N Product
CompanyProfile 1--N Certificate
CompanyProfile 1--N CaseStudy
CompanyProfile 1--N EmailMaterial

FileAsset 可关联 Product / Certificate / CaseStudy / EmailMessage / WebsiteAnalysis
AuditLog 记录所有关键实体变更
BlacklistRule 被 Customer / EmailDraft / EmailMessage 发送前引用校验
```

关键表：

- `customers`: 公司名、官网、国家、语言、时区、货币、阶段、负责人、来源、类型、风险状态。
- `contacts`: 姓名、职位、邮箱、电话、LinkedIn、质量分、验证状态。
- `website_analyses`: 抓取状态、页面列表、产品分类、数量、价格区间、图片风格、缺失品类、机会点。
- `research_reports`: 公司概览、市场、品牌、产品、渠道、机会、风险、建议动作。
- `oem_fit_scores`: 总分、维度分、权重、解释、版本号。
- `ai_generation_runs`: 任务类型、模型、prompt 版本、原始输入、原始输出、token、耗时、状态。
- `ai_content_versions`: `RAW_AI`、`HUMAN_EDIT`、`FINAL` 三类版本，记录编辑人和编辑原因。
- `email_drafts`: AI 草稿、审核状态、审核人、最终发送内容、禁止自动发送。
- `email_messages`: SMTP/IMAP 归档邮件、方向、Message-ID、In-Reply-To、线程、发送状态。
- `follow_up_tasks`: 类型、触发来源、截止时间、负责人、状态、逾期升级。

## 4. API 接口清单

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /customers`
- `GET /customers/filter-options`
- `POST /customers`
- `GET /customers/:id`
- `PATCH /customers/:id`
- `POST /customers/:id/assign`
- `POST /customers/:id/stage`
- `GET /customers/:id/timeline`
- `POST /customers/:id/contacts`
- `GET /knowledge/company-profile`
- `PATCH /knowledge/company-profile`
- `GET /knowledge/brands`
- `POST /knowledge/brands`
- `GET /knowledge/products`
- `POST /knowledge/products`
- `GET /knowledge/oem-capabilities`
- `POST /knowledge/oem-capabilities`
- `GET /knowledge/certificates`
- `POST /knowledge/certificates`
- `GET /knowledge/case-studies`
- `POST /knowledge/case-studies`
- `GET /knowledge/email-materials`
- `POST /knowledge/email-materials`
- `PATCH /knowledge/:entity/:id`
- `POST /customers/:customerId/website-analyses`
- `GET /customers/:customerId/website-analyses/latest`
- `GET /website-analyses/:id`
- `POST /customers/:customerId/research-reports`
- `GET /customers/:customerId/research-reports/latest`
- `POST /customers/:customerId/oem-fit-scores`
- `GET /customers/:customerId/oem-fit-scores/latest`
- `GET /ai-generation-runs/:id`
- `GET /ai-generation-runs/:id/versions`
- `POST /ai-generation-runs/:id/versions`
- `POST /ai-generation-runs/:id/finalize`
- `GET /email-accounts`
- `POST /email-accounts`
- `PATCH /email-accounts/:id`
- `POST /email-accounts/:id/test`
- `POST /customers/:customerId/email-drafts/generate`
- `GET /email-drafts/:id`
- `GET /email-drafts`
- `GET /customers/:customerId/email-drafts`
- `PATCH /email-drafts/:id`
- `POST /email-drafts/:id/submit-review`
- `POST /email-drafts/:id/approve`
- `POST /email-drafts/:id/send`
- `GET /customers/:customerId/email-threads`
- `GET /email-threads`
- `GET /email-threads/:id/messages`
- `POST /email-sync/run`
- `GET /follow-up-tasks/overdue-count`
- `GET /follow-up-tasks`
- `POST /follow-up-tasks`
- `PATCH /follow-up-tasks/:id`
- `POST /follow-up-tasks/:id/complete`
- `GET /quotes`
- `POST /quotes`
- `GET /samples`
- `POST /samples`
- `GET /dashboards/me`
- `GET /dashboards/team`
- `GET /dashboards/management`
- `GET /dashboards/filter-options`
- `GET /settings/users`
- `POST /settings/users`
- `PATCH /settings/users/:id`
- `GET /settings/roles`
- `GET /settings/teams`
- `GET /settings/audit-logs`
- `GET /settings/customer-sources`
- `POST /settings/customer-sources`
- `PATCH /settings/customer-sources/:id`
- `GET /settings/customer-types`
- `POST /settings/customer-types`
- `PATCH /settings/customer-types/:id`
- `GET /blacklist-rules`
- `POST /blacklist-rules`
- `PATCH /blacklist-rules/:id`
- `GET /customers/filter-options`
- `GET /dashboards/filter-options`
- `GET /knowledge/brands`
- `POST /knowledge/brands`
- `PATCH /knowledge/:entity/:id`
- `GET /email-drafts`
- `GET /customers/:customerId/email-drafts`
- `GET /email-threads`
- `GET /follow-up-tasks/overdue-count`
- `GET /settings/teams`
- `GET /settings/customer-sources`
- `POST /settings/customer-sources`
- `PATCH /settings/customer-sources/:id`
- `GET /settings/customer-types`
- `POST /settings/customer-types`
- `PATCH /settings/customer-types/:id`
- `/settings/users`
- `/settings/roles`
- `/settings/audit-logs`
- `/login`
- `/dashboard`
- `/customers`
- `/customers/new`
- `/customers/:id/:tab?`
- `/email-center/:folder?`
- `/follow-ups`
- `/knowledge/:section?`
- `/reports/:scope?`
- `/settings/:section?`
- `/customers/:id/overview`
- `/customers/:id/website-analysis`
- `/customers/:id/research`
- `/customers/:id/oem-score`
- `/customers/:id/email`
- `/customers/:id/follow-ups`
- `/customers/:id/quotes`
- `/customers/:id/samples`
- `/email-center/accounts`
- `/email-center/drafts`
- `/email-center/threads`
- `/email-center/inbox`
- `/knowledge/company`
- `/knowledge/brands`
- `/knowledge/products`
- `/knowledge/oem-capabilities`
- `/knowledge/certificates`
- `/knowledge/cases`
- `/knowledge/email-materials`
- `/settings/users`
- `/settings/roles`
- `/settings/customer-dictionaries`
- `/settings/email-accounts`
- `/settings/ai`
- `/settings/scoring`
- `/settings/blacklist`
- `/settings/audit-logs`
- `/settings/logout`
- `/customers/:id/overview`
- `/customers/:id/research`
- `/customers/:id/email`
- `/customers/:id/follow-ups`
- `/customers/:id/:tab?`
- `/dashboard`
- `/reports/team`
- `/reports/management`
- `/email-center/threads`
- `/knowledge/brands`
---
## 6. 开发里程碑

| 阶段 | 目标 | 交付 |
| --- | --- | --- |
| M1 基础底座 | 项目结构、数据库、RBAC、审计、客户主数据 | 可登录、可录入客户、可分配和变更阶段 |
| M2 企业资料库 | 我方能力、产品、证书、案例、邮件素材 | 运营可维护资料库，AI 可引用结构化素材 |
| M3 官网分析 | Playwright 抓取、联系方式识别、产品分析 | 客户官网分析报告和原始证据归档 |
| M4 背调与评分 | AI 背调报告、OEM 评分、权重配置 | 自动生成报告和评分，可人工确认 |
| M5 邮件闭环 | AI 邮件草稿、人工审核、SMTP 发送、IMAP 归档 | 不自动群发，回复自动入客户时间线 |
| M6 跟进与转化 | 自动任务、报价、样品、订单谈判流程 | 防遗漏跟进和阶段驱动销售动作 |
| M7 看板报表 | 个人、团队、管理层统计口径 | 漏斗、回复率、转化率、阶段停留、邮件效果 |
| M8 私有化部署 | 安全配置、备份、监控、部署文档 | Docker Compose / 单机部署包 |

## 核心业务逻辑

### 客户背调报告生成

输入：

- 客户主数据：公司名、官网、国家、语言、负责人、联系人。
- 官网分析结果：页面、分类、产品、价格、图片、联系方式、机会缺口。
- 我方资料：OEM 能力、产品、证书、案例、邮件素材。
- 历史互动：邮件、任务、报价、样品、备注。

输出结构：

- 公司概览、国家和市场判断、品牌成熟度、产品线摘要、渠道线索、采购可能性。
- 与我方 OEM 能力的关联点。
- 风险因素：信息缺失、邮箱无效、品牌不匹配、低价冲突、黑名单命中。
- 推荐动作：首封邮件角度、建议产品、建议联系人、跟进节奏。

留痕：

- `ai_generation_runs.raw_input` 保存完整输入。
- `ai_generation_runs.raw_output` 保存 AI 原文。
- `ai_content_versions` 保存 AI 原稿、人工修改、最终版本。

### 官网产品分析逻辑

1. 规范化官网 URL，校验黑名单和重复客户。
2. Playwright 打开首页，记录标题、语言、meta、截图、主导航链接。
3. 提取联系方式：邮箱、电话、表单页、社媒、LinkedIn、地址。
4. 识别产品入口：URL 语义、导航文本、schema.org、面包屑、图片 alt。
5. 抓取产品页或分类页，限制深度、域名和页面数量。
6. 解析产品分类、SKU 数量、描述关键词、材质、规格、价格区间、图片风格。
7. 与我方产品和 OEM 能力做差异匹配，输出缺失品类和合作机会。
8. 保存原始页面证据、截图、结构化结果和 AI 总结。

### OEM 匹配评分算法

默认满分 100：

- 产品线匹配 25：客户品类与我方产品/OEM 能力重合度。
- 市场匹配 15：目标国家、语言、渠道、认证需求与我方经验匹配。
- 价格带匹配 10：客户价格区间与我方可供价格带匹配。
- 品牌成熟度 10：官网完整度、SKU 丰富度、品牌叙事、渠道痕迹。
- 官网完整度 10：联系方式、产品信息、公司信息、更新痕迹。
- 联系人质量 10：职位、邮箱有效性、决策相关性、社媒可信度。
- 合作机会 15：缺失品类、补充 SKU、定制包装、认证、交期优势。
- 风险扣分 5：黑名单、邮箱异常、国家风险、低匹配、信息虚假。

评分公式：

```text
score = sum(dimension_score * configured_weight) - risk_penalty
score = clamp(score, 0, 100)
```

评分等级：

- `A`: 80-100，优先开发。
- `B`: 65-79，可开发。
- `C`: 50-64，低优先级。
- `D`: 0-49，暂缓或无效。

### AI 邮件生成逻辑

1. 业务员选择客户和邮件目的：首封、二次跟进、回复后、报价跟进、样品跟进。
2. 系统读取客户背调、官网分析、OEM 评分、联系人、我方产品和案例。
3. 生成英文邮件主题和正文，要求短、具体、非群发口吻。
4. 保存 AI 原始草稿为 `RAW_AI` 版本。
5. 业务员在编辑器中修改，保存 `HUMAN_EDIT` 版本。
6. 提交审核，主管或有权限人员批准。
7. 发送前强制校验：审核状态、黑名单、发送频率、联系人邮箱、退订/禁发标记。
8. 发送成功后归档为 `EmailMessage` 并生成后续任务。

### 邮箱收发和归档逻辑

- SMTP 密码加密存储，使用应用层 KMS/密钥配置。
- SMTP 只允许发送已批准草稿，不提供群发接口。
- 每个邮箱有小时和日发送上限，Redis 计数。
- IMAP 定时同步收件箱和已发送邮件，通过 `Message-ID`、`In-Reply-To`、`References` 归档到线程。
- 无法匹配线程时按发件人域名、联系人邮箱、客户域名做二次匹配。
- 客户回复后自动阶段推进到 `客户已回复`，生成“需求确认”任务。

### 跟进任务自动生成规则

| 触发事件 | 自动任务 |
| --- | --- |
| 客户创建 | 24 小时内完成背调 |
| 背调完成且评分 A/B | 1 个工作日内生成开发邮件 |
| 邮件草稿生成 | 当日审核并发送 |
| 首封邮件发送 | 3 个工作日未回复则二次跟进 |
| 二次跟进发送 | 5 个工作日未回复则三次跟进或暂缓 |
| 客户回复 | 24 小时内完成需求确认 |
| 报价发送 | 2 个工作日后跟进报价反馈 |
| 样品寄出 | 物流签收后 3 个工作日跟进测试反馈 |
| 阶段停留超阈值 | 提醒负责人，必要时升级主管 |

### 数据看板统计口径

- 新增客户数：按创建时间统计，排除黑名单。
- 已背调客户数：存在最终版背调报告。
- 邮件生成数：AI 邮件草稿生成次数。
- 邮件发送数：SMTP 成功发送数量。
- 回复数：IMAP 收到客户方向回复并匹配客户。
- 回复率：回复客户数 / 已发送首封邮件客户数。
- 有效需求数：阶段进入 `需求确认中` 及之后。
- 报价转化率：进入报价客户数 / 有效需求客户数。
- 成交转化率：已成交客户数 / 已发送首封邮件客户数。
- 阶段停留时长：阶段历史表相邻记录时间差。
- 逾期任务数：截止时间小于当前时间且未完成。
- AI 采纳率：最终版本与 AI 原稿相似度高于配置阈值的数量 / AI 生成数量。
