# 外部审批系统与 SSO 对接接口清单

版本：v1.0  
日期：2026-07-07  
状态：接口梳理阶段（未改代码）

本文档梳理 CRM 系统对接外部信息管理系统（统一审批 + 单点登录）所需的全部接口，分为「已实现」和「待实现」两部分。

---

## 1. 已实现接口

以下接口已在当前代码中实现，可直接复用或作为对接基础。

### 1.1 认证接口（Auth）

> 文件：`apps/api/src/modules/auth/auth.controller.ts`  
> 前缀：`/api/auth`

| # | 方法 | 路径 | 认证要求 | 说明 | 对接价值 |
|---|------|------|----------|------|----------|
| 1 | POST | `/auth/login` | `@Public()` | 邮箱+密码登录，返回 accessToken + refreshToken | 本地认证保留，SSO 用户无需此接口 |
| 2 | POST | `/auth/refresh` | `@Public()` | 刷新 accessToken | SSO token 过期时可复用刷新机制 |
| 3 | POST | `/auth/logout` | 已认证 | 登出，清除 Redis session | 可扩展为同时通知外部 IdP 单点登出 |
| 4 | GET | `/auth/me/permissions` | 已认证 | 获取当前用户权限列表 | SSO 用户登录后需走相同逻辑加载权限 |

**当前认证架构要点：**
- JWT 双 token 机制（access + refresh）
- Redis session 管理，支持权限版本号失效
- 三级全局 Guard：`JwtAuthGuard` → `LiveSessionGuard` → `PermissionsGuard`
- 用户上下文类型 `RequestUser` 包含：`id`, `organizationId`, `name`, `email`, `teamId`, `roleCodes`, `permissions`, `dataScope`, `sessionId`, `permissionVersion`

### 1.2 报价审批接口（Quote Approval）

> 文件：`apps/api/src/modules/commercial/commercial.controller.ts`  
> 前缀：`/api`

| # | 方法 | 路径 | 认证要求 | 说明 | 当前状态 |
|---|------|------|----------|------|----------|
| 1 | POST | `/quotes` | 已认证 | 新建报价（草稿） | ✅ 已实现 |
| 2 | PATCH | `/quotes/:id` | 已认证 | 编辑报价 | ✅ 已实现 |
| 3 | POST | `/quotes/:id/submit-review` | 已认证 | 提交审批（DRAFT → PENDING_APPROVAL） | ✅ 已实现，内部闭环 |
| 4 | POST | `/quotes/:id/approve` | 已认证 | 审批通过（PENDING_APPROVAL → APPROVED） | ✅ 已实现，内部闭环 |
| 5 | POST | `/quotes/:id/reject` | 已认证 | 审批驳回（PENDING_APPROVAL → REJECTED） | ✅ 已实现，内部闭环 |
| 6 | POST | `/quotes/:id/send` | 已认证 | 手动发送（APPROVED → SENT） | ✅ 已实现，内部闭环 |
| 7 | POST | `/quotes/:id/accept` | 已认证 | 客户接受（SENT → ACCEPTED） | ✅ 已实现，内部闭环 |
| 8 | POST | `/quotes/:id/reject-customer` | 已认证 | 客户拒绝（SENT → REJECTED） | ✅ 已实现，内部闭环 |
| 9 | POST | `/quotes/:id/expire` | 已认证 | 到期失效（SENT → EXPIRED） | ✅ 已实现，内部闭环 |
| 10 | GET | `/quotes/:id/history` | 已认证 | 查询报价审批历史 | ✅ 已实现 |
| 11 | GET | `/quotes/:id/export` | 已认证 | 导出单条报价 CSV | ✅ 已实现 |
| 12 | GET | `/quotes/export` | 已认证 | 批量导出报价 CSV | ✅ 已实现 |
| 13 | DELETE | `/quotes/:id` | 已认证 | 删除报价 | ✅ 已实现 |

**报价审批状态流转（已实现）：**

```
DRAFT ──submit-review──→ PENDING_APPROVAL ──approve──→ APPROVED ──send──→ SENT ──accept──→ ACCEPTED
                           │                          │                     └──reject-customer──→ REJECTED
                           │                          └──expire──→ EXPIRED
                           └──reject──→ REJECTED ──→ 回到草稿修改
```

