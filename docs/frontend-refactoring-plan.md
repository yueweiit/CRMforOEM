# 前端代码重构方案

## 当前问题

### 1. 巨型上帝组件

- **CustomerDetailPage.tsx**：75KB / 1571 行，一个文件塞了 8 个业务模块、40+ 类型定义、30+ 工具函数、手写 Markdown 解析器
- **SettingsPage.tsx**：47KB / 994 行，用户/角色/权限/字典/黑名单/审计/AI 配置全混在一起

### 2. 大量复制粘贴

| 重复代码 | 出现次数 | 涉及文件 |
|----------|---------|---------|
| `stageLabels` + `stageLabel()` | 4 | CustomersPage, DashboardPage, ReportsPage, CustomerDetailPage |
| `Field` 组件 | 5 | CustomersPage, EmailCenterPage, CustomerDetailPage, SettingsPage, KnowledgeBasePage |
| `splitList()` | 3 | CustomersPage, KnowledgeBasePage, CustomerDetailPage |
| `formatDateInput()` | 2 | DashboardPage, ReportsPage |
| `toQueryString()` | 2 | DashboardPage, ReportsPage |
| `Metric` 组件 | 2 | DashboardPage, ReportsPage |
| `BarList` 组件 | 2 | DashboardPage, ReportsPage |
| `CustomerRow` 类型 | 2 | DashboardPage, ReportsPage |
| `CustomerOptions` 类型 | 2 | CustomersPage, CustomerDetailPage |

### 3. Hooks / 组件几乎没有提取

- `hooks/` 目录只有 1 个文件
- 每个页面手写 `useQuery`、`useMutation`，表单状态、筛选逻辑全堆在页面里
- 没有共享的 EmptyState、LoadingState、ErrorState 组件
- Toast 通知方式不统一（3 种不同写法）

### 4. `@oem-crm/shared` 包几乎没用

只有 1 个常量从 shared 包导入，类型、标签映射、工具函数全写在页面文件里。

---

## shared 与 web 的边界约定

**放入 `@oem-crm/shared`（跨前后端一致的领域契约）：**

- 业务枚举对应的标签映射（`stageLabels`、`taskTypeLabels` 等）
- API contract 类型（后端返回、前端消费的结构体）
- 业务常量和枚举值

**放入 `apps/web/src/`（前端专属）：**

- 展示/格式化工具函数（`formatDateInput`、`toQueryString`、`splitList`、`shortUrl` 等）
- 表单状态、筛选状态的类型（`CustomerFormState`、`DashboardFilterOptions` 等）
- UI 组件和 hooks

---

## 执行步骤

核心原则：**先消除已证实重复 → 再拆中等风险页面 → 最后处理两个巨型页面**。

### 第一步：消除已证实的重复（基础设施）

优先级：shared label → 纯函数 utils → 无状态 UI 组件。每项改完即跑 build 验证。

#### 1.1 shared 包补充领域标签

只放跨前后端一致的业务枚举/标签：

| 内容 | 复制次数 | 目标 |
|------|---------|------|
| `stageLabels` + `stageLabel()` | 4 | `packages/shared/src/labels.ts` |
| `taskTypeLabels` + `taskTypeLabel()` | 2 | `packages/shared/src/labels.ts` |

> `formatDateInput`、`toQueryString`、`splitList` 不放 shared，它们属于前端展示/表单工具。

#### 1.2 提取纯函数 utils（`apps/web/src/utils/`）

这些函数没有副作用、不依赖 React，改完所有调用点即可。

| 函数 | 复制次数 | 来源 |
|------|---------|------|
| `formatDateInput` | 2 | DashboardPage, ReportsPage |
| `toQueryString` | 2 | DashboardPage, ReportsPage |
| `splitList` | 3 | CustomersPage, KnowledgeBasePage, CustomerDetailPage |

#### 1.3 提取无状态 UI 组件（`apps/web/src/components/ui/`）

