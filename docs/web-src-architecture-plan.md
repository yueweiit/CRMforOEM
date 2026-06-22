# Web Src Architecture Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `apps/web/src` 从“页面文件分组”升级为“应用装配层 + 业务域 features + API client + shared 基础能力”的长期可维护结构。

**Architecture:** `app/` 负责路由和应用装配，`features/` 负责业务域代码，`api/` 负责接口封装，`components/` 只放跨业务 UI，`shared/` 放前端通用工具和类型。迁移采用渐进方式，不一次性大搬家，不改 UI 行为。

**Tech Stack:** React, React Router, TanStack Query, TypeScript, Vite.

---

## 1. Current Problems

当前 `apps/web/src` 已完成页面拆分，但仍存在几个结构性问题：

1. `pages/` 目录承担过多责任  
   现在 `pages/customer-detail`、`pages/settings` 已经包含业务状态、表单、局部组件、局部类型和工具函数。它们不再只是“路由页面”，而是完整业务模块。

2. API 调用散落在页面和组件中  
   大量代码直接调用 `apiGet("/xxx")`、`apiPost("/xxx")`、`apiPatch("/xxx")`。接口路径、payload、返回类型分散在多个页面里，后续接口变化时难以统一维护。

3. shared / utils / components 边界还不够明确  
   `components/` 里既有真正通用 UI，也有偏业务的组件风险。`utils/` 里混有格式化、字符串、邮件格式化等不同层级工具。

4. `routes.tsx` 仍在 src 根目录  
   路由属于应用装配层，和 `main.tsx`、provider、runtime 初始化更接近，不应该长期散在根目录。

5. 大业务域缺少内部结构规范  
   例如客户详情、设置、邮件中心这类模块需要稳定的内部目录约定，否则继续拆下去会出现每个目录风格不同的问题。

---

## 2. Target Structure

目标结构：

```text
apps/web/src/
  app/
    routes.tsx
    AppProviders.tsx

  api/
    http.ts
    customers.ts
    dashboards.ts
    email.ts
    follow-ups.ts
    knowledge.ts
    reports.ts
    settings.ts

  auth/
    permissions.ts

  components/
    AppSelect.tsx
    FileUpload.tsx
    Switch.tsx
    Toast.tsx
    ui/
      BarList.tsx
      EmptyState.tsx
      ErrorState.tsx
      Field.tsx
      LoadingState.tsx
      Metric.tsx

  features/
    customers/
      list/
      detail/
        CustomerDetailPage.tsx
        panels/
        shared/
      shared/

    dashboard/
    reports/
    email-center/
    follow-ups/
    knowledge/
    settings/

  layouts/
    AppShell.tsx

  shared/
    types/
    utils/

  styles/
    styles.css

  main.tsx
  vite-env.d.ts
```

---

## 3. Boundary Rules

### 3.1 `app/`

放应用装配代码：

- 路由定义
- 全局 Provider
- 应用级初始化
- route guards 的组合逻辑

不放：

- 业务表单
- 业务表格
- 具体 API 调用实现
- 可复用 UI 组件

### 3.2 `features/`

放业务域代码。一个业务域可以包含：

```text
features/<domain>/
  <DomainPage>.tsx
  components/
  panels/
  hooks/
  types.ts
  utils.ts
```

适合进入 `features/` 的模块：

- customers
- customer detail
- dashboard
- reports
- email center
- follow ups
- knowledge
- settings

规则：

- 只被本业务域使用的组件放在对应 feature 内。
- 跨 2 个以上业务域复用，才考虑上移到 `components/` 或 `shared/`。
- feature 内部可以有 `shared/`，但只表示本 feature 内共享，不代表全局共享。

### 3.3 `api/`

放接口 client。页面不再直接拼 URL。

推荐：

```ts
getCustomerDetail(id)
updateCustomer(id, payload)
createResearchReport(customerId)
getDashboard(filters)
getEmailDrafts(customerId)
```

不推荐：

```ts
apiGet(`/customers/${id}`)
apiPost(`/customers/${id}/research-reports`, {})
```

规则：

- `api/http.ts` 只保留底层 HTTP 能力。
- 业务路径放到 `api/*.ts`。
- API response 类型优先放在对应 api 文件或 feature types 中。
- 如果前后端都要共享，才进入 `@oem-crm/shared`。

### 3.4 `components/`

只放跨业务、无业务语义的 UI：

- Button-like primitives
- Field
- EmptyState
- LoadingState
- ErrorState
- Metric
- BarList
- Switch
- FileUpload

不放：

- CustomerTable
- EmailDraftList
- RoleManagement
- ResearchPanel
- SettingsTable

### 3.5 `shared/`

放前端通用能力：

```text
shared/
  types/
  utils/
```

适合放：