**报价数据模型字段（已实现）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `customerId` | UUID | 关联客户 |
| `quoteNo` | String | 报价编号（唯一） |
| `status` | QuoteStatus | 业务状态：DRAFT / SENT / ACCEPTED / REJECTED / EXPIRED / VOIDED |
| `approvalStatus` | QuoteApprovalStatus | 审批状态：DRAFT / PENDING_APPROVAL / APPROVED / REJECTED |
| `productName` | String | 产品名称 |
| `specification` | String? | 规格 |
| `moq` | Int? | 最小起订量 |
| `quantity` | Int | 数量 |
| `unitPrice` | Decimal? | 单价 |
| `currency` | String | 币种 |
| `amount` | Decimal? | 总金额 |
| `materialCost` | Decimal? | 物料成本 |
| `processingCost` | Decimal? | 加工费 |
| `taxCost` | Decimal? | 税费 |
| `shippingCost` | Decimal? | 运费 |
| `discountAmount` | Decimal? | 折扣 |
| `validUntil` | DateTime? | 有效期 |
| `fileAssetId` | String? | 附件 ID |
| `notes` | String? | 备注 |
| `approvalComment` | String? | 审批意见 |
| `approvalSubmittedAt` | DateTime? | 提交审批时间 |
| `approvalSubmittedById` | String? | 提交审批人 |
| `approvalReviewedAt` | DateTime? | 审批完成时间 |
| `approvalReviewedById` | String? | 审批人 |

**报价审批请求体：**

```typescript
// QuoteReviewDto
{
  comment?: string;  // 审批意见（可选）
}
```

### 1.3 样品审批接口（Sample Approval）

> 文件：`apps/api/src/modules/commercial/commercial.controller.ts`  
> 前缀：`/api`

| # | 方法 | 路径 | 认证要求 | 说明 | 当前状态 |
|---|------|------|----------|------|----------|
| 1 | POST | `/samples` | 已认证 | 新建样品申请 | ✅ 已实现 |
| 2 | PATCH | `/samples/:id` | 已认证 | 更新样品（含状态流转） | ✅ 已实现 |
| 3 | GET | `/samples/:id/history` | 已认证 | 查询样品历史 | ✅ 已实现 |
| 4 | POST | `/samples/:id/fees` | 已认证 | 添加样品费用 | ✅ 已实现 |
| 5 | POST | `/samples/:id/returns` | 已认证 | 记录留样/归还 | ✅ 已实现 |
| 6 | DELETE | `/samples/:id` | 已认证 | 删除样品 | ✅ 已实现 |

**样品状态流转（已实现）：**

```
REQUESTED ──→ APPROVING ──→ PREPARING ──→ SHIPPED ──→ DELIVERED ──→ FEEDBACK_RECEIVED
                                                        │
                                                        ├──→ RETURNED
                                                        ├──→ STORED
                                                        ├──→ VOIDED
                                                        └──→ CLOSED
```

**样品数据模型字段（已实现）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `customerId` | UUID | 关联客户 |
| `quoteId` | UUID? | 关联报价 |
| `status` | SampleStatus | 当前状态 |
| `productSummary` | String | 产品概述 |
| `specification` | String | 规格 |
| `material` | String | 材质 |
| `process` | String | 工艺 |
| `sampleQuantity` | Int | 样品数量 |
| `samplePurpose` | SamplePurpose | 用途：CUSTOMER_TEST / EXHIBITION / APPEARANCE_CONFIRMATION |
| `deliveryDeadline` | DateTime | 交付期限 |
| `fileAssetIds` | String[] | 附件 ID 列表 |
| `trackingNo` | String? | 运单号 |
| `carrier` | String? | 物流商 |
| `shippedAt` | DateTime? | 寄出时间 |
| `deliveredAt` | DateTime? | 签收时间 |
| `approvedAt` | DateTime? | 审核通过时间 |
| `returnedAt` | DateTime? | 归还时间 |
| `storedAt` | DateTime? | 留样时间 |
| `voidedAt` | DateTime? | 作废时间 |
| `closedAt` | DateTime? | 关闭时间 |
| `feedback` | String? | 客户反馈 |

> ⚠️ 注意：样品审批当前通过 `PATCH /samples/:id` 更新 `status` 字段实现（前端有审批/驳回按钮），  
> 但**没有独立的 approve/reject 接口**，也没有像报价那样的 `approvalStatus` 分离字段。  
> 对接外部审批系统时需要补齐。

### 1.4 邮件审批接口（Email Approval）

> 文件：`apps/api/src/modules/emails/emails.controller.ts`  
> 前缀：`/api`

| # | 方法 | 路径 | 认证要求 | 说明 | 当前状态 |
|---|------|------|----------|------|----------|
| 1 | POST | `/email-drafts/:id/submit-review` | 已认证 | 提交邮件审核（DRAFT → PENDING_REVIEW） | ✅ 已实现 |
| 2 | POST | `/email-drafts/:id/approve` | `@RequireLiveSession` + `emails.send` 或 `emails.approve` | 审批通过 | ✅ 已实现，内部闭环 |
| 3 | POST | `/email-drafts/:id/send` | `@RequireLiveSession` + `emails.send` | 发送邮件（仅审批通过后可发） | ✅ 已实现 |