| 组件 | 复制次数 | 说明 |
|------|---------|------|
| `Field` | 5 | 纯展示，props 清晰 |
| `Metric` | 2 | 纯展示 |
| `BarList` | 2 | 纯展示 |
| `EmptyState` | 9 | 一行 `<div>`，但统一语义有价值 |
| `LoadingState` | 9 | 同上 |
| `ErrorState` | 5+ | 同上 |

> `TrendBars` 暂不抽 — 目前只在 DashboardPage 出现一次，等 ReportsPage 或其他页面确实复用时再抽。
>
> `DataTable` 暂不创建 — 每个表格的列、操作、空状态、分页差异大，在没看到稳定模式前不强行抽象。

#### 1.4 提取页面间重复的类型（`apps/web/src/types/`）

| 类型 | 复制次数 |
|------|---------|
| `CustomerRow` | 2（DashboardPage + ReportsPage 各定义一份） |
| `CustomerOptions` | 2（CustomersPage + CustomerDetailPage 各定义一份） |

#### 第一步验收

```bash
npm run build -w @oem-crm/shared
npm run build -w @oem-crm/web
npm run lint -w @oem-crm/web    # 如果有
```

浏览器冒烟：登录页、客户列表、仪表盘、报表、设置、知识库 — 确保无白屏。

---

### 第二步：拆 DashboardPage + ReportsPage

选这两个先拆的理由：它们重复最多（Metric、BarList、CustomerTable、formatDateInput、toQueryString 都在这一步之前已抽走），体量中等（各 450 行左右），拆完能立刻验证第一步的组件抽象是否健康。

#### DashboardPage 拆为

```
pages/dashboard/
├── DashboardPage.tsx           # 主入口，只做编排
├── DashboardFilterBar.tsx      # 筛选栏
├── KpiGrid.tsx                # KPI 指标区
└── PriorityCustomerTable.tsx  # 高优先级客户表
```

#### ReportsPage 拆为

```
pages/reports/
├── ReportsPage.tsx             # 主入口，只做编排
├── ReportFilterBar.tsx         # 筛选栏
├── SalesRankingTable.tsx       # 业务员绩效排行
└── CustomerTable.tsx           # 高价值/风险客户表
```

#### 第二步验收

```bash
npm run build -w @oem-crm/web
npm run lint -w @oem-crm/web
```

浏览器冒烟：仪表盘和报表的筛选、切换、数据展示正常。

---

### 第三步：拆低风险页面

#### 3.1 CustomersPage（288 行）

```
pages/customers/
├── CustomersPage.tsx           # 主入口，mode="create" 时渲染表单，否则渲染列表
├── CustomerListTable.tsx       # 客户列表表格
├── CustomerCreateForm.tsx      # 创建客户表单
└── CustomerFilterBar.tsx       # 筛选栏
```

#### 3.2 FollowUpsPage（195 行）

```
pages/follow-ups/
├── FollowUpsPage.tsx           # 主入口
└── FollowUpFilterBar.tsx       # 筛选栏
```

#### 3.3 KnowledgeBasePage（645 行）

```
pages/knowledge/
├── KnowledgeBasePage.tsx       # 主入口
├── KnowledgeTable.tsx          # 知识条目表格
└── KnowledgeForm.tsx           # 知识条目表单
```

#### 3.4 EmailCenterPage（628 行）

```
pages/email-center/
├── EmailCenterPage.tsx         # 主入口
├── AccountTable.tsx            # 邮箱账户表
├── DraftList.tsx               # 草稿列表
└── ThreadList.tsx              # 邮件线程列表
```

#### 第三步验收

每次拆完一个页面就跑 build + lint。浏览器冒烟确认对应页面正常。

---

### 第四步：拆 SettingsPage（994 行）

按设置项切为独立文件，主入口只做 tab 路由：

```
pages/settings/
├── SettingsPage.tsx            # 主入口，根据 section 参数渲染对应子组件
├── UserManagement.tsx
├── RoleManagement.tsx
├── CustomerDictionaries.tsx
├── EmailAccounts.tsx
├── AiConfig.tsx
├── ScoringWeights.tsx
├── Blacklist.tsx
├── AuditLogs.tsx
└── LogoutSection.tsx
```

