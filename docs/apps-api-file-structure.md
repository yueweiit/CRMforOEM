# apps/api 文件结构说明文档

> 生成日期: 2026-06-24 | 基于 `sen-dev` 分支

---

## 目录概览

```
apps/api/src/
├── app.module.ts              # 根模块
├── main.ts                    # 启动入口
├── common/                    # 跨模块共享（认证/守卫/装饰器/工具）
│   ├── auth/                  # 认证装饰器与类型
│   ├── dto/                   # 通用 DTO 转换
│   ├── events/                # SSE 事件类型
│   ├── guards/                # 全局守卫
│   └── query/                 # 数据权限工具
├── config/                    # 环境变量校验
├── infrastructure/            # 基础设施层
│   ├── prisma/                # ORM 数据库
│   ├── redis/                 # Redis 连接
│   └── sse/                   # 服务端推送
└── modules/                   # 业务模块 (15个)
    ├── ai/                    # AI 生成管理
    ├── auth/                  # 用户认证
    ├── background-tasks/      # 后台任务调度
    ├── commercial/            # 报价与样品
    ├── customers/             # 客户管理
    ├── dashboards/            # 数据仪表盘
    ├── emails/                # 邮件系统（最大模块）
    ├── follow-ups/            # 跟进任务
    ├── knowledge/             # 企业知识库
    ├── research/              # AI 背调报告
    ├── scoring/               # OEM 适配评分
    ├── settings/              # 系统设置
    ├── upload/                # 文件上传
    └── website-analysis/      # 网站分析爬虫
```

---

## 一、根目录

### app.module.ts
- **功能**: 应用程序根模块，组装所有功能模块和基础设施模块，注册全局 Guard 链。
- **类型**: `@Module`
- **导入的模块**: ConfigModule、BullModule、EventEmitterModule、PrismaModule、RedisModule、SseModule 及全部 15 个业务模块
- **全局 Guard 注册**（按执行顺序）:
  1. `JwtAuthGuard` — 验证 Bearer token
  2. `LiveSessionGuard` — 校验会话有效性
  3. `PermissionsGuard` — 校验细粒度权限

### main.ts
- **功能**: 应用启动入口。验证环境变量 → 创建 NestJS 实例 → 配置 CORS、全局路由前缀 `/api`、全局验证管道（whitelist/transform/forbidNonWhitelisted）→ 挂载 Swagger 文档 `/api/docs` → 启动 HTTP 服务器。
- **类型**: 启动函数 `bootstrap(): Promise<void>`

---

## 二、common/ — 跨模块共享

### common/auth/ — 认证装饰器与类型

#### current-user.decorator.ts
- **功能**: 定义 `RequestUser` 类型和 `@CurrentUser()` 参数装饰器，从 HTTP 请求中提取当前登录用户信息。
- **类型**: 参数装饰器 + 类型定义
- **导出**: `RequestUser`（含 id/organizationId/teamId/roleCodes/permissions/dataScope/sessionId 等字段）、`CurrentUser`

#### live-session.decorator.ts
- **功能**: 定义 `@RequireLiveSession()` 元数据装饰器，标记需要验证会话有效性的路由。
- **类型**: SetMetadata 装饰器
- **导出**: `RequireLiveSession()`

#### permission.utils.ts
- **功能**: 权限检查工具函数。
- **类型**: 纯函数
- **方法**:
  - `hasPermission(user, permissionCode): boolean` — 检查用户是否拥有某权限
  - `hasAnyPermission(user, ...permissionCodes): boolean` — 检查是否拥有任一个权限

#### permissions.decorator.ts
- **功能**: 定义权限控制装饰器 `@RequirePermissions()`（需全部满足）和 `@RequireAnyPermissions()`（满足其一）。
- **类型**: SetMetadata 装饰器
- **导出**: `RequirePermissions(...permissions)`, `RequireAnyPermissions(...permissions)`

#### public.decorator.ts
- **功能**: 定义 `@Public()` 装饰器，标记路由为公开访问（跳过 JWT 认证）。
- **类型**: SetMetadata 装饰器

#### roles.decorator.ts
- **功能**: 定义 `@RequireRoles(...roles)` 装饰器，用于角色级别访问控制。
- **类型**: SetMetadata 装饰器

### common/dto/

#### transforms.ts
- **功能**: 提供 `trimBlankToUndefined` 转换函数，将空白字符串转为 `undefined`（用于 DTO 验证前处理空输入）。
- **类型**: 工具函数

### common/events/

#### event-types.ts
- **功能**: 定义 SSE 事件名常量及对应 payload 接口。
- **类型**: 常量 + 接口定义
- **事件**: `inbound-mail.received`、`follow-up.task.created/completed/cancelled`

### common/guards/ — 守卫

#### jwt-auth.guard.ts
- **功能**: JWT 认证守卫，验证 Bearer token 有效性，将用户信息注入 `request.user`（reject refresh token 用于 API 调用）。`@Public()` 路由跳过。
- **类型**: `@Injectable()` Guard
- **依赖**: `JwtService`, `ConfigService`, `Reflector`
- **方法**: `canActivate(context): Promise<boolean>`

#### live-session.guard.ts
- **功能**: 对 `@RequireLiveSession()` 路由验证会话有效性（未被踢下线、权限版本未变更）。
- **类型**: `@Injectable()` Guard
- **依赖**: `Reflector`, `AuthSessionService`