**邮件审批状态流转（已实现）：**

```
DRAFT ──submit-review──→ PENDING_REVIEW ──approve──→ APPROVED ──send──→ SENT
                            │
                            └──→ 可被驳回（回到 DRAFT）
```

**邮件审批请求体：**

```typescript
// ApproveEmailDraftDto
{
  reviewComment?: string;  // 审批意见（可选）
}
```

### 1.5 权限与角色体系（已实现）

> 文件：`apps/api/src/modules/settings/settings.controller.ts`

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/settings/users` | 用户列表 |
| 2 | POST | `/settings/users` | 创建用户 |
| 3 | PATCH | `/settings/users/:id` | 更新用户 |
| 4 | GET | `/settings/roles` | 角色列表 |
| 5 | GET | `/settings/permissions` | 权限列表 |
| 6 | PATCH | `/settings/roles/:roleId/permissions` | 更新角色权限 |
| 7 | GET | `/settings/teams` | 团队列表 |

**已定义角色：**

| 角色 | 数据范围 | 说明 |
|------|----------|------|
| `ADMIN` | ALL | 全部权限 |
| `EXECUTIVE` | ALL | 管理层查看 |
| `SALES_MANAGER` | TEAM | 团队范围，可审批邮件 |
| `SALES_REP` | SELF | 仅个人数据，不可审批 |
| `OPERATOR` | — | 知识库和字典管理 |

**角色继承链：** `ADMIN → EXECUTIVE, OPERATOR` → `EXECUTIVE → SALES_MANAGER` → `SALES_REP`

**已定义权限码（22 个）：**

```
customers.read          customers.write         customers.assign
website.analyze         research.generate       scoring.generate
emails.generate         emails.send             emails.approve
emails.accounts.manage_personal    emails.accounts.manage_shared
dashboards.personal.view           dashboards.view
knowledge.write
settings.users.manage   settings.roles.manage    settings.audit_logs.read
settings.customer_dictionaries.manage
settings.blacklist.manage
settings.ai_config.manage
settings.scoring_weights.manage
settings.email_prompt.manage
```

### 1.6 审计日志接口（已实现）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/settings/audit-logs` | 查询审计日志 |

> ⚠️ 当前审计日志存在「写入不完整」的问题（设计文档已标注），对接外部审批时需确保所有审批动作都写入审计。

### 1.7 历史追踪接口（已实现）

| # | 方法 | 路径 | 说明 |
|---|------|------|------|
| 1 | GET | `/quotes/:id/history` | 报价历史（含 CREATED / UPDATED / SUBMITTED / APPROVED / REJECTED / VOIDED） |
| 2 | GET | `/samples/:id/history` | 样品历史（含 CREATED / UPDATED / STATUS_CHANGED / FEE_ADDED / QUOTE_LINKED / RETURNED / STORED / VOIDED / CLOSED） |

---

## 2. 待实现接口

以下接口为对接外部审批系统和 SSO 所需，当前代码中不存在。

### 2.1 SSO 单点登录接口

> 建议文件：`apps/api/src/modules/auth/sso.controller.ts`  
> 前缀：`/api/auth/sso`

| # | 方法 | 路径 | 认证要求 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | GET | `/auth/sso/login` | `@Public()` | 生成外部 IdP 登录 URL 并重定向 | P0 |
| 2 | GET | `/auth/sso/callback` | `@Public()` | 接收 IdP 认证回调，交换 token，建立本地会话 | P0 |
| 3 | POST | `/auth/sso/logout` | 已认证 | 单点登出，通知 IdP 终止会话 | P1 |
| 4 | GET | `/auth/sso/metadata` | `@Public()` | 本系统 SP 元数据（SAML 场景需要） | P2 |

**接口 1：SSO 登录发起**

```
GET /api/auth/sso/login
```

请求参数：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `redirect_uri` | string | 否 | 登录成功后的回调地址，默认为前端首页 |

响应：`302 Redirect` → 外部 IdP 登录页

逻辑：
1. 生成 `state` 参数（防 CSRF），存入 Redis（TTL 5 分钟）
2. 拼接 IdP 授权 URL（OIDC: `{issuer}/authorize?client_id=...&redirect_uri=...&state=...&scope=openid profile email`）
3. 302 重定向到 IdP

---

**接口 2：SSO 回调**

```
GET /api/auth/sso/callback
```

