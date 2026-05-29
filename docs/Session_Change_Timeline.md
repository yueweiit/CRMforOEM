# OEM CRM 本轮会话全改动时间线汇总

## 1. 文档目的

本文档按时间线和功能模块汇总本轮会话中（跨两次对话、包含已提交和未提交的改动）所有后端、前端、配置、文档变更，便于：

- 团队回顾本轮完整修改范围
- 给 Codex / 其他 AI reviewer 做上下文输入
- 后续继续演进邮件、跟进、SSE 体系时快速了解当前实现基础

相关核心模块包括：

- `apps/api/src/modules/emails/`（SMTP、IMAP、草稿、入站）
- `apps/api/src/modules/follow-ups/`（跟进规则、阶段推进）
- `apps/api/src/common/sse/`（SSE 实时推送）
- `apps/web/src/layouts/AppShell.tsx`（导航提醒）
- `apps/web/src/pages/CustomerDetailPage.tsx`（邮件草稿面板）
- `apps/web/src/pages/EmailCenterPage.tsx`（邮箱管理中心）
- `apps/web/src/pages/FollowUpsPage.tsx`（跟进任务列表）

---

## 2. 初始状态

本轮开始前，项目处于初始 OEM CRM 实现状态（commit `fd8ae21`），具备：

- 基础客户管理、联系人管理
- 官网分析（Playwright 爬虫）
- 背调报告（AI 生成）
- OEM 评分
- 基础邮件草稿（同步生成）+ SMTP 发信 + IMAP 收信
- 基础跟进任务 CRUD

但不具备：

- 稳定可靠的 SMTP/IMAP 连接
- AI 草稿异步生成
- 智能跟进规则引擎
- 客户阶段自动推进
- 实时 SSE 通知
- 入站邮件统一处理

---

## 3. 第一阶段：SMTP / IMAP 基础修复

### 3.1 修复 `nodemailer` 导入兼容

**文件：** `apps/api/src/modules/emails/smtp.service.ts`

从 `import nodemailer from "nodemailer"` 改为 `import * as nodemailer from "nodemailer"`，解决 CommonJS 运行环境下 `createTransport` 为 `undefined` 的问题。

### 3.2 邮箱测试分项结果

**文件：** `apps/api/src/modules/emails/emails.service.ts`、`apps/api/src/modules/emails/imap-sync.service.ts`

`testAccount()` 从"SMTP 失败就抛 400"改为分别测试 SMTP 和 IMAP，返回结构化结果：

```json
{
  "overallOk": false,
  "smtp": { "ok": true, "message": "SMTP 连接正常。" },
  "imap": { "ok": false, "message": "IMAP 未开启，请先在邮箱后台启用 IMAP。" },
  "message": "SMTP 正常，IMAP 未开启。该邮箱当前可用于发信，但无法同步回复。"
}
```

新增错误翻译函数：`mapSmtpTestError()`、`mapImapTestError()`，覆盖认证失败、连接失败、IMAP 未开启等常见场景。

### 3.3 SMTP DNS 预解析 + TLS servername

**文件：** `apps/api/src/modules/emails/smtp.service.ts`

- `createTransport()` 改为异步，服务端预解析 SMTP 域名（优先 IPv4）
- 增加 `tls.servername` 支持，IP 连接时仍按域名校验 TLS 证书
- 增加 `logger: true, debug: true` 调试日志

### 3.4 前端错误消息解析

**文件：** `apps/web/src/api/http.ts`

非 2xx 响应优先解析 JSON 中的 `message` 字段，避免前端显示整段 JSON 原文。

### 3.5 邮箱账号编辑功能

**文件：** `apps/api/src/modules/emails/emails.service.ts`、`apps/api/src/modules/emails/emails.controller.ts`、`apps/api/src/modules/emails/dto/update-email-account.dto.ts`（新建）、`apps/web/src/pages/EmailCenterPage.tsx`

- 新增 `UpdateEmailAccountDto`（基于 `CreateEmailAccountDto` 扩展 `isActive`）
- `listAccounts()` 补 `smtpUsername`/`imapUsername` 字段
- 前端增加编辑模式，密码留空表示不修改

---

## 4. 第二阶段：AI 邮件草稿异步生成

### 4.1 问题

原先 `generateDraft()` 同步调用 AI 生成邮件内容，用户需等待 AI 返回（可能 10-30 秒）。