#### permissions.guard.ts
- **功能**: 检查 `@RequirePermissions()` / `@RequireAnyPermissions()` 标记，做细粒度权限校验。
- **类型**: `@Injectable()` Guard
- **依赖**: `Reflector`

#### roles.guard.ts
- **功能**: 检查 `@RequireRoles()` 元数据，校验用户角色。
- **类型**: `@Injectable()` Guard（未注册为全局 Guard，可模块按需使用）

### common/query/

#### data-scope.ts
- **功能**: 根据用户数据范围（SELF/TEAM/ALL）构建 Prisma where 条件，实现行级数据隔离。
- **类型**: 工具函数
- **方法**: `buildCustomerDataScopeWhere(user)` — 返回 Prisma where 对象

---

## 三、config/

#### validate-env.ts
- **功能**: 启动时检查 S3 环境变量（ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY）是否已配置。
- **类型**: 工具函数
- **方法**: `validateEnv(): void`

---

## 四、infrastructure/ — 基础设施层

### infrastructure/prisma/

#### prisma.module.ts
- **功能**: Prisma 全局模块，将 PrismaService 作为全局单例提供。
- **类型**: `@Global()` `@Module`
- **导出**: `PrismaService`

#### prisma.service.ts
- **功能**: 数据库服务，继承 PrismaClient，在模块初始化/销毁时自动连接/断开。
- **类型**: `@Injectable()` Service
- **方法**: `onModuleInit()` — 连接数据库；`onModuleDestroy()` — 断开连接

### infrastructure/redis/

#### redis.module.ts
- **功能**: Redis 全局模块，通过工厂创建 ioredis 客户端，支持重试策略，导出 `REDIS_CLIENT` token。
- **类型**: `@Global()` `@Module`
- **导出 Token**: `REDIS_CLIENT`

### infrastructure/sse/

#### sse.module.ts
- **功能**: SSE 模块，注册 JwtModule、SseController、SseService，导出 SseService。
- **类型**: `@Module`

#### sse.controller.ts
- **功能**: SSE 端点 `GET /events`（`@Public()`），通过 Query `token` 进行 JWT 认证后建立 SSE 连接。
- **类型**: `@Controller()`
- **依赖**: `SseService`, `JwtService`, `ConfigService`

#### sse.service.ts
- **功能**: SSE 核心服务，管理客户端连接池（Map），通过 `@OnEvent` 监听 EventEmitter 事件推送到同组织所有 SSE 客户端。
- **类型**: `@Injectable()` Service
- **方法**: `createConnection(userId, orgId)`、`removeConnection(id)`
- **监听事件**: 入站邮件到达、跟进任务创建/完成/取消

---

## 五、modules/ — 业务模块

### 5.1 modules/ai/ — AI 生成管理

#### ai-generation.service.ts
- **功能**: 管理 AI 生成运行的完整生命周期（创建→运行→成功/失败→版本管理→最终确认）。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`
- **方法**:
  - `createRun(input)` — 创建 QUEUED 状态的 AI 运行记录
  - `markSucceeded(runId, rawOutput, tokenUsage?, latencyMs?)` — 标记 SUCCEEDED
  - `markFailed(runId, errorMessage)` — 标记 FAILED
  - `addRawAiVersion(runId, content, contentJson?)` — 添加 RawAi 版本
  - `getRun(user, id)` — 获取运行详情（含版本列表）
  - `listVersions(user, runId)` — 列出所有版本
  - `addVersion(user, runId, dto)` — 添加人工编辑版本
  - `finalize(user, runId, dto)` — 添加最终审定版本

#### ai-provider.service.ts
- **功能**: 封装 OpenAI 兼容的大语言模型调用，处理超时、错误、多种响应格式兼容；无 API Key 时返回占位响应。
- **类型**: `@Injectable()` Service
- **依赖**: `ConfigService`
- **方法**:
  - `get model()` — 返回当前配置模型名称（默认 gpt-4.1-mini）
  - `complete(input)` — 发送聊天补全请求，返回 AI 文本 + 原始响应 + token 用量

#### ai.controller.ts
- **功能**: AI 生成运行 HTTP API（获取详情、版本管理、最终确认）。
- **类型**: `@Controller("ai-generation-runs")`
- **依赖**: `AiGenerationService`
- **端点**: `GET :id`、`GET :id/versions`、`POST :id/versions`、`POST :id/finalize`

#### ai.module.ts / ai.public.ts
- **功能**: 模块定义和公共导出入口（导出 AiGenerationService、AiProviderService）。

#### dto/add-ai-content-version.dto.ts
- **功能**: 添加 AI 内容版本的请求 DTO（versionType/content/contentJson/editReason）。

---

### 5.2 modules/auth/ — 用户认证

#### auth-session.service.ts
- **功能**: 基于 Redis 管理会话生命周期（创建/验证/刷新/吊销/权限版本控制），监听权限变更/用户禁用/角色变更事件自动更新会话。
- **类型**: `@Injectable()` Service
- **依赖**: `REDIS_CLIENT`, `ConfigService`
- **方法**:
  - `createSession(input)` — 创建 session
  - `validateSession(input)` — 校验 session 有效性
  - `getSession(sessionId)` — 获取 session
  - `touchSession(sessionId)` — 刷新最后活跃时间
  - `revokeSession(sessionId)` — 吊销单 session
  - `revokeUserSessions(userId)` — 吊销用户所有 session
  - `bumpUserPermissionVersion(userId)` — 递增权限版本号
  - `handlePermissionChanged(event)` / `handleUserDisabled(event)` / `handleUserRolesChanged(event)` — 事件监听器

#### auth.service.ts
- **功能**: 核心认证业务：密码登录（bcrypt + JWT 双 token）、refresh token 刷新、登出、查询用户权限。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`, `JwtService`, `ConfigService`, `PermissionService`, `AuthSessionService`
- **方法**: `login(dto)`, `refresh(refreshToken)`, `logout(user)`, `getMePermissions(userId)`