请求参数：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | 是 | IdP 授权码（OIDC）或 SAML Response |
| `state` | string | 是 | 防 CSRF 状态码 |

响应：
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "uuid",
    "name": "张三",
    "email": "zhangsan@company.com",
    "roleCodes": ["SALES_REP"],
    "permissions": ["customers.read", "..."],
    "dataScope": "SELF"
  }
}
```

逻辑：
1. 验证 `state` 参数（从 Redis 取出比对）
2. 用 `code` 向 IdP 换取 token（OIDC）或解析 SAML Assertion
3. 从 IdP token 中提取用户标识（email / employeeId / sub）
4. 查询或创建本地用户映射（`SsoUserMapping` 表）
5. 加载用户角色和权限
6. 创建 Redis session
7. 签发本系统 accessToken + refreshToken
8. 前端存储 token，完成登录

---

**接口 3：单点登出**

```
POST /api/auth/sso/logout
```

请求体：
```json
{
  "redirect_uri": "https://crm.example.com/login"
}
```

响应：
```json
{
  "logoutUrl": "https://idp.example.com/logout?id_token_hint=..."
}
```

逻辑：
1. 清除本系统 Redis session
2. 返回 IdP 的登出 URL，前端跳转完成单点登出

---

**接口 4：SP 元数据（SAML）**

```
GET /api/auth/sso/metadata
```

响应：XML（SAML SP Metadata）

> 仅在使用 SAML 协议时需要，OIDC 场景可忽略。

---

### 2.2 外部审批推送接口

> 建议文件：`apps/api/src/modules/approval/approval-outbound.controller.ts`  
> 前缀：`/api/approval/outbound`

| # | 方法 | 路径 | 认证要求 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | POST | `/approval/outbound/submit` | 已认证 + `@RequireLiveSession()` | 将审批单据推送到外部系统 | P0 |
| 2 | GET | `/approval/outbound/:id/status` | 已认证 | 主动查询外部审批状态 | P1 |
| 3 | POST | `/approval/outbound/:id/cancel` | 已认证 + `@RequireLiveSession()` | 撤回已提交的外部审批 | P1 |

---

**接口 1：提交审批到外部系统**

```
POST /api/approval/outbound/submit
```

请求体：
```typescript
{
  businessType: "QUOTE" | "SAMPLE" | "EMAIL";  // 业务类型
  businessId: string;                           // 业务单据 ID
  approvalFlowId?: string;                      // 外部系统审批流 ID（可选，由配置决定）
  comment?: string;                             // 提交意见
}
```

响应：
```json
{
  "approvalRecordId": "uuid",           // 本系统审批记录 ID
  "externalApprovalId": "EXT-20260707-001",  // 外部系统返回的审批实例 ID
  "status": "PENDING",
  "submittedAt": "2026-07-07T10:00:00Z"
}
```

逻辑：
1. 校验业务单据存在且状态允许提交审批
2. 序列化业务数据（报价/样品/邮件的完整信息）
3. 调用外部审批系统 API 创建审批实例
4. 记录 `ApprovalRecord`（含 `externalApprovalId`）
5. 更新业务单据状态为 `EXTERNAL_PENDING`
6. 写入审计日志

---

**接口 2：查询外部审批状态**

```
GET /api/approval/outbound/:id/status
```

路径参数：
| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | string | 本系统 `approvalRecordId` |

响应：
```json
{
  "approvalRecordId": "uuid",
  "externalApprovalId": "EXT-20260707-001",
  "status": "APPROVED",
  "reviewerName": "李四",
  "reviewedAt": "2026-07-07T14:30:00Z",
  "comment": "同意，请继续推进"
}
```

逻辑：
1. 根据 `approvalRecordId` 查找记录
2. 调用外部审批系统 API 查询最新状态
3. 如果状态有变更，同步更新本地业务单据状态

---

**接口 3：撤回外部审批**

```
POST /api/approval/outbound/:id/cancel
```

请求体：
```json
{
  "reason": "价格变更，需要重新报价"
}
```

响应：
```json
{
  "approvalRecordId": "uuid",
  "status": "CANCELLED",
  "cancelledAt": "2026-07-07T11:00:00Z"
}
```

---

### 2.3 外部审批回调接口

> 建议文件：`apps/api/src/modules/approval/approval-inbound.controller.ts`  
> 前缀：`/api/approval/inbound`

| # | 方法 | 路径 | 认证要求 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | POST | `/approval/inbound/callback` | 签名验证（非 JWT） | 接收外部系统审批结果回调 | P0 |
| 2 | GET | `/approval/inbound/detail/:externalId` | API Key 认证 | 供外部系统拉取审批单据详情 | P0 |
| 3 | GET | `/approval/inbound/:externalId/attachments` | API Key 认证 | 供外部系统拉取审批附件 | P1 |

---

**接口 1：审批结果回调**

```
POST /api/approval/inbound/callback
```

> ⚠️ 此接口不走 JWT 认证（`@Public()`），通过 HMAC 签名验证请求合法性。

请求头：
| Header | 说明 |
|--------|------|
| `X-Signature` | HMAC-SHA256 签名（密钥为 `APPROVAL_WEBHOOK_SECRET`） |
| `X-Timestamp` | 请求时间戳（防重放，±5 分钟有效） |

请求体：
```typescript
{
  externalApprovalId: string;    // 外部系统审批实例 ID
  status: "APPROVED" | "REJECTED" | "CANCELLED" | "DELEGATED";
  reviewerId?: string;           // 审批人 ID（外部系统）
  reviewerName?: string;         // 审批人姓名
  reviewedAt: string;            // 审批时间（ISO 8601）
  comment?: string;              // 审批意见
  attachments?: Array<{          // 审批附件（可选）
    fileName: string;
    fileUrl: string;
  }>;
  rawData?: object;              // 外部系统原始回调数据（存档用）
}
```

响应：
```json
{
  "success": true,
  "message": "审批结果已同步",
  "businessId": "uuid",
  "businessType": "QUOTE"
}
```

逻辑：
1. 验证 HMAC 签名
2. 验证时间戳（防重放攻击）
3. 根据 `externalApprovalId` 查找 `ApprovalRecord`
4. 幂等校验（已处理过的回调直接返回成功）
5. 更新 `ApprovalRecord` 状态
6. 根据 `businessType` 更新对应业务单据：
   - `QUOTE`：更新 `approvalStatus` + `approvalReviewedAt` + `approvalReviewedById` + `approvalComment`
   - `SAMPLE`：更新 `status`（APPROVING → PREPARING 或保持 APPROVING）
   - `EMAIL`：更新 `status`（PENDING_REVIEW → APPROVED/REJECTED）
7. 写入历史记录（`QuoteHistory` / `SampleHistory`）
8. 写入审计日志
9. 触发通知（SSE 推送给前端）

---

**接口 2：供外部系统拉取审批详情**

```
GET /api/approval/inbound/detail/:externalId
```

> ⚠️ 此接口不走 JWT 认证（`@Public()`），通过 API Key 认证。

请求头：
| Header | 说明 |
|--------|------|
| `X-API-Key` | 预共享的 API Key |

响应（根据 businessType 返回不同结构）：

**报价审批详情：**
```json
{
  "businessType": "QUOTE",
  "businessId": "uuid",
  "externalApprovalId": "EXT-20260707-001",
  "applicant": {
    "name": "张三",
    "email": "zhangsan@company.com",
    "team": "华东销售一部"
  },
  "quote": {
    "quoteNo": "QT-2026-0042",
    "customerName": "ABC Corp",
    "productName": "定制铝合金外壳",
    "specification": "200x150x50mm",
    "quantity": 5000,
    "currency": "USD",
    "amount": 25000.00,
    "materialCost": 12000.00,
    "processingCost": 8000.00,
    "taxCost": 1500.00,
    "shippingCost": 2000.00,
    "discountAmount": 500.00,
    "validUntil": "2026-08-07"
  },
  "submittedAt": "2026-07-07T10:00:00Z",
  "submitterComment": "客户要求加急，请尽快审批"
}
```

**样品审批详情：**
```json
{
  "businessType": "SAMPLE",
  "businessId": "uuid",
  "externalApprovalId": "EXT-20260707-002",
  "applicant": { "name": "张三", "email": "..." },
  "sample": {
    "productSummary": "定制铝合金外壳样品",
    "specification": "200x150x50mm",
    "material": "6061铝合金",
    "process": "CNC加工+阳极氧化",
    "sampleQuantity": 5,
    "samplePurpose": "CUSTOMER_TEST",
    "deliveryDeadline": "2026-07-20",
    "initialFees": [
      { "feeType": "SAMPLE_MAKING", "amount": 500, "currency": "USD" }
    ]
  },
  "submittedAt": "2026-07-07T10:00:00Z"
}
```

---

**接口 3：供外部系统拉取审批附件**

```
GET /api/approval/inbound/:externalId/attachments
```

请求头：
| Header | 说明 |
|--------|------|
| `X-API-Key` | 预共享的 API Key |

响应：
```json
{
  "attachments": [
    {
      "id": "uuid",
      "fileName": "报价单-QT-2026-0042.pdf",
      "fileType": "application/pdf",
      "fileSize": 102400,
      "downloadUrl": "https://minio.example.com/...",
      "expiresAt": "2026-07-07T11:00:00Z"
    }
  ]
}
```

---

### 2.4 审批配置接口

> 建议文件：`apps/api/src/modules/settings/approval-config.controller.ts`  
> 前缀：`/api/settings/approval-config`

| # | 方法 | 路径 | 认证要求 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | GET | `/settings/approval-config` | `@RequirePermissions("settings.manage")` | 获取审批路由配置 | P0 |
| 2 | PATCH | `/settings/approval-config` | `@RequireLiveSession` + `@RequirePermissions("settings.manage")` | 更新审批路由配置 | P0 |
| 3 | GET | `/settings/approval-config/test-connection` | `@RequirePermissions("settings.manage")` | 测试外部审批系统连接 | P1 |

---

**接口 1/2：审批路由配置**

配置结构：
```json
{
  "defaultSource": "INTERNAL",
  "externalApiUrl": "https://approval.example.com/api/v1",
  "externalApiKey": "sk-***",
  "webhookSecret": "whsec_***",
  "callbackBaseUrl": "https://crm.example.com/api/approval/inbound",
  "timeoutHours": 72,
  "rules": [
    {
      "businessType": "QUOTE",
      "condition": "amount >= 100000",
      "source": "EXTERNAL",
      "externalFlowId": "flow_quote_large"
    },
    {
      "businessType": "QUOTE",
      "condition": "amount < 100000",
      "source": "INTERNAL",
      "externalFlowId": null
    },
    {
      "businessType": "SAMPLE",
      "condition": "always",
      "source": "EXTERNAL",
      "externalFlowId": "flow_sample"
    }
  ]
}
```

---

### 2.5 用户映射管理接口

> 建议文件：`apps/api/src/modules/settings/sso-mapping.controller.ts`  
> 前缀：`/api/settings/sso-mappings`

| # | 方法 | 路径 | 认证要求 | 说明 | 优先级 |
|---|------|------|----------|------|--------|
| 1 | GET | `/settings/sso-mappings` | `@RequirePermissions("settings.users.manage")` | SSO 用户映射列表 | P0 |
| 2 | POST | `/settings/sso-mappings` | `@RequireLiveSession` + `@RequirePermissions("settings.users.manage")` | 创建映射 | P0 |
| 3 | PATCH | `/settings/sso-mappings/:id` | 同上 | 更新映射 | P1 |
| 4 | DELETE | `/settings/sso-mappings/:id` | 同上 | 删除映射 | P1 |

请求体（创建/更新）：
```json
{
  "ssoUserId": "ext-user-001",
  "ssoEmail": "zhangsan@company.com",
  "localUserId": "uuid",
  "idpName": "企业微信"
}
```

---

## 3. 需要新增的 Prisma 模型

### 3.1 审批记录表

```prisma
model ApprovalRecord {
  id                   String    @id @default(uuid())
  businessType         String    // "QUOTE" | "SAMPLE" | "EMAIL"
  businessId           String    // 关联的业务单据 ID
  approvalSource       String    // "INTERNAL" | "EXTERNAL"
  externalApprovalId   String?   // 外部系统审批实例 ID
  externalFlowId       String?   // 外部系统审批流 ID
  status               String    // "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "DELEGATED"
  submittedAt          DateTime  @default(now())
  submittedById        String    // 提交人
  submittedComment     String?   // 提交意见
  reviewedAt           DateTime?
  reviewedById         String?   // 审批人（本地）
  reviewerName         String?   // 审批人姓名（外部系统）
  reviewComment        String?
  callbackPayload      Json?     // 外部回调原始数据（审计用）
  callbackReceivedAt   DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  submittedBy          User      @relation("ApprovalSubmittedBy", fields: [submittedById], references: [id])
  reviewedBy           User?     @relation("ApprovalReviewedBy", fields: [reviewedById], references: [id])

  @@index([businessType, businessId])
  @@index([externalApprovalId])
  @@index([status])
  @@map("approval_records")
}
```

### 3.2 SSO 用户映射表

```prisma
model SsoUserMapping {
  id              String    @id @default(uuid())
  ssoUserId       String    // 外部系统用户 ID
  ssoEmail        String?   // 外部系统用户邮箱
  localUserId     String    // 本地用户 ID
  idpName         String    // IdP 名称（如 "企业微信"、"钉钉"、"ADFS"）
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  localUser       User      @relation(fields: [localUserId], references: [id])

  @@unique([ssoUserId, idpName])
  @@index([ssoEmail])
  @@map("sso_user_mappings")
}
```

### 3.3 审计日志扩展字段

现有审计日志需增加以下字段以支持外部审批追踪：

```prisma
// 在现有 AuditLog 模型中增加
  externalApprovalId   String?   // 关联外部审批 ID
  approvalSource       String?   // "INTERNAL" | "EXTERNAL"
