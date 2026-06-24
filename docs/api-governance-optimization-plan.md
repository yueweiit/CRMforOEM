# apps/api 第四阶段治理优化方案

## 目标

在不改变现有接口行为、不调整数据库结构、不重写业务流程的前提下，完成 `apps/api` 的第四阶段结构治理。

本轮方案保留以下内容：

- 阶段一：治理规则补充
- 阶段二：低风险目录与命名整理
- 阶段三：注入过载治理

本轮方案忽略硬上限文件治理，不拆以下文件：

- `settings.dto.ts`
- `upsert-knowledge.dto.ts`
- `scoring.service.ts`
- `website-crawler.service.ts`
- `website-analysis.processor.ts`

这些文件后续可以单独开一轮“硬上限文件治理”，不纳入本次优化范围。

## 当前结论

第三阶段拆分后的 API 功能链路已经可以继续使用，`lint/build` 已通过。本轮治理的重点不是继续拆大文件，而是把目录规则、文件放置和依赖注入边界整理清楚，让后续开发可以在更稳定的结构下继续扩展。

## 执行原则

1. 不改变现有 API 路由。
2. 不改变数据库 schema。
3. 不改变 BullMQ 队列名和 job payload。
4. 不改变前端正在使用的响应字段。
5. 文件移动优先保持业务逻辑不变，只更新 import。
6. 注入过载治理只处理确实能降低职责耦合的 service，不为了数字机械拆分。
7. 每完成一个模块，单独验证。
8. 每完成一个模块，建议单独提交。

验证命令：

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

## 非目标

本轮不处理以下事项：

- 硬上限文件拆分
- 大规模业务流程重写
- Prisma schema 调整
- API 路由变更
- 前端字段调整
- 权限模型调整
- 新增业务功能

## 阶段一：治理规则补充

### 目标

先把第四阶段规则写清楚，避免后续开发者机械套用模板，导致复杂模块被拆得更乱。

### 修改文件

- `docs/api-restructure-plan.md`

### 需要补充的规则

#### 1. 复杂模块允许业务子域目录

对于 `emails` 这类已经按业务域拆分的复杂模块，允许使用业务子域目录：

```text
emails/
├── accounts/
├── drafts/
├── generation/
├── inbound/
```

子域内部可以维护自己的 `types.ts`、`constants.ts`、builder 或 helper。不要强制所有类型、常量、builder 都放到模块根目录。

#### 2. helpers 与 utils 统一

模块内部工具函数统一使用 `helpers/`，不再新增 `utils/`。

推荐：

```text
emails/helpers/email-helpers.ts
```

不推荐：

```text
emails/utils/email-helpers.ts
```

#### 3. builder 放置规则

AI 提示词、上下文、模板构建逻辑优先放入 `builders/`。

如果模块已经存在明确业务子域，例如 `emails/generation/`，可以保留在子域内，但需要命名清晰：

```text
emails/generation/email-context-builder.ts
emails/generation/email-prompt-builder.ts
```

同一模块内不要同时混用 `builders/` 和多个随意命名的构建目录。

#### 4. types/constants 放置规则

简单模块：

```text
<module>/types.ts
<module>/constants.ts
```

复杂业务子域模块：

```text
<module>/<subdomain>/types.ts
<module>/<subdomain>/constants.ts
```

避免零散命名：

```text
imap-idle.types.ts
email-generation-types.ts
email-prompt-constants.ts
```

除非该文件确实只服务单个类，且不会被子域内多个文件共享。

### 验收标准

- `docs/api-restructure-plan.md` 明确复杂模块例外规则。
- `docs/api-restructure-plan.md` 明确 `helpers/` 与 `utils/` 的取舍。
- `docs/api-restructure-plan.md` 明确子域内 `types.ts/constants.ts` 的允许条件。
- 文档不再把所有复杂模块强行套到单一模板骨架。

### 建议提交

```bash
git add docs/api-restructure-plan.md
git commit -m "docs(api): refine api governance rules"
```

## 阶段二：低风险目录与命名整理

### 目标

处理当前自查中明确的文件放置问题，尽量只移动文件和更新 import，不改业务逻辑。

## 2.1 research 目录整理

### 目标结构

```text
apps/api/src/modules/research/
├── builders/
│   ├── research-context-builder.ts
│   └── research-prompt-builder.ts
├── parsers/
│   └── research-output-parser.ts
├── services/
│   ├── search-provider.service.ts
│   ├── research-report-data.service.ts
│   └── research-report-run.service.ts
├── research.constants.ts
├── research.controller.ts
├── research.module.ts
├── research.processor.ts
└── research.service.ts
```

### 移动清单