#### auth.controller.ts
- **功能**: 认证 HTTP 端点。
- **类型**: `@Controller("auth")`
- **端点**: `POST login`（公开）、`POST refresh`（公开）、`POST logout`、`GET me/permissions`

#### auth.module.ts
- **功能**: 导入 JwtModule + SettingsModule，导出 AuthService/AuthSessionService/JwtModule。

#### dto/login.dto.ts
- **功能**: 登录 DTO（email + password ≥8 位）。

---

### 5.3 modules/background-tasks/ — 后台任务调度

#### background-tasks.service.ts
- **功能**: 聚合查询三种后台任务（官网分析/背调报告/邮件草稿），映射为统一任务视图按活跃/最近分类返回。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`
- **方法**: `listForCustomer(user, customerId)` — 返回 `{ active: TaskView[], recent: TaskView[] }`

#### task-submission-lock.service.ts
- **功能**: 基于 Redis 的分布式锁服务（防重复提交后台任务）。
- **类型**: `@Injectable()` Service
- **依赖**: `REDIS_CLIENT`
- **方法**: `buildKey(input)`, `acquire(key, ttlSeconds, value)`, `release(key)`

#### background-tasks.controller.ts
- **功能**: `GET customers/:customerId/background-tasks`。
- **依赖**: `BackgroundTasksService`

#### background-tasks.module.ts
- **功能**: `@Global()` 模块，全局导出 `TaskSubmissionLockService`。

---

### 5.4 modules/commercial/ — 报价与样品

#### commercial.service.ts
- **功能**: 报价（Quote）和样品请求（SampleRequest）的业务逻辑：CRUD + 数据权限过滤 + 自动推进客户阶段。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`, `CustomerStageService`
- **方法**: `listQuotes`, `createQuote`, `listSamples`, `createSample`

#### commercial.controller.ts
- **功能**: 商业 HTTP 端点。
- **类型**: `@Controller()`
- **端点**: `GET/POST quotes`、`GET/POST samples`

#### commercial.module.ts
- **功能**: 依赖 CustomersModule 和 FollowUpsModule。

#### dto/
- `create-quote.dto.ts` — customerId/quoteNo/currency/amount/validUntil 等
- `create-sample-request.dto.ts` — customerId/productSummary/status/carrier/trackingNo 等

---

### 5.5 modules/customers/ — 客户管理

#### customers.service.ts
- **功能**: 客户 CRUD、分配、阶段变更、时间线聚合、联系人创建，含数据权限控制和默认字典初始化。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`
- **方法**:
  - `list(user, filters)` — 按权限过滤列出客户
  - `filterOptions(user)` — 筛选下拉选项
  - `create(user, dto)` — 创建客户（自动命名规范化/域名提取/去重/阶段初始化）
  - `get(user, id)` — 获取客户详情（含关联数据）
  - `update(user, id, dto)` — PATCH 语义部分更新
  - `assign(user, id, dto)` — 变更负责人（含历史记录）
  - `changeStage(user, id, dto)` — 变更阶段（含历史记录）
  - `timeline(user, id)` — 聚合活动时间线
  - `createContact(user, customerId, dto)` — 创建联系人

#### customer-stage.service.ts
- **功能**: 客户阶段流转引擎，事务内校验并记录变更历史。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`
- **方法**: `advanceCustomerStage(input)` — 推进客户阶段

#### customers.controller.ts
- **功能**: `@Controller("customers")`
- **端点**: `GET/POST /customers`、`GET/PATCH /customers/:id`、`POST assign/stage`、`GET timeline`、`POST contacts`

#### dto/
- `assign-customer.dto.ts`、`change-customer-stage.dto.ts`、`create-contact.dto.ts`、`create-customer.dto.ts`、`update-customer.dto.ts`（继承 PartialType）

---

### 5.6 modules/dashboards/ — 数据仪表盘

#### dashboards.service.ts
- **功能**: 仪表盘核心编排服务，根据视图类型（personal/team/management）构建查询条件、调用子服务、组装返回数据。
- **类型**: `@Injectable()` Service
- **依赖**: `DashboardQueryBuilder`, `DistributionService`, `RankingService`, `DashboardSummaryService`
- **方法**: `personal(user, query)`, `team(user, query)`, `management(user, query)`, `filterOptions(user)`

#### dashboards.controller.ts
- **功能**: `@Controller("dashboards")`
- **端点**: `GET /me`（个人）、`GET /team`（团队）、`GET /management`（管理层）、`GET /filter-options`
- **权限**: `dashboards.personal.view` / `dashboards.view`

#### services/dashboard-query-builder.ts
- **功能**: 根据用户权限和视图模式动态构造 Prisma where 条件，支持团队树形展开（BFS 遍历子团队）。
- **依赖**: `PrismaService`
- **方法**: `buildCustomerWhere`, `getAllowedTeamIds`, `filterOptions`, `buildFollowupOwnerWhere`