```

---

## 4. 需要修改的现有接口

### 4.1 报价提交审批（改造）

**现有接口：** `POST /api/quotes/:id/submit-review`  
**改造要点：**

```
当前逻辑：
  校验状态 → 更新 approvalStatus 为 PENDING_APPROVAL → 写历史

改造后逻辑：
  校验状态
  → 查询审批路由配置
  → 如果走内部审批：保持现有逻辑
  → 如果走外部审批：
      → 序列化报价数据
      → 调用外部审批 API
      → 创建 ApprovalRecord
      → 更新 approvalStatus 为 EXTERNAL_PENDING（新增状态）
      → 写历史
```

**需要在 `QuoteApprovalStatus` 枚举中新增：**

```prisma
enum QuoteApprovalStatus {
  DRAFT
  PENDING_APPROVAL
  EXTERNAL_PENDING    // 新增：外部审批中
  APPROVED
  REJECTED
}
```

### 4.2 样品审批（补齐）

**当前缺失：** 样品没有独立的 approve/reject 接口，没有 `approvalStatus` 字段  
**需要补齐：**

| 新增接口 | 方法 | 路径 | 说明 |
|----------|------|------|------|
| 提交样品审批 | POST | `/samples/:id/submit-review` | 与报价对齐 |
| 样品审批通过 | POST | `/samples/:id/approve` | 与报价对齐 |
| 样品审批驳回 | POST | `/samples/:id/reject` | 与报价对齐 |

**需要在 `SampleRequest` 模型中新增：**

```prisma
  approvalStatus          String?   @default("DRAFT")  // QuoteApprovalStatus
  approvalComment         String?
  approvalSubmittedAt     DateTime?
  approvalSubmittedById   String?
  approvalReviewedAt      DateTime?
  approvalReviewedById    String?
