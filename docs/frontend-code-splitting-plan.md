# 前端首屏加载优化方案（第一版）

## 现状

所有页面组件在 [routes.tsx](../apps/web/src/app/routes.tsx) 顶部通过静态 `import` 引入，导致 Vite 将所有代码打包成一个巨大的 JS 文件。浏览器首次访问时必须下载、解析、执行整个应用才能渲染任何内容。

## 优化目标

- 首屏 JS 体积显著下降
- 首次内容渲染时间（FCP）明显降低
- 页面切换按需加载，不影响现有功能

> 具体数值需要通过构建后对比 chunk 体积来验证，不做预判。

## 改动清单

### 1. routes.tsx — 页面级代码分割

将所有静态 import 替换为 `React.lazy()` 动态导入。

**注意：** 当前所有页面组件都是**命名导出**（`export function XxxPage()`），因此 lazy() 需要使用 `.then()` 将命名导出转为 default 导出。

**改前：**
```ts
import { CustomerDetailPage } from "../features/customers/detail/CustomerDetailPage";
import { CustomersPage } from "../features/customers/list/CustomersPage";
// ... 7 个静态 import
```

**改后：**
```ts
import { lazy, Suspense } from "react";

const LoginPage = lazy(() => import("../pages/LoginPage").then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then(m => ({ default: m.DashboardPage })));
const CustomersPage = lazy(() => import("../features/customers/list/CustomersPage").then(m => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() => import("../features/customers/detail/CustomerDetailPage").then(m => ({ default: m.CustomerDetailPage })));
const EmailCenterPage = lazy(() => import("../features/email-center/EmailCenterPage").then(m => ({ default: m.EmailCenterPage })));
const FollowUpsPage = lazy(() => import("../features/follow-ups/FollowUpsPage").then(m => ({ default: m.FollowUpsPage })));
const KnowledgeBasePage = lazy(() => import("../features/knowledge/KnowledgeBasePage").then(m => ({ default: m.KnowledgeBasePage })));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage").then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("../features/settings/SettingsPage").then(m => ({ default: m.SettingsPage })));
```

**RequireReportAccess / RequireSettingsAccess 处理：**

这两个是访问控制 wrapper，内部同步调用 `getCurrentUser()` 做权限判断和重定向。它们本身不需要 lazy，但内部引用了 `ReportsPage` 和 `SettingsPage`。将这两个 wrapper 改为使用 lazy 后的组件：

```ts
function RequireReportAccess() {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!canViewReports(user)) return <Navigate to={defaultReportPath(user)} replace />;
  return <ReportsPage />; // 引用 lazy 组件，与直接引用行为一致
}

function RequireSettingsAccess() {
  const { section = "users" } = useParams();
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!canViewSettingsSection(user, section)) return <Navigate to={defaultSettingsPath(user)} replace />;
  return <SettingsPage />;
}
```

lazy 只延迟组件加载，加载后行为完全一致，不影响权限判断逻辑。

### 2. AppShell.tsx — 添加 Suspense 边界

**文件路径：** [apps/web/src/layouts/AppShell.tsx](../apps/web/src/layouts/AppShell.tsx)

在 `<Outlet />` 外包裹 `<Suspense>`，提供加载骨架屏。

```tsx
import { Suspense } from "react";

// 在 main 区域
<main className="workspace">
  <Suspense fallback={<PageLoadingSkeleton />}>
    <Outlet />
  </Suspense>
</main>
```

新增 `PageLoadingSkeleton` 组件（放在 `apps/web/src/components/PageLoadingSkeleton.tsx`）：简单的居中 spinner 或骨架占位，避免页面切换时白屏闪烁。

### 3. 构建验证

执行以下命令对比优化前后的 chunk 体积：

```bash
npm run build -w @oem-crm/web
```

检查 `apps/web/dist/assets/` 目录：
- 确认每个页面拆分为独立 chunk
- 确认 chunk 数量合理（不应过多）
- 记录首屏入口 chunk 体积变化

### 4. vite.config.ts — Vendor 代码分割（第二步，按需启用）

> **不在第一版实施。** 先完成步骤 1-3，看构建结果再决定是否需要手动配置。

如果构建后发现 `@alifd/next` 或 `react` 在多个页面 chunk 中重复打包，再考虑添加：

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        "react-vendor": ["react", "react-dom"],
        "alifd-vendor": ["@alifd/next"]
      }
    }
  }
}
```

**原则：** 只拆最大的两个 vendor。router、react-query、lucide 等交给 Vite 自动拆分，避免过度分割导致小页面加载时请求数过多。

## 实施步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `routes.tsx` | 所有页面组件改为 `lazy(() => import(...).then(m => ({ default: m.XxxPage })))` |
| 2 | `layouts/AppShell.tsx` | `<Outlet />` 包裹 `<Suspense>` |
| 3 | `components/PageLoadingSkeleton.tsx` | 新建骨架屏组件 |
| 4 | 构建 + 验证 | `npm run build -w @oem-crm/web`，检查 chunk 拆分结果 |
| 5 | （可选）`vite.config.ts` | 根据构建结果决定是否添加 `manualChunks` |

## 风险与注意事项

1. **命名导出** — 所有页面组件都是 `export function` 命名导出，必须用 `.then(m => ({ default: m.XxxPage }))` 模式，否则 `lazy()` 无法正常加载。

2. **RequireReportAccess / RequireSettingsAccess** — 这两个 wrapper 保持为普通函数组件（不 lazy），内部引用 lazy 后的 `ReportsPage` / `SettingsPage`，行为不变。

3. **路由 params** — `CustomerDetailPage` 使用 `:id/:tab?`，`SettingsPage` 使用 `:section?`，lazy 不影响参数传递。

4. **开发体验** — Vite dev server 本身就是按需编译的，`lazy()` 在开发模式下不影响 HMR 速度。

5. **构建后验证** — 必须执行 `npm run build -w @oem-crm/web` 并检查 `dist/` 目录，确认 chunk 拆分符合预期，每个页面独立成 chunk，没有重复打包。

6. **SSE 连接** — 当前 `AppShell` 挂载时通过 `useSse` 建立 EventSource 连接。这个属于独立优化项，不在本方案范围内，后续单独评估。