#### services/dashboard-summary.service.ts
- **功能**: 核心 KPI 计算（客户总数/新客户/邮件收发/回复率/转化率/赢单率/今日跟进）。
- **依赖**: `PrismaService`, `DistributionService`, `RankingService`
- **方法**: `getManagementLikeDashboard`, `getPersonalSummary`, `getManagementSummary`, `getTodayFollowupTasks`

#### metrics/distribution.service.ts
- **功能**: 客户分布统计（按阶段/国家/类型）。
- **依赖**: `PrismaService`
- **方法**: `getStageDistribution`, `getCountryDistribution`, `getTypeDistribution`

#### metrics/ranking.service.ts
- **功能**: 排名与筛选（销售排名/高优先级客户/风险客户/产品线反馈/邮件/新客户趋势）。
- **依赖**: `PrismaService`
- **方法**: `getSalesRanking`, `getHighPriorityCustomers`, `getRiskCustomers`, `getProductLineFeedback`, `getNewCustomerTrend`, `getEmailTrend` 等

#### helpers/date-utils.ts
- **功能**: 日期工具函数（范围构造/区间运算/聚合粒度推断/桶格式化）。
- **导出函数**: `buildDateRange`, `between`, `startOfDay`, `endOfDay`, `addDays`, `inferGroupBy`, `formatBucket`

#### types.ts
- **功能**: 共享类型定义 + `computePriority` 优先级计算纯函数（综合阶段/评分/报价/任务到期日 → A/B/C 三级）。

#### dto/dashboard-query.dto.ts
- **功能**: 查询参数 DTO（时间范围/负责人/团队/国家/类型/阶段/聚合粒度，支持驼峰蛇形兼容）。

---

### 5.7 modules/emails/ — 邮件系统（最大模块）

#### emails.service.ts
- **功能**: 邮件模块门面（Facade），聚合所有子服务为 Controller 提供统一入口。
- **类型**: `@Injectable()` Service
- **依赖**: `EmailAccountService`, `EmailDraftGenerationService`, `EmailDraftService`, `EmailThreadService`, `ImapManualSyncService`
- **方法**: `listAccounts`, `createAccount`, `updateAccount`, `testAccount`, `generateDraft`, `getDraft`, `updateDraft`, `submitReview`, `approve`, `sendApprovedDraft`, `listCustomerThreads`, `listDrafts`, `listThreads`, `listThreadMessages`, `syncStatus`, `runSync`

#### emails.controller.ts
- **功能**: 邮件模块全部 REST API 路由（17 个端点），部分需 `@RequireLiveSession()` + `@RequireAnyPermissions()`。
- **类型**: `@Controller()`
- **依赖**: `EmailsService`
- **端点**: 邮箱账号 CRUD、测试、草稿生成/CRUD/审核/发送、邮件线程查询、同步状态/手动同步

#### emails.module.ts
- **功能**: 聚合所有 Controller/Provider/Processor，注册 `email-draft-queue` 和 `imap-inbound-queue` 两个 BullMQ 队列，导入 AiModule/CustomersModule/FollowUpsModule/SettingsModule。
- **Provider（23个）**: 含 accounts/drafts/generation/helpers/inbound 各子目录所有服务及两个 Processor

---

#### emails/accounts/ — 邮箱账号

##### email-account.service.ts
- **功能**: 邮箱账号 CRUD（列表/创建/更新/测试/查找），密码加密，权限校验。
- **依赖**: `PrismaService`, `EmailSecretService`, `EmailAccountListenerService`, `EmailAccountTestService`
- **方法**: `list`, `create`, `update`, `test`, `findAccount`

##### email-account-listener.service.ts
- **功能**: 监听账号创建/更新事件，启动/刷新 IMAP 连接。
- **依赖**: `ImapIdleService`
- **方法**: `startAfterCreate`, `refreshAfterUpdate`

##### email-account-test.service.ts
- **功能**: 并行执行 SMTP + IMAP 连通性测试。
- **依赖**: `SmtpService`, `ImapSyncService`
- **方法**: `test(account)` → `{ overallOk, smtp, imap, message }`

##### email-account-error-mapper.ts
- **功能**: SMTP/IMAP 测试错误 → 中文提示映射，综合摘要生成。
- **类型**: 纯函数
- **导出**: `buildEmailTestSummary`, `mapSmtpTestError`, `mapImapTestError`

##### email-compliance.service.ts
- **功能**: 邮件发送合规检查（草稿状态/账号激活/黑名单/发送频次限额）。
- **依赖**: `PrismaService`, `ConfigService`
- **方法**: `assertCanSend`, `consumeQuota`

##### email-secret.service.ts
- **功能**: AES-256-GCM 邮箱密码加密解密。
- **依赖**: `ConfigService`
- **方法**: `encrypt(value)`, `decrypt(value)`

---

#### emails/drafts/ — 草稿与审批

##### email-draft.service.ts
- **功能**: 草稿 CRUD 与审批流程（获取/更新/提交审核/批准/发送）。
- **依赖**: `PrismaService`, `AiGenerationService`, `EmailAccountService`, `EmailApprovalService`
- **方法**: `getDraft`, `updateDraft`, `submitReview`, `approve`, `sendApprovedDraft`

##### email-approval.service.ts
- **功能**: 批准草稿 + 发送邮件（合规检查 → SMTP 发送 → 线程/消息记录 → 阶段推进 → 跟进任务触发）。
- **依赖**: `PrismaService`, `AiGenerationService`, `EmailComplianceService`, `SmtpService`, `CustomerStageService`, `FollowUpsService`
- **方法**: `approve(user, draft, dto)`, `send(user, draft, account)`