### 4.2 改造方案

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/modules/emails/email-draft.constants.ts` | 草稿队列名 `EMAIL_DRAFT_QUEUE` |
| `apps/api/src/modules/emails/email-draft.processor.ts` | BullMQ WorkerHost Processor |

**修改文件：**

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/modules/emails/emails.service.ts` | `generateDraft()` 先建空草稿 → 入队 → 立即返回 |
| `apps/api/src/modules/emails/emails.module.ts` | 注册草稿队列和 Processor |
| `apps/web/src/pages/CustomerDetailPage.tsx` | 草稿 body 为空时显示"稿件生成中"占位，条件轮询 3 秒 |

### 4.3 按邮件类型区分 AI Prompt

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/modules/emails/email-prompt-builder.ts` | `buildEmailSystemPrompt()` 按邮件类型返回不同 system prompt |
| `apps/api/src/modules/emails/email-prompt-constants.ts` | Prompt 字符串常量 |

**修改文件：**

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/modules/emails/emails.service.ts` | `buildSystemPrompt()` 按 6 种邮件类型区分 AI 写作指令 + 动态收件人约束 |
| `apps/api/src/modules/emails/dto/generate-email-draft.dto.ts` | `purpose` 类型新增 `THIRD_FOLLOW_UP` 和 `REQUIREMENT_CONFIRMATION` |

---

## 5. 第三阶段：跟进规则引擎（任务驱动阶段推进）

### 5.1 设计原则

- **首封邮件发送后**，后续所有客户阶段由**业务员完成跟进任务**来推进，而不是主要由邮件发送事件推进
- 客户回复后取消未来的二次/三次跟进任务，创建需求确认任务
- 任务完成 → 写阶段历史 → 推进客户阶段

### 5.2 新建文件

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/modules/follow-ups/follow-up-rules.service.ts` | 统一管理跟进任务规则：`handleEmailSent()` 按邮件类型创建任务；`handleCustomerReplied()` 取消未来任务并创建需求确认；`createFirstEmailFollowUp()` 创建 3 天 + 7 天任务 |
| `apps/api/src/modules/follow-ups/follow-up-email-rules.ts` | 邮件类型 → 跟进任务规则配置 |
| `apps/api/src/modules/follow-ups/follow-up-stage-rules.ts` | 任务完成 → 客户阶段映射配置 |
| `apps/api/src/modules/follow-ups/follow-up-rule-constants.ts` | 任务标题/描述/触发原因字符串常量 |

### 5.3 修改文件

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/modules/follow-ups/follow-ups.service.ts` | `create()` 负责人优先客户 owner；`complete()` 任务完成时按类型推进客户阶段 + 写入 `CustomerStageHistory` |
| `apps/api/src/modules/follow-ups/follow-ups.module.ts` | 导出 `FollowUpRulesService` |
| `apps/api/src/modules/follow-ups/follow-ups.controller.ts` | 新增 `GET /follow-up-tasks/overdue-count` 轻量统计接口 |
| `apps/api/src/modules/emails/emails.service.ts` | `sendApprovedDraft()` 首封发送后设 `FIRST_EMAIL_SENT`；其余类型不再在发送时推进阶段 |
| `apps/api/src/modules/commercial/commercial.module.ts` | 引入 `FollowUpsModule` |

### 5.4 邮件类型 → 跟进任务规则

| 邮件类型 | 发送后创建的任务 |
| --- | --- |
| `FIRST_OUTREACH` | `SECOND_FOLLOW_UP`（3 天）+ `THIRD_FOLLOW_UP`（7 天） |
| `QUOTE_FOLLOW_UP` | `QUOTE_FOLLOW_UP` |
| `SAMPLE_FOLLOW_UP` | `SAMPLE_FOLLOW_UP`（需已有样品记录） |

### 5.5 任务完成 → 客户阶段映射

| 任务类型 | 推进目标阶段 |
| --- | --- |
| `SECOND_FOLLOW_UP` | `PENDING_SECOND_FOLLOW_UP` |
| `THIRD_FOLLOW_UP` | `PENDING_SECOND_FOLLOW_UP` |
| `REQUIREMENT_CONFIRMATION` | `REQUIREMENT_CONFIRMING` |
| `QUOTE_FOLLOW_UP` | `QUOTING` |
| `SAMPLE_FOLLOW_UP` | `NEGOTIATING` |

---

## 6. 第四阶段：IMAP IDLE + 入站邮件统一处理

