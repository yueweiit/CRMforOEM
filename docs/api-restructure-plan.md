# apps/api 分层与模块治理方案

## 现状诊断

### 目录结构问题

```
apps/api/src/
├── common/
│   ├── auth/          (装饰器 — 横切)   ←
│   ├── guards/        (守卫 — 横切)     ← 和下面的 redis/sse 不是同一层级
│   ├── redis/         (完整 NestJS 模块) ←
│   ├── sse/           (完整 NestJS 模块) ←
│   ├── dto/           (工具)
│   ├── events/        (事件类型)
│   └── query/         (查询工具)
├── prisma/             ← 完整模块却在 common 外面
└── modules/
    ├── emails/         (21 个文件平铺在根目录)
    ├── follow-ups/     (规则文件散落)
    └── ... (其他模块基本合理)
```

### 大文件清单（核心维护风险）

| 文件 | 行数 | 承担职责数 | 问题 |
|------|------|-----------|------|
| `research.processor.ts` | 1069 | 5+ | process() 方法承载了预算计算 + 上下文构建 + 搜索 + AI 调用 + 持久化 |
| `emails.service.ts` | 964 | 6 | 账户管理 + 草稿生成 + 审核/发送 + 线程管理 + 上下文构建 + IMAP 刷新 |
| `dashboards.service.ts` | 880 | 5 | 三类看板入口 + 摘要/分布/趋势/排名/客户列表/产品/跟进全部混在一起 |
| `settings.service.ts` | 830 | 6 | 用户管理 + 字典 + 黑名单 + 评分权重 + 邮件提示词 + 角色权限 |

---

## 总体方案：四阶段推进

```
第一阶段  目录搬迁        → 文件归位，找得到东西
第二阶段  模块模板        → 每个模块有统一骨架
第三阶段  大文件拆分      → 职责分离，单文件 ≤ 300 行
第四阶段  治理规则        → 新增代码有章可循
```

---

## 第一阶段：目录搬迁（低风险，纯文件移动）

### 1.1 拆分 common/ → common/ + infrastructure/

**原则：** NestJS Module（带 `.module.ts`）进 `infrastructure/`，纯工具/装饰器留在 `common/`。guards/ 属于认证横切层，保留在 `common/`，不移入 infrastructure。

```
src/
├── common/                  ← 纯横切工具
│   ├── auth/                (装饰器)
│   ├── dto/                 (转换工具)
│   ├── events/              (事件类型)
│   ├── guards/              (守卫 — 认证/授权横切层)
│   └── query/               (查询工具)
├── infrastructure/          ← 基础设施 NestJS 模块（新建）
│   ├── prisma/              ← 从 src/prisma 迁入
│   ├── redis/               ← 从 common 迁入
│   └── sse/                 ← 从 common 迁入
├── config/
├── modules/
├── main.ts
└── app.module.ts
```

### 1.2 整理 emails/ 模块

当前 16 个文件平铺根目录 → 按领域拆子目录，**不合并常量文件**：

```
emails/
├── dto/
│   ├── approve-email-draft.dto.ts
│   ├── create-email-account.dto.ts
│   ├── generate-email-draft.dto.ts
│   ├── update-email-account.dto.ts
│   └── update-email-draft.dto.ts
├── accounts/
│   ├── email-secret.service.ts
│   └── email-compliance.service.ts
├── drafts/
│   ├── email-draft.constants.ts
│   ├── email-draft.processor.ts
│   └── email-prompt-constants.ts
├── inbound/
│   ├── imap-inbound.constants.ts
│   ├── imap-inbound.processor.ts
│   ├── imap-inbound.service.ts
│   ├── imap-idle.service.ts
│   └── imap-sync.service.ts
├── generation/
│   ├── email-generation-types.ts
│   ├── email-prompt-builder.ts
│   └── smtp.service.ts
├── emails.module.ts
├── emails.controller.ts
└── emails.service.ts           ← 主编排层，第三阶段拆分
```

### 1.3 整理 follow-ups/ 模块

```
follow-ups/
├── dto/
│   ├── create-follow-up-task.dto.ts
│   └── update-follow-up-task.dto.ts
├── rules/
│   ├── follow-up-rule-constants.ts
│   ├── follow-up-email-rules.ts
│   ├── follow-up-stage-rules.ts
│   └── follow-up-rules.service.ts
├── follow-ups.module.ts
├── follow-ups.controller.ts
└── follow-ups.service.ts
```

### 1.4 迁出数据导入脚本

```
apps/api/prisma/           → 只保留 Prisma 原生产物（schema、seed、migrations）
apps/api/scripts/          → 新建，放置数据导入脚本
```

更新 `apps/api/package.json`：
```json
"prisma:import-eva-customers": "ts-node scripts/import-eva-customers.ts"
```

### 第一阶段影响范围

| 类别 | 文件移动 | Import 更新 |
|------|---------|------------|
| infrastructure 拆分 | ~8 个文件 | ~25 处 |
| emails 子目录 | ~13 个文件 | 模块内 ~30 处 |
| follow-ups 子目录 | ~4 个文件 | 模块内 ~8 处 |
| scripts 迁出 | 2 个文件 | 1 处 package.json |
| **合计** | **~27 个文件** | **~65 处** |