##### email-draft.processor.ts
- **功能**: BullMQ 消费者，异步执行 AI 邮件草稿生成（查询 Prompt 配置 → 调用 AI → 记录版本 → 更新草稿）。
- **类型**: `@Processor(EMAIL_DRAFT_QUEUE)` extends WorkerHost
- **依赖**: `PrismaService`, `AiProviderService`, `AiGenerationService`, `SettingsService`
- **方法**: `process(job)`

##### constants.ts
- **功能**: AI 邮件 Prompt 模板常量（基础/收件人/跟进/安全提示 + 9 种邮件目的详细模板）。
- **导出**: `EMAIL_PROMPT_BASE`, `EMAIL_PROMPT_TEMPLATES` 等

##### email-draft.constants.ts
- **功能**: BullMQ 队列名常量 `EMAIL_DRAFT_QUEUE = "email-draft-queue"`

---

#### emails/dto/ — 数据传输对象

- `approve-email-draft.dto.ts` — reviewComment?
- `create-email-account.dto.ts` — SMTP/IMAP 服务器配置（11 个字段 + 2 限额）
- `generate-email-draft.dto.ts` — purpose/toEmail/ccEmails/userInstructions 等
- `update-email-account.dto.ts` — 继承 CreateEmailAccountDto（全可选 + isActive）
- `update-email-draft.dto.ts` — purpose/emailAccountId/subject/body/toEmail/ccEmails/bccEmails

---

#### emails/generation/ — AI 邮件生成

##### email-draft-generation.service.ts
- **功能**: 邮件草稿生成总入口，编排 上下文构建 → 提交锁检查 → 创建草稿入队。
- **依赖**: `EmailContextBuilder`, `EmailDraftSubmissionService`, `EmailDraftCreationService`
- **方法**: `generate(user, customerId, dto)`

##### email-context-builder.ts
- **功能**: 构建 AI 生成邮件所需完整上下文（客户/联系人/网站分析/研究报告/OEM 评分/公司档案）。
- **依赖**: `PrismaService`
- **方法**: `build(user, customerId, dto)`
- **导出函数**: `assembleGenerationContext`

##### email-draft-creation.service.ts
- **功能**: 创建草稿记录 + AI 运行记录 + 入队 BullMQ + 条件推进客户阶段。
- **依赖**: `PrismaService`, `AiGenerationService`, `AiProviderService`, `CustomerStageService`, `EmailAccountService`, `@InjectQueue(EMAIL_DRAFT_QUEUE)`
- **方法**: `createDraftAndEnqueue(user, customerId, context, toEmail, dto)`

##### email-draft-submission.service.ts
- **功能**: 分布式锁与去重服务（防同一客户+收件人+用途重复生成）。
- **依赖**: `PrismaService`, `TaskSubmissionLockService`
- **方法**: `checkAndLock(params)`, `release(lockKey)`

##### email-prompt-builder.ts
- **功能**: 根据用途/收件人/数据库配置组装完整 AI system prompt。
- **类型**: 纯函数
- **导出**: `buildEmailSystemPrompt`, `buildDbConfigLines`

##### smtp.service.ts
- **功能**: SMTP 邮件发送（封装 nodemailer），含连接验证和 DNS/SNI 处理。
- **依赖**: `EmailSecretService`
- **方法**: `verify(account)`, `send(account, draft)`

##### types.ts
- **功能**: 邮件生成上下文类型 `EmailGenerationContext`

---

#### emails/helpers/

##### email-helpers.ts
- **功能**: 邮件工具函数（邮箱比较/默认标题/提取用途/过滤 undefined/解析发件账号）。
- **导出**: `sameEmailAddress`, `buildSubject`, `getDraftPurpose`, `pickDefinedFields`, `resolveSenderAccount`

---

#### emails/inbound/ — IMAP 收件

##### imap-idle.service.ts
- **功能**: IMAP 空闲监听核心，OnModuleInit 自动启动所有激活账号连接，支持自动重连、邮件到达触发抓取、OnModuleDestroy 清理。
- **类型**: `@Injectable()` Service (OnModuleInit/OnModuleDestroy)
- **依赖**: `PrismaService`, `EmailSecretService`, `ImapConnectionRegistryService`, `ImapFetchEnqueueService`, `ImapReconnectService`
- **方法**: `onModuleInit`, `onModuleDestroy`, `getConnection`, `createClient`, `fetchAndEnqueue`, `markAccountSynced`, `startAccount`, `stopAccount`

##### imap-connection-registry.service.ts
- **功能**: IMAP 连接内存注册表（Map<string, ManagedConnection>）。
- **方法**: `get`, `set`, `delete`, `has`, `getAllIds`

##### imap-fetch-enqueue.service.ts
- **功能**: 从 IMAP 邮箱抓取邮件并入队到 `imap-inbound-queue`。
- **依赖**: `PrismaService`, `@InjectQueue(IMAP_INBOUND_QUEUE)`
- **方法**: `fetchAndEnqueue(context)`, `markAccountSynced(accountId)`

##### imap-reconnect.service.ts
- **功能**: IMAP 重连策略（递增延迟 1s→3s→5s→10s→...→60s）、认证失败检测、错误格式化。
- **方法**: `reconnectDelay(retryCount)`, `isAuthFailure(error)`, `formatError(error)`

##### imap-inbound.service.ts
- **功能**: 入站邮件处理（messageId 去重 → inReplyTo/fromEmail 查找线程 → 创建消息 → 更新客户阶段 REPLIED → 触发跟进任务）。
- **依赖**: `PrismaService`, `FollowUpsService`
- **方法**: `findThreadForInbound`, `handleInboundMessage`

