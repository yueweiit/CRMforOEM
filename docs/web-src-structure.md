# apps/web/src 前端文件结构

> 架构：app(路由组装) → features(业务领域) → api(API 客户端) → shared(跨模块能力)

---

## 入口

| 路径 | 说明 |
|------|------|
| `main.tsx` | 应用入口，挂载 React 根节点、QueryClientProvider、RouterProvider |
| `styles.css` | 全局样式 |
| `vite-env.d.ts` | Vite 类型声明 |

---

## app/ — 路由组装层

| 文件 | 说明 |
|------|------|
| `routes.tsx` | createBrowserRouter 路由表，将所有 feature page 挂载到 URL |

---

## api/ — API 客户端模块（7 个领域模块 + 1 个底层 http）

| 文件 | 包含的具名导出函数 |
|------|-------------------|
| `http.ts` | `apiGet`, `apiPost`, `apiPatch`, `apiDelete` — 底层 HTTP 封装；`clearSessionAndRedirect` |
| `customers.ts` | `getCustomers`, `getCustomerFilterOptions`, `createCustomer`, `getCustomerDetail`, `updateCustomer`, `updateCustomerStage`, `createCustomerContact`, `getCustomerBackgroundTasks`, `createWebsiteAnalysis`, `createResearchReport`, `createOemFitScore`, `getCustomerEmailDrafts`, `getCustomerEmailThreads`, `generateEmailDraft`, `getQuotes`, `createQuote`, `getSamples`, `createSample`（18个） |
| `email.ts` | `getEmailAccounts`, `createEmailAccount`, `updateEmailAccount`, `testEmailAccount`, `toggleEmailAccount`, `getEmailSyncStatus`, `runEmailSync`, `getEmailDrafts`, `updateEmailDraft`, `approveEmailDraft`, `sendEmailDraft`, `getEmailThreads`（12个） |
| `settings.ts` | `getUsers`, `createUser`, `toggleUser`, `getRoles`, `getPermissions`, `updateRolePermissions`, `getCustomerSources`, `createCustomerSource`, `updateCustomerSource`, `getCustomerTypes`, `createCustomerType`, `updateCustomerType`, `getEmailPromptConfigs`, `updateEmailPromptConfig`, `resetEmailPromptConfig`, `previewEmailPromptConfig`, `getOemScoringWeights`, `updateOemScoringWeights`, `getBlacklistRules`, `createBlacklistRule`, `toggleBlacklistRule`, `getAuditLogs`, `login`, `logout`（24个） |
| `dashboards.ts` | `getDashboardFilterOptions`, `getMyDashboard`, `getTeamDashboard`, `getManagementDashboard`（4个） |
| `knowledge.ts` | `getCompanyProfile`, `updateCompanyProfile`, 以及 brands/products/oem-capabilities/certificates/case-studies/email-materials 六个实体的完整 CRUD：`get*`, `create*`, `update*`, `delete*`（26个） |
| `followUps.ts` | `getFollowUpTasks`, `createFollowUpTask`, `completeFollowUpTask`, `cancelFollowUpTask`（4个） |
| `reports.ts` | 从 `dashboards` 重导出 `getDashboardFilterOptions`, `getManagementDashboard`, `getTeamDashboard`（领域边界入口） |

---

## features/ — 业务领域模块

### customers/ — 客户管理

```
customers/
├── list/                              # 客户列表页
│   ├── CustomersPage.tsx              # 列表页主组件（查询、分页）
│   ├── CustomerFilterBar.tsx          # 筛选栏组件
│   ├── CustomerListTable.tsx          # 客户表格组件
│   └── CustomerCreateForm.tsx         # 新建客户表单组件
└── detail/                            # 客户详情页
    ├── CustomerDetailPage.tsx         # 详情页主组件（Tab 路由容器）
    ├── panels/
    │   ├── OverviewPanel.tsx          # 概览 Tab — 客户资料编辑、联系人管理
    │   ├── ResearchPanel.tsx          # 背调 Tab — 网站分析、深度报告、OEM 适配分
    │   ├── EmailPanel.tsx             # 邮件 Tab — 草稿生成/编辑/发送、线程查看
    │   ├── FollowUpPanel.tsx          # 跟进 Tab — 跟进任务创建与管理
    │   ├── QuotePanel.tsx             # 报价 Tab — 报价单创建与列表
    │   ├── SamplePanel.tsx            # 样品 Tab — 样品单创建与列表
    │   ├── ScorePanel.tsx             # 评分 Tab — OEM 评分权重展示
    │   └── WebsiteAnalysisPanel.tsx   # 网站分析详情组件
    └── shared/
        ├── types.ts                   # CustomerDetail 等类型定义
        ├── ui.tsx                     # Detail 展示组件
        └── Markdown.tsx               # Markdown 渲染组件
```

### dashboard/ — 个人工作台

```
dashboard/
├── DashboardPage.tsx          # 工作台主页面（KPI、阶段分布、邮件趋势、高优先级客户、今日任务）
├── DashboardFilterBar.tsx     # 筛选栏（日期范围、国家、客户类型、阶段）
├── KpiGrid.tsx                # KPI 指标卡片网格
└── PriorityCustomerTable.tsx  # 高优先级客户表格
```