#### 第四步验收

```bash
npm run build -w @oem-crm/web
```

浏览器冒烟：设置页每个 tab 切换正常，各子模块的增删改查不报错。

---

### 第五步：拆 CustomerDetailPage（1571 行）

这是最后一步，也是风险最高的一步。此时前面四步已完成，基础组件、类型边界、utils 都已稳定。

按 8 个 tab 切为独立面板文件，页面内共享的工具独立放 `shared/`：

```
pages/customer-detail/
├── CustomerDetailPage.tsx      # 主入口，只做 tab 路由 + 数据获取
├── OverviewPanel.tsx           # 概览面板
├── WebsiteAnalysisPanel.tsx    # 官网分析（含 WebsiteBusinessReportV2 等子组件）
├── ResearchPanel.tsx           # 调研报告
├── ScorePanel.tsx              # 评分面板（含 ScoreDimensionList）
├── EmailPanel.tsx              # 邮件面板
├── FollowUpPanel.tsx           # 跟进面板
├── QuotePanel.tsx              # 报价面板
├── SamplePanel.tsx             # 样品面板
└── shared/                     # 此页面内共享，不污染全局
    ├── Markdown.tsx            #   手写 Markdown 解析器独立出来
    └── types.ts                #   40+ 类型定义
```

> 页面内的 `Field` 组件如果在第一步已抽到 `components/ui/Field.tsx`，此处直接删除本地副本、改为 import 即可。`shared/Field.tsx` 仅当 CustomerDetailPage 的 Field 与全局 Field 确实不同时才保留。

#### 第五步验收

```bash
npm run build -w @oem-crm/web
```

浏览器冒烟：客户详情页 8 个 tab 逐一检查，确认数据加载、编辑、保存均正常。

---

## 执行顺序总览

| 步骤 | 内容 | 涉及文件数 | 风险 |
|------|------|-----------|------|
| 一 | shared label + utils + UI 组件 + 类型 | ~20 个页面文件改 import | 低（纯搬代码，不改逻辑） |
| 二 | 拆 DashboardPage + ReportsPage | ~8 个新文件 | 中（验证组件抽象） |
| 三 | 拆 CustomersPage / FollowUpsPage / KnowledgeBasePage / EmailCenterPage | ~13 个新文件 | 低 |
| 四 | 拆 SettingsPage | ~10 个新文件 | 中 |
| 五 | 拆 CustomerDetailPage | ~11 个新文件 | 中高（文件最大，等基础稳定后动） |

---

## 每一步的通用验收标准

```bash
# 类型检查 + 构建
npm run build -w @oem-crm/shared   # 仅第一步需要
npm run build -w @oem-crm/web

# 代码规范（如果有）
npm run lint -w @oem-crm/web
```

浏览器冒烟覆盖以下页面（至少打开确认不白屏、核心操作正常）：

- 登录页 `/login`
- 仪表盘 `/dashboard`
- 客户列表 `/customers` + 新增客户 `/customers/new`
- 客户详情 `/customers/:id/overview`
- 报表 `/reports/management`
- 设置 `/settings/users`
- 知识库 `/knowledge`
- 邮件中心 `/email-center`
- 跟进任务 `/follow-ups`

---

## 不做的事

- **不提前创建通用 Hook（useQueryList、useFilters 等）** — 等拆完第二步（DashboardPage + ReportsPage）后，如果确实出现了稳定的重复模式，再考虑抽取
- **不创建 DataTable 通用表格组件** — 每个页面的表格列、操作、空状态差异大，强行统一会引入不必要的抽象成本
- **不改 UI 行为** — 纯结构重组，不修 bug、不加功能、不改样式
- **不一次性创建所有目录** — 目标结构是方向，实际只创建当前步骤需要的文件

---

## 回滚策略

- 每一步独立分支 / 独立提交，不混合
- 如果某一步的组件抽象被证明不合适（例如 Field 的 props 差异太大），回退那一步，保留调用方的本地副本
- `routes.tsx` 的 import 路径只改页面入口，子组件拆分不影响路由