##### imap-inbound.processor.ts
- **功能**: BullMQ 消费者，处理入站邮件 → EventEmitter 发射 SSE 实时推送。
- **类型**: `@Processor(IMAP_INBOUND_QUEUE)` extends WorkerHost
- **依赖**: `PrismaService`, `ImapInboundService`, `EventEmitter2`
- **方法**: `process(job)`

##### imap-manual-sync.service.ts
- **功能**: 手动触发 IMAP 同步，智能选择策略（复用已有连接/临时连接/跳过操作中）。
- **依赖**: `PrismaService`, `ImapIdleService`
- **方法**: `manualSyncForUser(userId)`, `getConnectionStatusesForUser(user)`

##### imap-sync.service.ts
- **功能**: 轻量 IMAP 连接验证（建立→验证→断开）。
- **依赖**: `EmailSecretService`
- **方法**: `verifyAccount(account)`

##### email-thread.service.ts
- **功能**: 邮件线程和草稿查询（含附件）。
- **依赖**: `PrismaService`
- **方法**: `listCustomerThreads`, `listDrafts`, `listThreads`, `listThreadMessages`

##### 常量/类型:
- `imap-inbound.constants.ts` — `IMAP_INBOUND_QUEUE = "imap-inbound-queue"`
- `types.ts` — `ConnectionStatus`, `ManagedConnection`, `ImapAccount`, `SyncMode`, `AccountSyncResult`, `FetchContext`

---

### 5.8 modules/follow-ups/ — 跟进任务

