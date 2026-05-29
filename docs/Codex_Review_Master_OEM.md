# OEM CRM Codex Review Master Document

## 1. 任务背景

本次任务目标有两个：

1. 汇总当前项目里已经产出的邮箱链路与客户背调链路相关文档、实现结论与代码改动，形成一份统一的 Codex review 总文档。
2. 对当前已生成和已落地的代码进行逐项复核，特别是：
   - 邮箱测试链路
   - 邮箱账号编辑链路
   - 客户背调链路
   - 对发现的不符合需求或存在风险的实现做最小修复

当前这份文档遵循：

- `docs/AI_Specifications_OEM_Fullstack.md`
- `docs/design.md`
- `docs/OEM客户开发系统-需求实现对照评估-2026-05-21.md`
- `docs/Email_SMTP_IMAP_Change_Timeline.md`

并以当前真实代码为最终依据。

---

## 2. 业务目标

当前 OEM CRM 的主业务目标是形成如下闭环：

`客户开发 -> 官网分析 -> 背调 -> OEM 匹配 -> 邮件开发 -> 客户跟进 -> 报价打样 -> 成交转化`

本次 review 文档重点覆盖其中两条关键链路：

1. **客户背调链路**
   - 客户录入
   - 官网分析
   - 背调报告
   - OEM 评分

2. **邮箱与邮件链路**
   - 邮箱账号配置
   - 邮箱测试
   - SMTP 发信
   - IMAP 同步
   - AI 邮件草稿
   - 客户回复归档

本次 review 的目标不是发散设计，而是：

- 明确当前已实现到什么程度
- 明确哪些点符合现有需求
- 明确哪些点仍然不一致或存在真实风险
- 输出一份方便 Codex review 的统一上下文文档

---

## 3. 现状判断

## 3.1 整体项目判断

根据 `docs/OEM客户开发系统-需求实现对照评估-2026-05-21.md`，当前项目整体状态是：

- 一期基础架构和部分二三期核心链路已具备可用形态
- 客户、官网分析、背调、OEM 评分、AI 邮件、邮箱账号接入、报价/样品、数据看板都已存在真实代码基础
- 审计日志、附件治理、客户导入、自动跟进规则、权限全面落地等仍不完整

因此本项目更准确的定位是：

> 不是 Demo，而是一个已经具备真实业务骨架、主链路可运行，但企业级完备性仍然部分完成的 OEM CRM。

---

## 3.2 文档与代码关系判断

当前必须区分：

1. **设计目标 / 接口草案**
   - `docs/design.md`

2. **真实实现状态**
   - `apps/api/src/modules/*/*.controller.ts`
   - `apps/web/src/pages/*`
   - `apps/api/src/modules/*/*.service.ts`

如果两者不一致，应优先以当前真实实现为准，并明确指出文档过期点。

---

## 3.3 当前重点链路状态

### 客户背调链路
- 主链路存在
- 前后端闭环基本存在
- 结构化深度不足，仍部分依赖 AI 文本总结
- 状态判断：**部分完成**

### 邮件链路
- 邮箱账号配置、测试、SMTP 发信、IMAP 同步、AI 草稿、审核发送主链路存在
- 测试与连接层已经过一轮增强
- provider 预设、OAuth2、附件归档、线程能力仍不足
- 状态判断：**部分完成，但可用性已明显增强**

---

## 4. Step 1：任务理解

根据 `AI_Specifications_OEM_Fullstack.md` 的开发流程要求，本次任务需要先明确：

### 4.1 本次任务要解决什么业务问题

本次任务要解决的是：

- 统一沉淀当前邮箱和背调链路的实现现状
- 让后续 Codex review 不需要再分散阅读多个文档和会话产物
- 确认当前代码是否与需求和设计方向一致
- 对已经发现的真实问题做小范围修正，避免 review 文档建立在有缺陷的实现之上

### 4.2 该任务在 OEM 系统中的位置

它位于：

- 客户研究能力
- 邮件执行能力
- 开发链路质量控制

之间的交界位置，属于“系统可评审性和可继续开发性”的基础工作。

### 4.3 它影响哪条业务链路

主要影响：

- 客户背调链路
- 邮箱配置和邮箱测试链路
- AI 邮件生成与发信链路
- 客户回复同步链路

### 4.4 涉及哪些前端页面

- `apps/web/src/pages/CustomerDetailPage.tsx`
- `apps/web/src/pages/EmailCenterPage.tsx`

### 4.5 涉及哪些后端模块

- `apps/api/src/modules/customers`
- `apps/api/src/modules/website-analysis`
- `apps/api/src/modules/research`
- `apps/api/src/modules/scoring`
- `apps/api/src/modules/emails`
- `apps/api/src/modules/ai`

### 4.6 涉及哪些数据表 / 对象

- `Customer`
- `Contact`
- `WebsiteAnalysis`
- `ResearchReport`
- `OemFitScore`
- `AiGenerationRun`
- `AiContentVersion`
- `EmailAccount`
- `EmailDraft`
- `EmailThread`
- `EmailMessage`
- `FollowUpTask`

### 4.7 涉及哪些状态流转