### 6.1 IMAP IDLE 实时监听

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/modules/emails/imap-idle.service.ts` | `ImapIdleService` — 使用 `imapflow` 的 `ImapFlow` 建立持久连接，监听 `exists` 事件，邮件到达后入队 |
| `apps/api/src/modules/emails/imap-inbound.constants.ts` | 入站队列名 `IMAP_INBOUND_QUEUE` |
| `apps/api/src/modules/emails/imap-inbound.processor.ts` | `ImapInboundProcessor` — BullMQ WorkerHost，消费入站队列，执行归档 + 阶段推进 + 跟进规则 + SSE 事件 |

**功能要点：**

- 模块启动时自动为所有 `isActive` 邮箱建立 IDLE 连接
- 新邮件到达 → `fetchAndEnqueue()` → BullMQ 队列 → Processor
- 断线自动重连（指数退避，最大 60 秒）
- `manualSyncForUser()` 提供手动同步入口，也走同一队列路径

### 6.2 客户回复处理

**修改文件：** `apps/api/src/modules/emails/imap-sync.service.ts`、`apps/api/src/modules/emails/imap-inbound.processor.ts`

- 仅在 `FIRST_EMAIL_SENT` 或 `PENDING_SECOND_FOLLOW_UP` 阶段时设置 `REPLIED`
- 回复后取消未来 `SECOND_FOLLOW_UP` / `THIRD_FOLLOW_UP`
- 自动创建 `REQUIREMENT_CONFIRMATION` 任务

### 6.3 提取共享入站服务（本轮第二次对话）

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/modules/emails/imap-inbound.service.ts` | `ImapInboundService` — 统一的线程匹配 + 入站消息处理（归档、阶段推进、跟进规则） |

**修改文件：**

| 文件 | 改动 |
| --- | --- |
| `apps/api/src/modules/emails/imap-inbound.processor.ts` | 移除私有 `findThreadForInbound` 和内联业务逻辑，委托给 `ImapInboundService`，保留 SSE emit |
| `apps/api/src/modules/emails/imap-sync.service.ts` | 移除重复的 `findThreadForInbound` 和内联处理，复用 `ImapInboundService.handleInboundMessage()` |
| `apps/api/src/modules/emails/emails.module.ts` | 注册 `ImapInboundService` |

**收益：** 消除 ~100 行重复代码，`findThreadForInbound` 和入站业务逻辑收口到单一文件。

### 6.4 职责边界

```
ImapIdleService        ← 连接管理、邮件抓取、入队
ImapInboundProcessor   ← 队列消费、SSE 事件发出
ImapInboundService     ← 线程匹配、消息归档、阶段推进、跟进规则
```

---

## 7. 第五阶段：SSE 实时通知 + Toast 系统