#### follow-ups.service.ts
- **功能**: 跟进任务 CRUD + 完成处理 + 阶段推进 + SSE 事件推送。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`, `FollowUpRulesService`, `EventEmitter2`, `CustomerStageService`
- **方法**: `list`, `countDueSoonOpen`, `create`, `update`, `complete`, `handleEmailSent`, `handleCustomerReplied`

#### follow-ups.controller.ts
- **功能**: `@Controller("follow-up-tasks")`
- **端点**: `GET overdue-count`、`GET/POST /`、`PATCH :id`、`POST :id/complete`

#### rules/follow-up-rules.service.ts
- **功能**: 规则引擎，自动创建/取消/过期跟进任务。
- **依赖**: `PrismaService`, `EventEmitter2`
- **方法**: `handleEmailSent`, `handleCustomerReplied`, `syncExpiredFollowUps`

#### rules/follow-up-email-rules.ts
- **功能**: 邮件事件→跟进任务规则表（首次触达 3 天后/报价 2 天后/样品 3 天后等 8 条规则）。

#### rules/follow-up-stage-rules.ts
- **功能**: 任务完成→客户阶段映射（需求确认→Quoting / 报价跟进→Sampling / 样品跟进→Negotiating）。

#### rules/follow-up-rule-constants.ts
- **功能**: 任务标题/描述/触发器字符串常量。

#### dto/
- `create-follow-up-task.dto.ts` — customerId/ownerId/type/title/description/trigger/dueAt
- `update-follow-up-task.dto.ts` — title/description/dueAt/status

---

### 5.9 modules/knowledge/ — 企业知识库

#### knowledge.service.ts
- **功能**: 公司简介/品牌/产品/OEM 能力/证书/案例/邮件物料全实体 CRUD，含审计日志。
- **依赖**: `PrismaService`
- **方法**: `getCompanyProfile`, `upsertCompanyProfile`, `listBrands/createBrand`, `listProducts/createProduct`, `listCapabilities/createCapability`, `listCertificates/createCertificate`, `listCaseStudies/createCaseStudy`, `listEmailMaterials/createEmailMaterial`, `updateEntity`, `deleteEntity`

#### knowledge.controller.ts
- **功能**: `@Controller("knowledge")` — 14 个端点覆盖全部实体 CRUD。

#### dto/upsert-knowledge.dto.ts
- **功能**: 全实体共用增/改 DTO（约 30 个可选字段）。

---

### 5.10 modules/research/ — AI 背调报告

#### research.service.ts
- **功能**: 背调报告入口：请求校验 → 防重锁 → 创建报告入队。
- **依赖**: `ResearchReportDataService`, `AiGenerationService`, `AiProviderService`, `TaskSubmissionLockService`, `@InjectQueue(RESEARCH_REPORT_QUEUE)`
- **方法**: `generate(user, customerId, dto)`, `getLatest(user, customerId)`

#### research.processor.ts
- **功能**: BullMQ 消费者，执行报告生成：标记运行→构建上下文→调用 AI→解析输出→持久化。
- **类型**: `@Processor(RESEARCH_REPORT_QUEUE)` extends WorkerHost
- **依赖**: `AiProviderService`, `ResearchContextBuilder`, `ResearchReportRunService`
- **方法**: `process(job)`

#### services/research-report-data.service.ts
- **功能**: 数据访问层（DAL），封装所有 Prisma 查询写入。
- **依赖**: `PrismaService`
- **方法**: `ensureCustomerVisible`, `findActiveReport`, `getLatestWebsiteAnalysis`, `createReport`, `updateCustomerStageToResearching`, `getLatestReport`

#### services/research-report-run.service.ts
- **功能**: 报告运行期间状态管理。
- **依赖**: `PrismaService`, `AiGenerationService`
- **方法**: `markRunning`, `persistSuccess`, `markAiRunRunning`, `persistFailure`

#### services/search-provider.service.ts
- **功能**: 公开网络搜索（支持 Tavily/SerpAPI/自定义 Provider）。
- **依赖**: `ConfigService`
- **方法**: `searchCustomer(input)` — 返回去重搜索结果

#### builders/research-context-builder.ts
- **功能**: 构建 AI 报告上下文（客户/网站分析/企业资料/联系人/公开搜索）。
- **依赖**: `PrismaService`, `SearchProviderService`
- **方法**: `build(organizationId, customerId, salesNotes?)`

#### builders/research-prompt-builder.ts
- **功能**: 构建 AI 提示词，按三级预算逐步压缩上下文。
- **类型**: 纯函数
- **导出**: `researchSystemPrompt`, `buildResearchPromptUserInput`, `compactResearchRunInput`

#### parsers/research-output-parser.ts
- **功能**: 解析 AI 返回 JSON → 标准化报告结构 + Markdown 生成。
- **类型**: 纯函数
- **导出**: `parseResearchOutput`, `buildMarkdownReportV2`

#### research.constants.ts
- **功能**: 队列名 `research-report`、提示词最大字符数 12,000、三级预算配置。

#### dto/generate-research-report.dto.ts
- **功能**: `salesNotes?: string`

---

### 5.11 modules/scoring/ — OEM 适配评分

#### scoring.service.ts
- **功能**: 8 维评分计算 + AI 增强策略 + 持久化 + ≥60 分自动推进客户阶段。
- **类型**: `@Injectable()` Service
- **依赖**: `PrismaService`, `AiGenerationService`, `AiProviderService`
- **方法**: `generate(user, customerId)`, `getLatest(user, customerId)`, `buildContext(user, customerId)`
- **8 个评分维度**: productLineFit(20)/marketFit(15)/priceBandFit(15)/brandMaturity(15)/websiteCompleteness(10)/contactQuality(10)/cooperationOpportunity(10)/riskPenalty(10)
- **评级**: ≥80 A / ≥60 B / ≥40 C / 其余 D

#### scoring.controller.ts
- **功能**: `@Controller()` — `POST/GET customers/:customerId/oem-fit-scores`

#### scoring.module.ts
- **功能**: 导入 AiModule。

---

### 5.12 modules/settings/ — 系统设置

#### settings.service.ts
- **功能**: Facade 门面，聚合所有子服务方法透传给 Controller。
- **依赖**: 7 个子服务
- **方法**: users/createUser/updateUser/roles/permissions/updateRolePermissions/teams/auditLogs/customerSources/createCustomerSource/updateCustomerSource/customerTypes 系列/blacklistRules 系列/oemScoringWeights 系列/emailPromptConfigs 系列

#### settings.controller.ts
- **功能**: `@Controller()` — 22 个端点，需对应权限或 `settings.manage`，写入操作需 `@RequireLiveSession()`

#### settings.module.ts
- **功能**: 导入 ScheduleModule，注册 10 个 Provider，导出 PermissionService/SettingsService。

#### settings.public.ts
- **功能**: 公共导出入口（PermissionService, SettingsService, 评分权重常量和工具类型）

---

#### settings/services/ — 子服务

##### permission.service.ts
- **功能**: 计算用户最终权限（递归展开角色继承链，合并直接/继承/单独授权），计算数据范围 SELF/TEAM/ALL。
- **依赖**: `PrismaService`
- **角色继承**: ADMIN → EXECUTIVE/OPERATOR → SALES_MANAGER → SALES_REP
- **方法**: `getEffectivePermissions(userId)`, `getInheritedRoleCodes`, `getParentRoleCodes`

##### user-management.service.ts
- **功能**: 组织用户管理（创建/更新/列表），bcrypt 哈希密码，角色变更/禁用触发 EventEmitter 事件通知 AuthSessionService 失效会话。
- **依赖**: `PrismaService`, `EventEmitter2`, `PermissionService`
- **方法**: `listUsers`, `createUser`, `updateUser`, `emitPermissionChanged`

##### role-permission.service.ts
- **功能**: 角色权限管理，更新时递归展开权限依赖、事务写入、审计日志、触发会话失效。
- **依赖**: `PrismaService`, `UserManagementService`
- **方法**: `listRoles`, `listPermissions`, `updateRolePermissions`

##### organization-query.service.ts
- **功能**: 团队列表、审计日志查询（最近 200 条）。
- **依赖**: `PrismaService`
- **方法**: `listTeams`, `listAuditLogs`

##### scoring-config.service.ts
- **功能**: OEM 评分权重管理（7 项加分权重之和须为 100）。
- **依赖**: `PrismaService`
- **方法**: `getWeights`, `updateWeights`

##### customer-dictionary.service.ts
- **功能**: 客户来源/类型字典管理，内置 8 种默认来源 + 9 种默认类型，`ensureDefaults()` 自动 upsert。
- **依赖**: `PrismaService`
- **方法**: `ensureDefaults`, `listSources/createSource/updateSource`, `listTypes/createType/updateType`

##### blacklist.service.ts
- **功能**: 黑名单规则管理（COMPANY_NAME/DOMAIN/EMAIL/COUNTRY/KEYWORD），值转小写规范化。
- **依赖**: `PrismaService`
- **方法**: `list`, `create`, `update`

##### email-prompt-config.service.ts
- **功能**: 组织级邮件 AI 提示词自定义配置（获取/更新/重置/预览），含审计日志。
- **依赖**: `PrismaService`
- **方法**: `getConfigs`, `updateConfig`, `resetConfig`, `previewConfig`, `readOrgPromptConfig`

##### audit-cleanup.service.ts
- **功能**: 定时任务服务（`@Cron("0 3 * * *")`），每天凌晨 3 点清理 90 天前审计日志。
- **依赖**: `PrismaService`
- **方法**: `cleanupOldAuditLogs()`（自动触发）

---

#### settings/prompts/ — 邮件提示默认值

##### settings-email-prompt.defaults.ts
- **功能**: 9 种邮件目的默认 AI 提示词配置 + 合并/组装工具函数。
- **导出**: `DEFAULT_EMAIL_PROMPT_CONFIGS`, `mergeEmailPromptDefaults`, `assembleFinalPrompt`

##### settings-email-prompt.types.ts
- **功能**: 邮件提示配置类型定义。
- **导出**: `EmailPromptConfigData`, `EmailPromptPreviewResult`, `EmailPromptConfigRow`

#### dto/settings.dto.ts
- **功能**: 设置模块全部 API DTO（CreateUserDto/UpdateUserDto/BlacklistRule/EmailPromptConfig/RolePermissions/ScoringWeights）。

---

### 5.13 modules/upload/ — 文件上传

#### upload.service.ts
- **功能**: S3 文件上传/下载/删除，OnModuleInit 自动检查创建 bucket。
- **类型**: `@Injectable()` Service (OnModuleInit)
- **依赖**: `PrismaService`, `ConfigService`
- **方法**: `uploadFile`, `getPresignedUrl`（1 小时有效）, `deleteFile`

#### upload.controller.ts
- **功能**: `@Controller("upload")`
- **端点**: `POST /`（multipart ≤10MB）、`GET :id/url`、`DELETE :id`

---

### 5.14 modules/website-analysis/ — 网站分析

#### website-analysis.service.ts
- **功能**: 网站分析业务：校验客户 → 去重检测 → 分布式锁 → 创建 AI run → 入库 QUEUED 分析 → 入队 BullMQ。
- **依赖**: `PrismaService`, `AiGenerationService`, `AiProviderService`, `TaskSubmissionLockService`, `@InjectQueue(WEBSITE_ANALYSIS_QUEUE)`
- **方法**: `enqueueForCustomer`, `getLatest`, `getById`

#### website-analysis.processor.ts
- **功能**: BullMQ 消费者：爬虫抓取 → 查询公司资料 → 构建 AI 输入 → 调用 AI 生成中文分析报告 → 持久化。AI 失败时保留爬虫结果。
- **类型**: `@Processor(WEBSITE_ANALYSIS_QUEUE)` extends WorkerHost
- **依赖**: `PrismaService`, `WebsiteCrawlerService`, `AiProviderService`, `AiGenerationService`
- **方法**: `process(job)`

#### website-crawler.service.ts
- **功能**: Playwright 无头浏览器网站爬虫：robots.txt/sitemap.xml 种子发现 → BFS 遍历（深度 3/并发 3/最多 40 页）→ 每页读取标题/语言/文本/链接/图片/联系方式/价格信号 → 推断产品分类/价格/网站完整度/合作机会/风险。
- **依赖**: 无（使用 playwright）
- **方法**: `analyze(websiteUrl, maxPages?)`

#### builders/website-ai-input.builder.ts
- **功能**: 爬虫结果 + 公司资料 → 限长 AI 输入 JSON（≤30,000 字符），4 级收缩策略。
- **类型**: 纯函数
- **导出**: `buildBoundedWebsiteAiInput`

#### builders/website-ai-input.builder.spec.ts
- **功能**: 单元测试（验证大数据量场景下截断约束）

#### website-analysis.controller.ts
- **功能**: `@Controller()` — `POST/GET /customers/:customerId/website-analyses`、`GET /website-analyses/:id`

#### website-analysis.constants.ts / website-analysis.types.ts
- **功能**: 队列名常量 + AI 洞察/爬虫结果类型定义。

---

## 六、整体架构特征

### 认证授权三层 Guard 链
1. **JwtAuthGuard** — Bearer token 验证，`@Public()` 可跳过
2. **LiveSessionGuard** — `@RequireLiveSession()` 路由验证会话有效性
3. **PermissionsGuard** — `@RequirePermissions()` / `@RequireAnyPermissions()` 细粒度权限

### 数据隔离
- `buildCustomerDataScopeWhere` 实现 SELF/TEAM/ALL 三级行级数据隔离

### 实时通信
- `SseService` 基于 EventEmitter 实现服务端推送（入站邮件到达/跟进任务变更）

### 异步任务
- 3 个 BullMQ 队列：`email-draft-queue` / `imap-inbound-queue` / `research-report` / `website-analysis`
- `TaskSubmissionLockService` 基于 Redis 的分布式锁防重复提交

### AI 集成
- `AiProviderService` 封装 LLM 调用（OpenAI 兼容）
- `AiGenerationService` 管理 AI 生成运行生命周期（含人工审查版本）
- AI 用于：邮件草稿生成 / 背调报告生成 / 网站分析 / OEM 评分策略增强

### 模块设计模式
- 大模块采用 **Facade 门面**（EmailsService、SettingsService）聚合子服务，Controller 只依赖门面
- 使用 `*\.public.ts` barrel 文件控制模块对外的公共 API
- 架构分层：Controller → Service（业务编排）→ 子服务（数据访问/外部集成）→ Prisma/Redis