- 通用日期格式化
- 通用 query string
- 通用字符串处理
- 前端内部通用类型

不放：

- 业务接口路径
- 业务页面状态
- 只有某个 feature 使用的工具

### 3.6 `@oem-crm/shared`

只放跨前后端一致的领域契约：

- 枚举
- 领域 label
- 前后端都依赖的常量
- API contract 类型

不放：

- React 类型
- 页面表单状态
- 前端格式化函数
- UI 组件 props

---

## 4. Recommended Migration Strategy

核心原则：

> 先建立骨架，再迁移低风险入口，最后迁移大业务域。每一步都必须 build/lint 通过。

不要一次性把所有 `pages/*` 搬到 `features/*`，否则当前前端重构现场会变得难以审查。

---

## 5. Migration Tasks

### Task 1: Create App Layer

**Goal:** 把路由从根目录收敛到 `app/`。

**Files:**

- Create: `apps/web/src/app/routes.tsx`
- Modify: `apps/web/src/main.tsx`
- Keep temporarily: `apps/web/src/routes.tsx` as compatibility re-export, or delete after all imports updated

**Steps:**

- [ ] Create `apps/web/src/app/routes.tsx`
- [ ] Move current `apps/web/src/routes.tsx` content into it
- [ ] Update relative imports
- [ ] Update `main.tsx` to import router from `./app/routes`
- [ ] Search old imports:

```bash
rg "from \"\\.\\/routes\"|from './routes'|src/routes" apps/web/src
```

- [ ] Run:

```bash
npm run build -w @oem-crm/web
npm run lint -w @oem-crm/web
```

**Acceptance:**

- App still routes to login, dashboard, customers, customer detail, reports, settings.
- No import depends on root `src/routes.tsx`.

---

### Task 2: Introduce Feature Directory Without Moving Everything

**Goal:** 建立 `features/` 目录和命名规则，先不大规模迁移。

**Files:**

- Create: `apps/web/src/features/README.md`

**Content:**

```md
# Features Directory

This directory owns business-domain frontend modules.

Rules:

- Route entry pages may live here once migrated.
- Feature-local components stay inside the feature.
- Feature-local shared helpers go under `shared/` inside that feature.
- Only cross-feature UI belongs in `src/components`.
- Only cross-feature non-UI helpers belong in `src/shared`.
- Do not import from another feature's internal folders.
```

**Acceptance:**

- New workers understand where business modules should go.
- No runtime behavior change.

---

### Task 3: Move Customer Detail To Feature

**Goal:** 把最大业务模块从 `pages/customer-detail` 移到 `features/customers/detail`。

**Target:**

```text
features/customers/detail/
  CustomerDetailPage.tsx
  panels/
    OverviewPanel.tsx
    WebsiteAnalysisPanel.tsx
    ResearchPanel.tsx
    ScorePanel.tsx
    EmailPanel.tsx
    FollowUpPanel.tsx
    QuotePanel.tsx
    SamplePanel.tsx
  shared/
    Markdown.tsx
    types.ts
    ui.tsx
```

**Steps:**

- [ ] Move files from `pages/customer-detail/*`
- [ ] Put panel files under `panels/`
- [ ] Update imports inside the module
- [ ] Update route import in `app/routes.tsx`
- [ ] Ensure no old path remains:

```bash
rg "pages/customer-detail|\\.\\/pages\\/customer-detail|\\.\\.\\/customer-detail" apps/web/src
```

- [ ] Run:

```bash
npm run build -w @oem-crm/web
npm run lint -w @oem-crm/web
```

**Smoke:**

- `/customers/:id/overview`
- `/customers/:id/website-analysis`
- `/customers/:id/research`
- `/customers/:id/oem-score`
- `/customers/:id/email`
- `/customers/:id/follow-ups`
- `/customers/:id/quotes`
- `/customers/:id/samples`

---

### Task 4: Move Settings To Feature

**Goal:** 把设置模块从 `pages/settings` 移到 `features/settings`。

**Target:**

```text
features/settings/
  SettingsPage.tsx
  sections/
    UserManagement.tsx
    RoleManagement.tsx
    CustomerDictionaries.tsx
    EmailAccounts.tsx
    AiConfig.tsx
    ScoringWeights.tsx
    Blacklist.tsx
    AuditLogs.tsx
    LogoutSection.tsx
  shared/
    Table.tsx
    types.ts
```

**Important Fix Before Move:**

当前 `email-accounts` tab 语义存在不一致：

- tab key 是 `email-accounts`
- 可见权限是 `emails.accounts.manage_personal`
- 实际组件管理的是 email prompt configs
- 实际接口权限是 `settings.email_prompt.manage`

迁移前必须先二选一：

1. 改成真正邮箱账号设置模块
2. 改名为 `email-prompts` 并使用 `settings.email_prompt.manage`