---

## 第二阶段：模块内部模板

每个业务模块统一按以下骨架组织。不是每个模块都需要所有目录，缺的不用创建。

```
<module>/
├── dto/               ← 请求/响应 DTO，必须
├── services/          ← 子 service（当模块有 ≥3 个 service 时创建）
├── processors/        ← BullMQ 队列处理器（有队列时创建）
├── rules/             ← 业务规则/策略文件（有规则逻辑时创建）
├── builders/          ← 提示词/模板构建器（有构建逻辑时创建）
├── types.ts           ← 模块内部类型定义（有非 DTO 类型时创建）
├── constants.ts       ← 模块内部常量（常量 ≤ 80 行放单文件，超过按领域拆 constant-xxx.ts）
├── <module>.module.ts
├── <module>.controller.ts
└── <module>.service.ts   ← 主编排层，不写底层实现
```

### 现有模块分类

| 类别 | 模块 | 建议 |
|------|------|------|
| 简单模块，结构已够用 | ai, auth, background-tasks, commercial, knowledge, scoring, upload | 维持现状 |
| 中等模块，已有 dto/ | customers, research, website-analysis, settings | 第二阶段可不动，第三阶段按需调整 |
| 需整理 | emails, follow-ups | 第一阶段执行 |
| 待拆分 | dashboards | 第三阶段执行 |

---

## 第三阶段：大文件拆分

### 3.1 settings.service.ts（830 行 → 6 个文件，每个 ≤ 200 行）

当前承担 6 个职责，拆为：

```
settings/
├── settings.module.ts
├── settings.controller.ts
├── settings.service.ts            ← 主编排层（~60 行），只做路由转发
├── services/
│   ├── user-management.service.ts        ← createUser, updateUser (~120 行)
│   ├── customer-dictionary.service.ts    ← customerSources, customerTypes, update (~100 行)
│   ├── blacklist.service.ts              ← updateBlacklistRule (~80 行)
│   ├── scoring-config.service.ts         ← getOemScoringWeights, update (~80 行)
│   └── email-prompt-config.service.ts    ← getEmailPromptConfigs, update, reset, preview (~150 行)
├── dto/
│   └── settings.dto.ts
├── prompts/
│   ├── settings-email-prompt.defaults.ts
│   └── settings-email-prompt.types.ts
├── permission.service.ts
└── audit-cleanup.service.ts
```

### 3.2 dashboards.service.ts（880 行 → 拆 4 个模块文件）

当前把 personal/team/management 三类看板和所有统计方法塞在一个类里：

```
dashboards/
├── dashboards.module.ts
├── dashboards.controller.ts
├── dashboards.service.ts            ← 主编排层（~80 行），组装三类看板入口
├── services/
│   ├── dashboard-personal.service.ts     ← getPersonalSummary + 分布/趋势 (~180 行)
│   ├── dashboard-team.service.ts         ← getManagementLikeDashboard for team (~120 行)
│   ├── dashboard-management.service.ts   ← getManagementLikeDashboard for mgmt (~120 行)
│   └── dashboard-query-builder.ts        ← buildCustomerWhere, getAllowedTeamIds (~100 行)
├── metrics/
│   ├── stage-distribution.ts       ← getStageDistribution, getCountryDistribution, getTypeDistribution (~80 行)
│   ├── trend-calculator.ts         ← getNewCustomerTrend, getEmailTrend (~60 行)
│   ├── ranking.ts                  ← getSalesRanking, getHighPriorityCustomers, getRiskCustomers (~120 行)
│   └── followup-summary.ts         ← getTodayFollowupTasks (~60 行)
├── helpers/
│   └── filter-options.ts           ← filterOptions (~60 行)
├── dto/
│   └── dashboard-query.dto.ts
└── types.ts                        ← CustomerWhere, DateRange 等内部类型
```

### 3.3 emails.service.ts（964 行 → 主编排层 ≤ 200 行）

当前 emails.service.ts 既做编排又做大量业务逻辑：

拆分策略——emails.service.ts 变为纯编排层，底层逻辑全部下沉到已有或新建的子 service：

```
emails.service.ts（重构后 ~200 行）
├── 账户 CRUD       → accounts/email-account.service.ts（新建，~120 行）
├── 草稿生成逻辑     → generation/email-draft-generation.service.ts（新建，~180 行）
├── 审核/发送编排    → drafts/email-approval.service.ts（新建，~120 行）
├── 线程查询        → inbound/email-thread.service.ts（新建，~100 行）
├── 上下文构建       → generation/email-context-builder.ts（新建，~120 行）
└── IMAP 监听器刷新  → 保留在 accounts/ 或 inbound/ 内
```

### 3.4 research.processor.ts（1069 行 → 拆 4 个文件）

当前 `process()` 方法承载了全部流程。拆分策略：