```

### 4.3 Auth 模块（扩展）

**`RequestUser` 类型需扩展：**

```typescript
export type RequestUser = {
  id: string;
  organizationId: string;
  name?: string;
  email?: string;
  teamId?: string;
  roleCodes: string[];
  permissions: string[];
  dataScope: "SELF" | "TEAM" | "ALL";
  sessionId?: string;
  permissionVersion?: number;
  tokenType?: "access" | "refresh";
  authSource?: "LOCAL" | "SSO";    // 新增：认证来源
  idpName?: string;                 // 新增：IdP 名称
};
```

---

## 5. 环境变量清单

### 5.1 已有环境变量（保持不变）

```env
DATABASE_URL=...
REDIS_URL=...
JWT_SECRET=...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
MINIO_ENDPOINT=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
EMAIL_REVIEW_REQUIRED=true
```

### 5.2 待新增环境变量

```env
# ── SSO 单点登录 ──────────────────────────────────────
SSO_ENABLED=false                          # 是否启用 SSO
SSO_PROVIDER=OIDC                          # 协议：OIDC | SAML | CAS
SSO_ISSUER_URL=                            # IdP 发现地址
SSO_CLIENT_ID=                             # 客户端 ID
SSO_CLIENT_SECRET=                         # 客户端密钥
SSO_CALLBACK_URL=                          # 回调地址，如 http://localhost:4100/api/auth/sso/callback
SSO_SCOPES=openid,profile,email            # 请求的 scope
SSO_SIGNING_ALGORITHM=RS256                # JWT 签名算法
SSO_JWKS_URL=                              # IdP 的 JWKS 地址（OIDC）