**Steps:**

- [ ] 先修正 `email-accounts` 权限/命名/功能边界
- [ ] Move settings files
- [ ] Update route import
- [ ] Search old path
- [ ] Run build/lint

**Smoke:**

- `/settings/users`
- `/settings/roles`
- `/settings/customer-dictionaries`
- `/settings/email-prompts` or corrected email route
- `/settings/ai`
- `/settings/scoring`
- `/settings/blacklist`
- `/settings/audit-logs`
- `/settings/logout`

---

### Task 5: Add API Client Modules

**Goal:** 把散落的 API path 收敛到 `api/*.ts`。

**Target:**

```text
api/
  http.ts
  customers.ts
  dashboards.ts
  email.ts
  followUps.ts
  knowledge.ts
  reports.ts
  settings.ts
```

**Example:**

```ts
// apps/web/src/api/customers.ts
import { apiGet, apiPatch, apiPost } from "./http";

export function getCustomerDetail(id: string) {
  return apiGet(`/customers/${id}`);
}

export function updateCustomer(id: string, payload: unknown) {
  return apiPatch(`/customers/${id}`, payload);
}

export function createResearchReport(customerId: string) {
  return apiPost(`/customers/${customerId}/research-reports`, {});
}
```

**Migration Order:**

1. `customers.ts`
2. `email.ts`
3. `settings.ts`
4. `dashboards.ts`
5. `knowledge.ts`
6. `followUps.ts`
7. `reports.ts`

**Acceptance:**

- Feature components no longer directly hardcode common API paths.
- `api/http.ts` remains the only low-level HTTP client.
- Build/lint passes after each API module migration.

---

### Task 6: Move Shared Frontend Utilities

**Goal:** 把当前 `utils/` 升级为 `shared/utils/`，让 `shared` 成为前端通用能力层。

**Target:**

```text
shared/
  utils/
    format.ts
    string.ts
    email-format.ts
  types/
    customer.ts
```

**Rules:**

- 只有跨 feature 使用的工具才进入 `shared/utils`。
- 只有跨 feature 使用的类型才进入 `shared/types`。
- 单 feature 使用的类型留在 feature 内。

**Steps:**

- [ ] Move `utils/format.ts` to `shared/utils/format.ts`
- [ ] Move `utils/string.ts` to `shared/utils/string.ts`
- [ ] Move `utils/email-format.ts` to `shared/utils/email-format.ts`
- [ ] Move `types/customer.ts` to `shared/types/customer.ts`
- [ ] Update imports
- [ ] Search old imports:

```bash
rg "src/utils|\\.\\.\\/utils|\\.\\.\\/\\.\\.\\/utils|src/types|\\.\\.\\/types|\\.\\.\\/\\.\\.\\/types" apps/web/src
```

- [ ] Run build/lint

---

## 6. Do Not Do Yet

暂时不做：

- 不创建通用 `DataTable`
- 不创建通用 `useQueryList`
- 不把所有 API 类型放进 `@oem-crm/shared`
- 不把所有 page 一次性搬到 features
- 不改 UI 样式
- 不改业务文案，除非有明确产品决定

---

## 7. Verification Gates

每个任务完成后至少运行：

```bash
npm run build -w @oem-crm/web
npm run lint -w @oem-crm/web
```

如果改到 `@oem-crm/shared`：

```bash
npm run build -w @oem-crm/shared
```

必须 smoke 的页面：

```text
/login
/dashboard
/customers
/customers/new
/customers/:id/overview
/customers/:id/website-analysis
/customers/:id/research
/customers/:id/oem-score
/customers/:id/email
/customers/:id/follow-ups
/customers/:id/quotes
/customers/:id/samples
/reports/management
/settings/users
/knowledge
/email-center
/follow-ups
```

---

## 8. Git Hygiene

当前这类结构迁移非常容易漏掉 untracked 目录。每一步提交前必须检查：

```bash
git status --short
```

重点确认这些目录不是 `??`：

```text
apps/web/src/pages/customer-detail/
apps/web/src/pages/settings/
apps/web/src/features/
apps/web/src/app/
```

提交前建议跑：

```bash
git diff --name-status
git diff --cached --name-status
```

---

## 9. Final Target Criteria

这次架构整理完成的标准：

- `src/app/routes.tsx` 是唯一主路由定义
- 大业务模块进入 `src/features`
- `src/pages` 不再承载复杂业务模块，最多保留薄入口或逐步清空
- 页面组件不再大量直接拼 API URL
- 跨业务 UI 在 `components`
- 跨业务前端工具在 `shared`
- 跨前后端契约在 `@oem-crm/shared`
- `npm run build -w @oem-crm/web` 通过
- `npm run lint -w @oem-crm/web` 通过