```
research/
├── research.processor.ts           ← 排程层（~120 行），只管取数 → 委托 → 写结果
├── services/
│   ├── research-context-builder.ts      ← buildContext，收集客户数据（~150 行）
│   └── research-prompt-builder.ts       ← 提示词预算 + 分段构建 + 截断逻辑，从 processor 中抽离（~250 行）
├── research.constants.ts           ← 预算配置独立出来（~120 行，目前已在此文件但 processor 里还有大量常量）
├── search-provider.service.ts      ← 不变
├── research.service.ts             ← 不变
├── research.controller.ts          ← 不变
├── research.module.ts              ← 不变
└── dto/
    └── generate-research-report.dto.ts
```

### 第三阶段验收标准

- 每个 `.service.ts` / `.processor.ts` ≤ 300 行
- 每个方法 ≤ 40 行（超过则需要进一步拆子方法或子服务）
- 主编排层（`<module>.service.ts`）不含直接 Prisma 查询，通过子 service 完成
- 不引入循环依赖，必要时新建 module

---

## 第四阶段：治理规则

### 4.1 新增代码放哪里

| 我要新增... | 放在... |
|-------------|---------|
| 接口请求/响应 DTO | 所属模块 `dto/`，文件命名 `xxx.dto.ts` |
| 业务 service | 所属模块 `services/`，文件命名 `xxx.service.ts` |
| 队列处理器 | 所属模块 `processors/`，文件命名 `xxx.processor.ts` |
| 业务规则/策略 | 所属模块 `rules/`，文件命名 `xxx-rules.ts` |
| AI 提示词构建 | 所属模块 `builders/`，文件命名 `xxx-builder.ts` |
| 模块内部常量 | 所属模块 `constants.ts`（≤ 80 行）或按领域 `constant-xxx.ts`（> 80 行） |
| 模块内部类型 | 所属模块 `types.ts` |
| 跨模块共享的工具 | `common/` 下对应子目录 |
| 新业务模块 | `modules/<name>/`，复制第二阶段模板 |
| 基础设施模块（DB/Redis/SSE/Cache 等） | `infrastructure/` |
| 数据导入/迁移脚本 | `scripts/` |

### 4.2 文件行数红线

| 文件类型 | 硬上限 | 建议值 |
|----------|--------|--------|
| service | 400 行 | ≤ 250 行 |
| processor | 400 行 | ≤ 250 行 |
| controller | 200 行 | ≤ 120 行 |
| helper/builder | 300 行 | ≤ 180 行 |
| DTO 文件 | 150 行 | ≤ 100 行 |
| constants | 120 行 | ≤ 80 行 |

**触发拆分的信号：**
- 一个 service 的 `constructor` 注入超过 6 个依赖 → 职责太多
- 私有方法超过 5 个且可用"名词"分类 → 可以抽子 service
- `Promise.all([...])` 里的调用超过 4 个 → 编排逻辑已经重了

### 4.3 命名约定

| 类型 | 命名格式 | 示例 |
|------|---------|------|
| Controller | `<domain>.controller.ts` | `customers.controller.ts` |
| 主 Service | `<domain>.service.ts` | `customers.service.ts` |
| 子 Service | `<domain>-<responsibility>.service.ts` | `customer-dictionary.service.ts` |
| Processor | `<domain>-<task>.processor.ts` | `email-draft.processor.ts` |
| DTO | `<verb>-<noun>.dto.ts` | `create-customer.dto.ts` |
| Rules | `<domain>-<rule-type>-rules.ts` | `follow-up-email-rules.ts` |
| Constants | `constants.ts` 或 `<domain>.constants.ts` | `research.constants.ts` |
| Types | `types.ts` 或 `<domain>.types.ts` | `website-analysis.types.ts` |

### 4.4 模块间依赖规则

```
modules/     → 可 import common/, infrastructure/
modules/     → 可 import 其他 modules/（需谨慎，避免循环）
modules/     → 禁止 import 另一个 module 的内部子目录
infrastructure/ → 可 import common/
infrastructure/ → 禁止 import modules/
common/      → 禁止 import modules/, infrastructure/
```

### 4.5 检查清单（PR Review 用）

- [ ] 新文件是否放在了正确的子目录？
- [ ] 新 service/processor 是否超过 400 行？
- [ ] 有没有模块外的代码直接 import 另一个模块的 `services/` 或 `processors/` 内部路径？
- [ ] 跨模块共享的类型是否放到了 `@oem-crm/shared` 或 `common/`？
- [ ] 新增的模块是否遵循了第二阶段模板骨架？

---

## 执行计划总览

| 阶段 | 内容 | 风险 | 预计工时 |
|------|------|------|---------|
| 第一阶段 | 目录搬迁（infrastructure + emails + follow-ups + scripts） | 低 | 1 次集中提交 |
| 第二阶段 | 模块模板文档化（不收代码，约定即可） | 无 | 已完成（本文档） |
| 第三阶段 | 拆 4 个大文件（settings → dashboards → emails → research） | 中 | 每次一个模块，独立提交 |
| 第四阶段 | 治理规则落地（本文档即为规则来源） | 无 | 已完成（本文档） |