# ── 外部审批系统 ──────────────────────────────────────
APPROVAL_SOURCE=INTERNAL                   # 默认审批来源：INTERNAL | EXTERNAL | HYBRID
APPROVAL_EXTERNAL_URL=                     # 外部审批系统 API 地址
APPROVAL_EXTERNAL_API_KEY=                 # API Key（供外部系统调用本系统）
APPROVAL_WEBHOOK_SECRET=                   # Webhook HMAC 密钥
APPROVAL_CALLBACK_BASE_URL=                # 回调基础 URL，如 https://crm.example.com/api/approval/inbound
APPROVAL_TIMEOUT_HOURS=72                  # 审批超时时间
APPROVAL_AMOUNT_THRESHOLD=100000           # 报价金额阈值（超过走外部审批）
```

---

## 6. 接口总览

### 按模块分类

| 模块 | 已实现 | 待实现 | 总计 |
|------|--------|--------|------|
| 认证（Auth） | 4 | 4（SSO） | 8 |
| 报价审批 | 9 | 0（改造 1 个） | 9 |
| 样品审批 | 6 | 3（补齐接口） | 9 |
| 邮件审批 | 3 | 0 | 3 |
| 外部审批推送 | 0 | 3 | 3 |
| 外部审批回调 | 0 | 3 | 3 |
| 审批配置 | 0 | 3 | 3 |
| 用户映射 | 0 | 4 | 4 |
| 权限角色 | 7 | 0 | 7 |
| 审计日志 | 1 | 0 | 1 |
| 历史追踪 | 2 | 0 | 2 |
| **合计** | **32** | **20** | **52** |

### 按优先级分类

| 优先级 | 接口数 | 说明 |
|--------|--------|------|
| P0 | 12 | SSO 回调、审批推送/回调、审批配置、样品审批补齐、用户映射 |
| P1 | 6 | SSO 登出、审批状态查询/撤回、附件拉取、连接测试 |
| P2 | 2 | SAML 元数据、SSO 登出扩展 |

---

## 7. 对接架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React SPA)                          │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ 登录页   │  │ 报价页   │  │ 样品页   │  │ 邮件审批页   │    │
│  │          │  │          │  │          │  │              │    │
│  │ [SSO登录]│  │ [提交审批]│  │ [提交审批]│  │ [提交审核]  │    │
│  │ [本地登录]│  │          │  │          │  │              │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       │              │              │               │            │
└───────┼──────────────┼──────────────┼───────────────┼────────────┘
        │              │              │               │
        ▼              ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NestJS API (apps/api)                        │
│                                                                  │
│  ┌─────────────┐  ┌──────────────────────────────────────────┐  │
│  │ Auth Module  │  │         Approval Service                 │  │
│  │             │  │                                          │  │
│  │ ┌─────────┐│  │  ┌──────────────┐  ┌──────────────────┐ │  │
│  │ │Local JWT ││  │  │ 路由决策引擎  │  │ ApprovalRecord   │ │  │
│  │ │ Login    ││  │  │              │  │ (Prisma)         │ │  │
│  │ └─────────┘│  │  │ amount > 阈值 │  └──────────────────┘ │  │
│  │             │  │  │ → EXTERNAL   │                        │  │
│  │ ┌─────────┐│  │  │ → INTERNAL   │  ┌──────────────────┐ │  │
│  │ │ SSO     ││  │  └──────┬───────┘  │ History + Audit  │ │  │
│  │ │ OIDC/   ││  │         │          │ (写入)            │ │  │
│  │ │ SAML    ││  │         ▼          └──────────────────┘ │  │
│  │ └─────────┘│  │  ┌──────────────┐                        │  │
│  │             │  │  │ 外部系统适配  │                        │  │
│  │ ┌─────────┐│  │  │ HTTP Client  │                        │  │
│  │ │ SsoUser ││  │  └──────┬───────┘                        │  │
│  │ │ Mapping ││  │         │                                 │  │
│  │ └─────────┘│  └─────────┼────────────────────────────────┘  │
│  └─────────────┘            │                                    │
│                             │                                    │
│  ┌──────────────────────────┼──────────────────────────────────┐│
│  │ Callback Controller      │                                  ││
│  │                          │                                  ││
│  │ POST /approval/inbound/callback  (签名验证)                 ││
│  │ GET  /approval/inbound/detail    (API Key 认证)             ││
│  │ GET  /approval/inbound/attachments                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
        │                                      ▲
        │ SSO 登录                               │ 审批回调
        ▼                                      │
┌──────────────┐                    ┌───────────────────────┐
│   IdP        │                    │   外部审批系统         │
│  (企业微信/  │                    │                       │
│   钉钉/ADFS) │                    │  POST /callback       │
│              │                    │  GET  /detail         │
│  OIDC/SAML   │                    │  GET  /attachments    │
└──────────────┘                    └───────────────────────┘
```

---

## 8. 下一步行动

| 阶段 | 内容 | 预计工作量 |
|------|------|------------|
| 1 | 抽象审批层为独立 `ApprovalService`，解耦现有报价/邮件审批逻辑 | 中 |
| 2 | 新增 `ApprovalRecord` 和 `SsoUserMapping` Prisma 模型并迁移 | 低 |
| 3 | 实现 SSO 回调接口（先做 OIDC） | 中 |
| 4 | 实现外部审批推送 + 回调接口 | 中 |
| 5 | 补齐样品审批接口（submit-review / approve / reject） | 低 |
| 6 | 前端适配（SSO 登录按钮、审批状态展示） | 中 |
| 7 | 联调测试 + 降级策略验证 | 中 |