| 当前文件 | 目标文件 | 原因 |
|---|---|---|
| `research/search-provider.service.ts` | `research/services/search-provider.service.ts` | research 已有 `services/`，service 统一收拢 |
| `research/services/research-context-builder.ts` | `research/builders/research-context-builder.ts` | 上下文构建属于 builder |
| `research/services/research-prompt-builder.ts` | `research/builders/research-prompt-builder.ts` | 提示词构建属于 builder |
| `research/services/research-output-parser.ts` | `research/parsers/research-output-parser.ts` | 纯解析器，不是 NestJS service |

### 修改点

- 更新 `research.module.ts` import。
- 更新 `research.processor.ts` import。
- 更新 builder/parser 内部相对路径。
- 不改变 `RESEARCH_REPORT_QUEUE`。
- 不改变 `research.service.ts` 对外方法。

### 验证

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

### 建议提交

```bash
git add apps/api/src/modules/research
git commit -m "refactor(api): organize research module directories"
```

## 2.2 emails 目录整理

### 目标结构

```text
apps/api/src/modules/emails/
├── accounts/
├── drafts/
├── generation/
├── helpers/
│   └── email-helpers.ts
├── inbound/
├── dto/
├── emails.controller.ts
├── emails.module.ts
└── emails.service.ts
```

### 移动清单

| 当前文件 | 目标文件 | 原因 |
|---|---|---|
| `emails/utils/email-helpers.ts` | `emails/helpers/email-helpers.ts` | 统一使用 `helpers/` |
| `emails/generation/email-generation-types.ts` | `emails/generation/types.ts` | 子域内部类型统一命名 |
| `emails/inbound/imap-idle.types.ts` | `emails/inbound/types.ts` | 子域内部类型统一命名 |
| `emails/drafts/email-prompt-constants.ts` | `emails/drafts/constants.ts` | 子域内部常量统一命名 |

### 保留项

以下文件可以继续保留在 `generation/`，不强行迁到模块根 `builders/`：

| 文件 | 原因 |
|---|---|
| `emails/generation/email-context-builder.ts` | `generation/` 是邮件生成子域，上下文构建与生成逻辑内聚 |
| `emails/generation/email-prompt-builder.ts` | 同上 |

### 修改点

- 更新 `email-draft-generation.service.ts` import。
- 更新 `email-draft.service.ts` import。
- 更新 `email-approval.service.ts` import。
- 更新 `email-draft.processor.ts` import。
- 更新 `emails.module.ts` 中相关 import。
- 不改变 `EMAIL_DRAFT_QUEUE`。
- 不改变 `IMAP_INBOUND_QUEUE`。
- 不改变 controller 路由。

### 验证

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

### 建议提交

```bash
git add apps/api/src/modules/emails
git commit -m "refactor(api): organize emails module support files"
```

## 阶段三：注入过载治理

### 目标

处理 constructor 注入明显过多、职责边界已经开始模糊的 service。该阶段不追求所有 service 都低于某个数字，而是优先拆出稳定、可复用、可测试的职责单元。

### 处理原则

1. 只拆“职责可以清晰命名”的依赖组。
2. 不为了减少 constructor 参数而引入无意义中转层。
3. 优先拆高频改动或高风险流程。
4. 拆分后主 service 应更像编排层。
5. 拆分后必须保持原方法签名和返回结构不变。

## 3.1 `email-draft-generation.service.ts`

### 当前问题

邮件草稿生成 service 同时承担：

- 上下文构建
- 活跃任务检查
- 提交锁
- 发件账号解析
- AI run 创建
- draft 创建
- queue 入队
- 客户阶段推进

### 建议拆分

```text
apps/api/src/modules/emails/generation/
├── email-draft-generation.service.ts
├── email-draft-submission.service.ts
├── email-draft-creation.service.ts
└── email-context-builder.ts
```

职责：

| 文件 | 职责 |
|---|---|
| `email-draft-generation.service.ts` | 主编排入口，保留 `generate()` |
| `email-draft-submission.service.ts` | 活跃任务检查、提交锁、lock key 构建 |
| `email-draft-creation.service.ts` | 创建 AI run、创建 draft、入队、阶段推进 |
| `email-context-builder.ts` | 保持现有上下文构建职责 |

### 修改点

- `EmailsModule` 注册新 service。
- `EmailDraftGenerationService.generate()` 对外签名不变。
- 不改变 `EMAIL_DRAFT_QUEUE`。
- 不改变返回 `{ accepted, id, status, message }` 结构。

### 验证

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

### 建议提交

```bash
git add apps/api/src/modules/emails/generation apps/api/src/modules/emails/emails.module.ts
git commit -m "refactor(api): split email draft generation dependencies"
```

## 3.2 `email-account.service.ts`

### 当前问题

邮箱账号 service 同时承担：

- 账号 CRUD
- 权限判断
- 密码加密
- SMTP/IMAP 测试
- IMAP listener 刷新
- 错误文案映射