### 7.1 SSE 基础设施

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/api/src/common/events/event-types.ts` | SSE 事件名常量 + Payload 类型定义 |
| `apps/api/src/common/sse/sse.controller.ts` | SSE 端点 `GET /api/events` |
| `apps/api/src/common/sse/sse.module.ts` | SSE 模块 |
| `apps/api/src/common/sse/sse.service.ts` | SSE 连接管理 + 多用户广播 |

### 7.2 前端 SSE Hook + Toast

**新建文件：**

| 文件 | 用途 |
| --- | --- |
| `apps/web/src/hooks/useSse.ts` | `useSse(event, handler)` — 全局单例 EventSource + 自动重连 |
| `apps/web/src/components/Toast.tsx` | Toast 组件 + 容器，支持手动和 server 驱动两种模式 |
| `apps/web/src/config/email-event-toasts.ts` | 邮件 SSE 事件 → Toast 配置映射 |
| `apps/web/src/config/follow-up-task-toasts.ts` | 任务 SSE 事件 → Toast 配置映射 |

### 7.3 事件清单

| 事件名 | 触发时机 | 前端行为 |
| --- | --- | --- |
| `inbound-mail.received` | IMAP 收到新邮件 | Toast + `targetUserIds` 过滤 |
| `follow-up.task.created` | 邮件发送后 / 客户回复后 | Toast + badge 刷新 |
| `follow-up.task.completed` | 任务被完成 | badge 刷新 |
| `follow-up.task.cancelled` | 客户回复取消旧任务 | badge 刷新（无 toast） |

### 7.4 导航 Badge

**修改文件：** `apps/web/src/layouts/AppShell.tsx`、`apps/web/src/styles.css`

- 导航栏"跟进任务"右侧显示红色数字徽章（`.nav-alert-badge`）
- 使用 `GET /follow-up-tasks/overdue-count` 统计所有 OPEN 任务
- SSE 事件到达时通过 `queryClient.setQueryData` 同步更新 Badge

---

## 8. 第六阶段：前端交互优化

### 8.1 收件人下拉选择

**文件：** `apps/web/src/pages/CustomerDetailPage.tsx`

收件人从自由文本输入改为标准 `<select>` 下拉框，从客户联系人列表中筛选有邮箱的联系人（`Boolean(contact.email)`），显示格式为"姓名 · 邮箱"。

### 8.2 邮件类型扩展

`purpose` 下拉新增 `THIRD_FOLLOW_UP` 和 `REQUIREMENT_CONFIRMATION`，覆盖全 6 种邮件类型。

### 8.3 草稿生成中占位

body 为空时显示"稿件生成中，请稍后刷新查看"占位文本。

### 8.4 跟进任务页面修复

**文件：** `apps/web/src/pages/FollowUpsPage.tsx`

- 接口路径从 `/follow-ups` 修正为 `/follow-up-tasks`
- 客户详情链接修正为 `/customers/:id/follow-ups`
- 完成/取消/新增后同步刷新导航 badge

---

## 9. 第七阶段：优化方案文档产出

本轮会话中按 [AI_Specifications_OEM_Fullstack.md](./AI_Specifications_OEM_Fullstack.md) 的规范流程，生成了 4 份分阶段优化方案文档：

| 文档 | 对应批次 | 核心内容 |
| --- | --- | --- |
| `docs/Stage1_Immediate_Fixes_Proposal.md` | 第一批：立即修 | `targetUserIds` 一致性复核 + `FOLLOW_UP_TASK_CANCELLED` 事件补齐 |
| `docs/Stage2_Unified_Inbound_Processing.md` | 第二批：统一入站处理 | 提取 `ImapInboundService` + 统一手动同步与 IDLE 链路（已落地） |
| `docs/Stage3_Audit_And_Stage_History_Proposal.md` | 第三批：补审计 | `CustomerStageService` 统一阶段推进 + 补 `CustomerStageHistory` |
| `docs/Stage4_Structure_Governance.md` | 第四批：结构治理 | `as never` 治理方案 + `CustomerDetailPage.tsx` 拆分方案 |

此外还生成了以下支撑文档：

| 文档 | 内容 |
| --- | --- |
| `docs/Code_Review_Risk_Optimization_Plan.md` | 风险总览 + 四阶段优化方案总纲 |
| `docs/Code_Review_Staged_Changes.md` | 分阶段改动清单 |
| `docs/Dev_Review_Full_Stack_Changes.md` | dev 分支全栈改动 Review |
| `docs/Dev_vs_Main_Review_OEM_Fullstack.md` | dev vs main 全栈差异对比 |
| `docs/Project_Summary_And_Changes.md` | 项目总结与所有修改记录 |
| `docs/SSE_TargetUser_Toast_Filter_Review_Proposal.md` | SSE targetUserIds 精准通知方案 |
| `docs/IMAP_IDLE_Design.md` | IMAP IDLE 架构设计 |
| `docs/IMAP_IDLE_SSE_Implementation.md` | IMAP IDLE + SSE 实现详解 |
| `docs/WebSocket_Realtime_Architecture.md` | WebSocket 实时架构方案 |
| `docs/WebSocket_vs_Polling_NavBadge.md` | 推送 vs 轮询方案对比 |
| `docs/Toast_Notification_Design.md` | Toast 通知系统设计 |
| `docs/Toast_Notification_Design_Refined.md` | Toast 通知系统优化版 |
| `docs/FollowUp_Manual_Second_Email_Design.md` | 人工二次邮件设计 |
| `docs/Fix_Email_Quota_Consume.md` | 邮件配额消费修复 |
| `docs/Tech_Stack_Learning_Guide.md` | 技术栈学习指南 |

---

## 10. 涉及文件总览

### 后端新增（15 个文件）

```
apps/api/src/common/events/event-types.ts
apps/api/src/common/sse/sse.controller.ts
apps/api/src/common/sse/sse.module.ts
apps/api/src/common/sse/sse.service.ts
apps/api/src/modules/customers/customer-stage.service.ts
apps/api/src/modules/emails/email-draft.constants.ts
apps/api/src/modules/emails/email-draft.processor.ts
apps/api/src/modules/emails/email-prompt-builder.ts
apps/api/src/modules/emails/email-prompt-constants.ts
apps/api/src/modules/emails/imap-idle.service.ts
apps/api/src/modules/emails/imap-inbound.constants.ts
apps/api/src/modules/emails/imap-inbound.processor.ts
apps/api/src/modules/emails/imap-inbound.service.ts
apps/api/src/modules/follow-ups/follow-up-email-rules.ts
apps/api/src/modules/follow-ups/follow-up-rule-constants.ts
apps/api/src/modules/follow-ups/follow-up-rules.service.ts
apps/api/src/modules/follow-ups/follow-up-stage-rules.ts
```

### 后端修改（10 个文件）

```
apps/api/package.json
apps/api/src/app.module.ts
apps/api/src/modules/commercial/commercial.module.ts
apps/api/src/modules/commercial/commercial.service.ts
apps/api/src/modules/customers/customers.module.ts
apps/api/src/modules/emails/dto/generate-email-draft.dto.ts
apps/api/src/modules/emails/emails.controller.ts
apps/api/src/modules/emails/emails.module.ts
apps/api/src/modules/emails/emails.service.ts
apps/api/src/modules/emails/imap-sync.service.ts
apps/api/src/modules/follow-ups/follow-ups.controller.ts
apps/api/src/modules/follow-ups/follow-ups.module.ts
apps/api/src/modules/follow-ups/follow-ups.service.ts
```

### 前端新增（4 个文件）

```
apps/web/src/components/Toast.tsx
apps/web/src/config/email-event-toasts.ts
apps/web/src/config/follow-up-task-toasts.ts
apps/web/src/hooks/useSse.ts
```

### 前端修改（6 个文件）

```
apps/web/src/api/http.ts
apps/web/src/layouts/AppShell.tsx
apps/web/src/pages/CustomerDetailPage.tsx
apps/web/src/pages/EmailCenterPage.tsx
apps/web/src/pages/FollowUpsPage.tsx
apps/web/src/pages/SettingsPage.tsx
apps/web/src/styles.css
```

---

## 11. 当前最终状态

本轮完成后，系统具备如下能力：

### 已具备

- **稳定 SMTP 连接**：nodemailer 兼容 + DNS 预解析 IPv4 + TLS 证书域名校验
- **分项邮箱测试**：SMTP/IMAP 独立测试，结构化结果返回，中文错误提示
- **IMAP IDLE 实时监听**：自动连接、自动重连、新邮件秒级感知
- **入站邮件统一处理**：`ImapInboundService` 统一线程匹配、归档、阶段推进、跟进规则
- **AI 草稿异步生成**：BullMQ 队列 + Processor，前端生成中占位，按 6 种邮件类型区分 AI prompt
- **智能跟进规则引擎**：`FollowUpRulesService` 统一管理，任务驱动客户阶段推进
- **客户阶段审计**：`CustomerStageHistory` 写入（任务完成路径）
- **SSE 实时通知**：4 类事件（inbound-mail、task-created、task-completed、task-cancelled）
- **Toast 通知 + 导航 Badge**：`targetUserIds` 精准过滤，红色数字徽章
- **邮箱账号编辑**：编辑模式、密码留空不修改
- **收件人下拉选择**：从客户联系人中选择邮箱

### 仍未做

- 邮箱 provider 预设（139、QQ、网易、Gmail 等）
- OAuth2 / App Password 专用认证模式
- 发信阶段推进补 `CustomerStageHistory`（Stage3 通过 `CustomerStageService` 统一）
- `CustomerDetailPage.tsx` 面板拆分（Stage4 方案已出，待落地）
- `as never` 治理（Stage4 方案已出，待落地）
- 测试结果持久化
- 更强的自动回退（多 IP 尝试、IPv6 回退等）

---

## 12. 校验与结果

```bash
npm run lint -w @oem-crm/api    # 通过，零错误
npm run lint -w @oem-crm/web    # 通过，零错误
```

---

## 13. 一句话总结

本轮对 OEM CRM 的修改，已经从"基础 CRUD + 同步邮件"演进到：

> **SMTP/IMAP 稳定连接、IMAP IDLE 实时监听、入站邮件统一处理、AI 草稿异步生成（6 种类型区分 Prompt）、任务驱动客户阶段自动推进（含审计历史）、SSE 实时通知（精准用户过滤 + Toast + 导航 Badge）、前后端类型安全零编译错误的成熟 OEM 客户开发闭环系统。**