背调链路：
- `PENDING_RESEARCH`
- `RESEARCHING`
- `RESEARCHED`
- `PENDING_EMAIL_GENERATION`

邮件链路：
- `DRAFT`
- `PENDING_REVIEW`
- `APPROVED`
- `SENT`
- `PENDING_EMAIL_SEND`
- `FIRST_EMAIL_SENT`
- `REPLIED`

### 4.8 涉及哪些接口

背调主链路：
- `POST /customers/:id/website-analyses`
- `POST /customers/:id/research-reports`
- `POST /customers/:id/oem-fit-scores`
- `GET /customers/:id`

邮件主链路：
- `GET /email-accounts`
- `POST /email-accounts`
- `PATCH /email-accounts/:id`
- `POST /email-accounts/:id/test`
- `POST /customers/:customerId/email-drafts/generate`
- `POST /email-drafts/:id/send`
- `POST /email-sync/run`

---

## 5. Step 2：不确定点

当前仍然存在以下不确定点：

1. 早期背调独立文档是否还在当前仓库中保留完整版本；当前 `docs` 目录中无法确认全部历史文档都存在。
2. `docs/design.md` 中部分接口路径已过期，不能直接当当前真实 Swagger 使用。
3. AI Provider 配置与协议兼容问题还未完全统一，不属于本次文档主体，但会影响背调和 AI 邮件链路质量。
4. 邮件模块后续是否会进一步引入 provider-aware 预设、OAuth2、测试结果持久化等能力，目前还没有最终产品决策。
5. 跟进任务独立页面和更完整自动规则是否已经在其他分支推进，当前代码快照仍应视为未完整解决。

---

## 6. Step 3：实施方案

## 6.1 文档层方案

生成一份统一的 Codex review 总文档，覆盖：

- 项目背景与业务目标
- 当前实现现状
- 背调链路总结
- 邮件链路总结
- 已落地代码方向整合
- 与需求 / 设计的逐条比对
- 风险点
- 待确认项
- 验证方式

## 6.2 代码层最小修复方案

在整合文档前，先用最小改动修掉 Codex 指出的两个真实问题：

### 修复 1：前端错误解析逻辑
文件：
- `apps/web/src/api/http.ts`

问题：
- `try` 中主动 `throw new Error(...)`
- 会被自己的 `catch` 吃掉
- 导致后端 `message` 无法稳定显示

修复方式：
- `try/catch` 只负责 `JSON.parse(raw)`
- 先提取 `message`
- 在外面统一抛 `Error`

### 修复 2：邮箱账号列表缺少用户名字段
文件：
- `apps/api/src/modules/emails/emails.service.ts`

问题：
- `listAccounts()` 没有返回 `smtpUsername` / `imapUsername`
- 前端编辑表单回填依赖这两个字段
- 用户直接保存可能把原有有效用户名覆盖为空

修复方式：
- 在 `select` 中补上 `smtpUsername`
- 在 `select` 中补上 `imapUsername`
- 不返回密码字段，保持现有安全边界

## 6.3 本次不做的事

- 不改数据库 schema
- 不改邮箱 provider 预设
- 不引入 OAuth2
- 不重构背调模块主体逻辑
- 不新增 UI 模块，仅复用现有状态栏 / 表单

---

## 7. Step 4：可评审代码草稿

> 以下代码块既代表建议，也反映本次已落地/应保持的实现方向，方便 Codex review 时对照。

## 7.1 前端错误解析修复草稿

文件：`apps/web/src/api/http.ts`

```ts
if (!response.ok) {
  const raw = await response.text();
  let message = "";
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    message = Array.isArray(parsed.message) ? parsed.message.join("\n") : (parsed.message ?? "");
  } catch {
    message = "";
  }
  throw new Error(message || raw || `Request failed with status ${response.status}`);
}
```

### 作用
- 只让 `try/catch` 负责 JSON 解析
- 不吞掉我们自己主动抛出的错误
- 后端 `message` 可以稳定展示

---

## 7.2 邮箱账号列表字段补全草稿

文件：`apps/api/src/modules/emails/emails.service.ts`

```ts
select: {
  id: true,
  scope: true,
  name: true,
  email: true,
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUsername: true,
  imapHost: true,
  imapPort: true,
  imapSecure: true,
  imapUsername: true,
  dailySendLimit: true,
  hourlySendLimit: true,
  isActive: true,
  lastSyncAt: true,
  createdAt: true
}
```

### 作用
- 让前端编辑态回填完整
- 避免用户直接保存把有效用户名覆盖为空
- 不暴露密码字段

---

## 7.3 邮箱测试结构化结果草稿

文件：`apps/api/src/modules/emails/emails.service.ts`

```ts
return {
  overallOk: smtp.ok && imap.ok,
  smtp,
  imap,
  message: buildEmailTestSummary(smtp, imap)
};
```

### 作用
- 区分 SMTP 和 IMAP 分项状态
- 避免“部分可用”误判成“完全不可用”

---

## 7.4 SMTP 服务端预解析与 TLS 域名校验草稿

文件：`apps/api/src/modules/emails/smtp.service.ts`