### 建议拆分

```text
apps/api/src/modules/emails/accounts/
├── email-account.service.ts
├── email-account-test.service.ts
├── email-account-listener.service.ts
└── email-account-error-mapper.ts
```

职责：

| 文件 | 职责 |
|---|---|
| `email-account.service.ts` | 账号 CRUD 主入口 |
| `email-account-test.service.ts` | SMTP/IMAP 测试编排 |
| `email-account-listener.service.ts` | 创建/更新账号后的 IMAP listener 启停 |
| `email-account-error-mapper.ts` | SMTP/IMAP 错误文案映射 |

### 修改点

- `EmailsModule` 注册 `EmailAccountTestService`、`EmailAccountListenerService`。
- `EmailAccountService.test()` 对外签名不变。
- `EmailAccountService.create/update/list/findAccount()` 对外行为不变。
- 不改变加密字段。
- 不改变共享邮箱权限判断。

### 验证

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

### 建议提交

```bash
git add apps/api/src/modules/emails/accounts apps/api/src/modules/emails/emails.module.ts
git commit -m "refactor(api): split email account service dependencies"
```

## 3.3 `imap-idle.service.ts`

### 当前问题

IMAP idle service 同时承担：

- 模块启动时自动连接
- connection map 管理
- IMAP client 创建
- 收件扫描与入队
- 断线重连
- 手动同步辅助方法
- 同步时间更新

### 建议拆分

```text
apps/api/src/modules/emails/inbound/
├── imap-idle.service.ts
├── imap-connection-registry.service.ts
├── imap-fetch-enqueue.service.ts
└── imap-reconnect.service.ts
```

职责：

| 文件 | 职责 |
|---|---|
| `imap-idle.service.ts` | 生命周期入口，保留 `startAccount/stopAccount/getConnection/createClient` |
| `imap-connection-registry.service.ts` | 管理 connection map |
| `imap-fetch-enqueue.service.ts` | fetch 邮件并投递 `IMAP_INBOUND_QUEUE` |
| `imap-reconnect.service.ts` | 重连延迟、重连调度、错误状态 |

### 修改点

- `EmailsModule` 注册新增 service。
- `ImapManualSyncService` 调用方式保持不变，或者只通过 `ImapIdleService` 暴露的方法调用。
- 不改变 `IMAP_INBOUND_QUEUE`。
- 不改变入队 job payload。
- 不改变 `email-sync/status` 返回结构。

### 验证

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

### 建议提交

```bash
git add apps/api/src/modules/emails/inbound apps/api/src/modules/emails/emails.module.ts
git commit -m "refactor(api): split imap idle service dependencies"
```

## 3.4 `settings.service.ts`

### 当前问题

`settings.service.ts` 当前已经是 facade，但注入子服务较多。它的职责目前仍然清晰：把 controller 请求转发给对应子服务。

### 建议

本轮不强拆。

如果后续继续膨胀，可以考虑增加二级 facade：

```text
settings/
├── services/
│   ├── settings-user-facade.service.ts
│   ├── settings-role-facade.service.ts
│   ├── settings-dictionary-facade.service.ts
│   └── settings-config-facade.service.ts
└── settings.service.ts
```

但当前不建议为了减少 constructor 参数立即拆。

## 最终验收

完成每个阶段后执行：

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

并检查：

- 所有新增文件已 `git add`
- 没有旧路径 import 残留
- controller 路由未变化
- BullMQ 队列名未变化
- job payload 未变化
- DTO 导出未变化
- `apps/api/src/modules` 内无跨模块内部子目录违规 import

建议检查命令：

```bash
rg -n "from ['\\\"].*modules/.*/(services|processors|builders|parsers|helpers)/" apps/api/src/modules -g "*.ts"
```

如果命中，需要确认是否属于同模块内部引用；跨模块内部引用需要改为 public barrel 或模块级 service。

## 推荐提交顺序

1. `docs(api): refine api governance rules`
2. `refactor(api): organize research module directories`
3. `refactor(api): organize emails module support files`
4. `refactor(api): split email draft generation dependencies`
5. `refactor(api): split email account service dependencies`
6. `refactor(api): split imap idle service dependencies`

每个提交都应保证：

```bash
npm run lint -w @oem-crm/api
npm run build -w @oem-crm/api
```

## 暂不处理清单

以下硬上限文件本轮忽略，后续单独规划：

```text
apps/api/src/modules/settings/dto/settings.dto.ts
apps/api/src/modules/knowledge/dto/upsert-knowledge.dto.ts
apps/api/src/modules/scoring/scoring.service.ts
apps/api/src/modules/website-analysis/website-crawler.service.ts
apps/api/src/modules/website-analysis/website-analysis.processor.ts
```