### reports/ — 数据看板

```
reports/
├── ReportsPage.tsx            # 看板主页面（汇总指标、趋势、分布、绩效排行、高价值/风险客户、产品线反馈）
├── ReportFilterBar.tsx        # 筛选栏（日期、团队、负责人、国家、类型、阶段、聚合粒度）
├── SalesRankingTable.tsx      # 业务员绩效排行表格
└── CustomerTable.tsx          # 报表客户表格（高价值/风险两种模式）
```

### email-center/ — 邮件中心

```
email-center/
├── EmailCenterPage.tsx        # 邮件中心主页面（Tab：账户管理 / 邮件草稿 / 邮件线程）
├── AccountTable.tsx           # 邮箱账户表格（添加、测试、启停）
├── DraftList.tsx              # 邮件草稿列表（编辑、审批、发送）
└── ThreadList.tsx             # 邮件线程列表
```

### follow-ups/ — 跟进任务

```
follow-ups/
├── FollowUpsPage.tsx          # 跟进任务主页面（按状态筛选、创建、完成、取消）
└── FollowUpFilterBar.tsx      # 筛选栏 + 新建任务表单
```

### knowledge/ — 知识库

```
knowledge/
├── KnowledgeBasePage.tsx      # 知识库主页面（Section 切换：公司档案 + 6 个实体 CRUD）
├── KnowledgeForm.tsx          # 知识条目编辑表单（动态字段）
└── KnowledgeTable.tsx         # 知识条目表格
```

### settings/ — 系统设置

```
settings/
├── SettingsPage.tsx           # 设置主页面（Tab 路由容器，含权限守卫 + email-accounts→email-prompts 重定向）
├── sections/
│   ├── UserManagement.tsx     # 用户管理 — 创建用户、启停账户
│   ├── RoleManagement.tsx     # 角色权限管理 — 角色列表、权限分配
│   ├── CustomerDictionaries.tsx # 客户字典 — 客户来源、客户类型的 CRUD
│   ├── EmailPrompts.tsx       # 邮件提示词配置 — 各场景 prompt 编辑、预览、重置
│   ├── AiConfig.tsx           # AI 配置 — AI 相关参数设置
│   ├── ScoringWeights.tsx     # OEM 评分权重 — 评分因子权重调整
│   ├── Blacklist.tsx          # 黑名单规则 — 规则创建与启停
│   ├── AuditLogs.tsx          # 审计日志 — 操作记录列表
│   └── LogoutSection.tsx      # 退出登录
└── shared/
    ├── Table.tsx              # 通用表格组件（设置模块专用）
    └── types.ts               # 设置模块共享类型（DictionaryRow, AuditLog 等）
```

---

## components/ — 跨业务通用 UI 组件

| 文件 | 说明 |
|------|------|
| `AppSelect.tsx` | 下拉选择器 |
| `FileUpload.tsx` | 文件上传组件 |
| `Switch.tsx` | 开关/切换组件 |
| `Toast.tsx` | Toast 通知组件 + `notifyMutationStep` 工具函数 |
| `ui/BarList.tsx` | 柱状排行列表 |
| `ui/EmptyState.tsx` | 空状态占位 |
| `ui/ErrorState.tsx` | 错误状态占位 |
| `ui/Field.tsx` | 表单字段（label + input） |
| `ui/LoadingState.tsx` | 加载状态占位 |
| `ui/Metric.tsx` | 指标卡片（图标 + 标签 + 数值 + 色调） |

---

## shared/ — 跨 feature 共享能力

```
shared/
├── types/
│   └── customer.ts            # CustomerOptions, PriorityCustomerRow, ReportCustomerRow 类型
└── utils/
    ├── format.ts              # formatDateInput, formatDateTime
    ├── string.ts              # splitList, toQueryString
    └── email-format.ts        # normalizeEmailAddress, sameEmailAddress, formatDraftSender, formatDraftRecipient
```

---

## auth/ — 认证与权限

| 文件 | 说明 |
|------|------|
| `permissions.ts` | `getCurrentUser`, `canAccessSettingsTab`, `SETTINGS_PERMISSION_MAP`, `SETTINGS_SECTION_ORDER` |

---

## config/ — 运行时配置

| 文件 | 说明 |
|------|------|
| `runtime.ts` | 运行时配置常量（API base URL 等） |
| `email-event-toasts.ts` | 邮件事件 → Toast 消息映射 |
| `follow-up-task-toasts.ts` | 跟进任务事件 → Toast 消息映射 |

---

## hooks/ — 自定义 Hook

| 文件 | 说明 |
|------|------|
| `useSse.ts` | SSE（Server-Sent Events）订阅 Hook，接收服务端推送事件并触发回调 |

---

## layouts/ — 布局

| 文件 | 说明 |
|------|------|
| `AppShell.tsx` | 应用外壳布局（侧边导航 + 顶栏 + 内容区 Outlet） |

---

## pages/ — 薄入口页

| 文件 | 说明 |
|------|------|
| `LoginPage.tsx` | 登录页（`pages/` 下唯一残留文件，作为薄入口不承载业务逻辑） |