```ts
import { promises as dns } from "node:dns";

async function resolveSmtpHost(host: string) {
  if (isIpAddress(host)) return host;
  const result = await dns.lookup(host, { family: 4 });
  return result.address;
}

private async createTransport(account: SmtpAccount) {
  const resolvedHost = await resolveSmtpHost(account.smtpHost);
  return nodemailer.createTransport({
    host: resolvedHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    logger: true,
    debug: true,
    tls: {
      servername: smtpServername(account)
    },
    auth: {
      user: account.smtpUsername,
      pass: this.secrets.decrypt(account.smtpPasswordEncrypted)
    }
  });
}
```

### 作用
- 用户继续填写域名
- 服务端内部预解析并优先使用 IPv4
- TLS 仍按域名校验证书
- 测试与真实发信共享同一连接策略

---

## 8. Step 5：验证方式

## 8.1 前端逻辑验证

1. 触发一个后端结构化错误响应
2. 确认前端顶部状态栏不再显示整段 JSON
3. 只显示后端 `message`

## 8.2 后端逻辑验证

1. 获取邮箱账号列表
2. 进入编辑态
3. 确认 `smtpUsername` / `imapUsername` 正常回填
4. 不修改用户名直接保存
5. 确认账号配置不会被覆盖为空

## 8.3 接口链路验证

### 邮箱测试
- `POST /email-accounts/:id/test`
- 确认可返回：
  - `overallOk`
  - `smtp`
  - `imap`
  - `message`

### 邮箱编辑
- `GET /email-accounts`
- `PATCH /email-accounts/:id`
- 确认列表字段和编辑表单一致

## 8.4 状态流转验证

### 背调链路
- `PENDING_RESEARCH -> RESEARCHING -> RESEARCHED -> PENDING_EMAIL_GENERATION`

### 邮件链路
- `DRAFT -> PENDING_REVIEW -> APPROVED -> SENT`
- 客户阶段：`PENDING_EMAIL_SEND -> FIRST_EMAIL_SENT -> REPLIED`

## 8.5 风格一致性验证

- 后端保持 NestJS controller/service 分层
- 前端保持现有页面和状态栏模式
- DTO、接口路径、状态命名不另起新体系
- 不新增无必要抽象

---

## 9. 需求逐条比对结论

## 9.1 背调链路

### 符合的部分
- 已形成客户 -> 官网分析 -> 背调 -> 评分 -> 邮件的主链路
- 前后端接口基本存在
- 异步任务与 AI 留痕具备基础

### 不足的部分
- 结构化深度不足
- 自动识别稳定性不足
- 人工复核与结果回写不足

### 当前判断
- **部分完成**

---

## 9.2 邮件链路

### 符合的部分
- 邮箱账号配置、测试、发信、同步、草稿、审核、发送主链路存在
- 邮箱测试可分项判断 SMTP / IMAP
- SMTP 连接层已经增强部署复用性

### 不足的部分
- provider 预设不足
- OAuth2 不支持
- 附件归档不足
- 线程归并与发送策略仍偏基础

### 当前判断
- **部分完成，但已具备较强工程可用性**

---

## 9.3 本次新修复点是否符合需求

### 问题 1：前端错误解析
- 当前修复后：**符合预期**
- 后端 message 可以稳定展示

### 问题 2：邮箱账号编辑回填
- 当前修复后：**符合预期**
- 编辑态不会因字段缺失误覆盖配置

---

## 10. 风险点

1. `docs/design.md` 依然不是当前真实 Swagger 真值，只能作为设计草案参考。
2. 背调相关文档在当前 docs 快照里并不完整，部分历史上下文只能通过现有汇总文档和真实代码恢复。
3. 邮件模块虽已增强，但 provider 兼容层仍不足，换服务商后仍可能遇到新的认证或策略问题。
4. AI Provider 协议兼容问题仍然是独立风险点，后续需要专项处理。
5. 审计、附件、自动化跟进、导入等能力仍未完全补齐。

---

## 11. 待确认项

1. 是否要把邮箱 provider 预设纳入下一阶段开发？
2. 是否要为邮箱测试结果做更细粒度 UI 展示，而不是仅状态栏 message？
3. 是否要为邮箱账号保存最近一次测试快照和结果？
4. 是否要补一份统一的“客户背调真实实现文档”来替代历史会话产物分散问题？

---

## 12. 总结

本次总文档整合与最小修复后的结论是：

> 当前 OEM CRM 的客户背调链路和邮箱链路都已经具备真实代码基础，能够支撑继续开发和 review；其中邮箱模块已从“基础能跑”增强到“可分项诊断、可部署复用”的状态，而本次又进一步补上了两个真实风险点：前端错误信息被吞掉、邮箱账号编辑可能误覆盖用户名。

更具体地说：

- **背调链路**：主链路可用，结构化深度和自动识别稳定性仍待增强
- **邮箱链路**：主链路可用，并已具备较好的诊断能力，但 provider 兼容和企业级细节仍部分完成
- **本次最小修复**：已经让错误展示和邮箱账号编辑行为更符合真实生产使用预期
