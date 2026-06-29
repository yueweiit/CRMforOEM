# 前端首屏加载优化方案（第一版）

## 现状

所有页面组件在 [routes.tsx](../apps/web/src/app/routes.tsx) 顶部通过静态 `import` 引入，导致 Vite 将所有代码打包成一个巨大的 JS 文件。浏览器首次访问时必须下载、解析、执行整个应用才能渲染任何内容。

## 优化目标

- 首屏 JS 体积下降（入口 chunk 不含重页面代码）
- 页面切换按需加载，不影响现有功能

> **首屏收益边界说明：** 步骤 1-5 的目标是"重页面不进入口 chunk"。是否直接改善 FCP 取决于首屏实际用到了哪些公共依赖。`AppShell` 静态依赖 `Toast` → 静态依赖 `@alifd/next`，`api/http.ts` 也依赖 `Toast`，因此 `@alifd/next` 的一部分仍可能保留在入口 chunk 的依赖链中。第一阶段的验收标准是构建产物中重页面代码已拆出，FCP 是否明显改善需用浏览器 Performance 面板或 Lighthouse 实测验证。

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
import { lazy } from "react";

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

**静态导入保持不变的部分：**

`AppShell`、`Navigate`、`useParams`、`getCurrentUser`、`canViewReports`、`canViewSettingsSection` 等权限工具和路由基础设施保持静态 `import`。`RequireReportAccess` / `RequireSettingsAccess` 两个 wrapper 维持普通函数组件，只懒加载它们内部引用的页面组件。不要误拆布局层和路由层。

### 2. main.tsx — 全局 Suspense 兜底

**文件路径：** [apps/web/src/main.tsx](../apps/web/src/main.tsx)

`/login` 路由不在 AppShell 的 `<Outlet />` 下，AppShell 内的 Suspense/ErrorBoundary 无法覆盖。需要在 `<RouterProvider />` 外包一层全局 Suspense + ErrorBoundary 作为兜底：

```tsx
import { Suspense } from "react";
import { ChunkErrorBoundary } from "../components/ChunkErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChunkErrorBoundary>
        <Suspense fallback={<div className="page-loading" />}>
          <RouterProvider router={router} />
        </Suspense>
      </ChunkErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
```

这里的 fallback 用纯 CSS 占位（一个空 `<div>` 配合 CSS 动画），不引入任何组件库，避免把 UI 库提前拉进首屏。`ChunkErrorBoundary` 捕获动态 chunk 加载失败（404、网络错误、部署后旧 chunk 失效），提供"刷新重试"按钮，避免白屏。

### 3. AppShell.tsx — 添加 Suspense 边界

**文件路径：** [apps/web/src/layouts/AppShell.tsx](../apps/web/src/layouts/AppShell.tsx)

在 `<Outlet />` 外包裹 `<Suspense>` + `<ChunkErrorBoundary>`，为认证后的页面切换提供加载和错误处理。认证后页面建议把当前 pathname 作为 `resetKey`，避免某个页面 chunk 加载失败后，切换到其他路径仍被旧错误态挡住：

```tsx
import { Suspense } from "react";
import { useLocation } from "react-router-dom";
import { ChunkErrorBoundary } from "../components/ChunkErrorBoundary";

const location = useLocation();

// 在 main 区域
<main className="workspace">
  <ChunkErrorBoundary resetKey={location.pathname}>
    <Suspense fallback={<PageLoadingSkeleton />}>
      <Outlet />
    </Suspense>
  </ChunkErrorBoundary>
</main>
```

> **范围说明：** AppShell 自身包含 lucide-react 图标、SSE 连接、Toast 通知、侧边导航等逻辑，这些**不在本次拆分范围**内。本方案优化的是页面级代码分割，不是 AppShell 首屏自身体积。如果页面拆分后首屏仍慢，下一步再单独评估 AppShell 内的图标按需加载、Toast 懒注册、SSE 延迟连接等策略。

### 4. PageLoadingSkeleton — 纯 CSS 骨架屏

**文件路径：** `apps/web/src/components/PageLoadingSkeleton.tsx`

**必须用纯 CSS 实现**，不依赖 `@alifd/next` 的 Loading 组件，否则骨架屏本身就会把 Next 提前拉进首屏 bundle，削弱拆包收益。

组件：

```tsx
export function PageLoadingSkeleton() {
  return <div className="page-loading-skeleton" />;
}
```

实现：居中 spinner（CSS animation），页面切换时无白屏闪烁。

```css
/* 登录页全局兜底 spinner */
.page-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}
.page-loading::after {
  content: "";
  width: 32px;
  height: 32px;
  border: 3px solid #e5e6eb;
  border-top-color: #0066ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* AppShell 内页面切换骨架屏 */
.page-loading-skeleton {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 360px;
}
.page-loading-skeleton::after {
  content: "";
  width: 32px;
  height: 32px;
  border: 3px solid #e5e6eb;
  border-top-color: #0066ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### 5. ChunkErrorBoundary — chunk 加载失败兜底

**文件路径：** `apps/web/src/components/ChunkErrorBoundary.tsx`

`Suspense` 只处理加载中的 pending 状态，不处理 chunk 加载失败——动态 import 的 JS 文件可能因部署后旧页面引用已失效的旧 chunk hash 而返回 404，也可能因网络波动导致 `ChunkLoadError`。Vite 还会在预加载失败时派发 `vite:preloadError` 事件。没有 ErrorBoundary 时，这类错误会导致白屏且无任何恢复手段。

新建一个 React ErrorBoundary（class 组件，因为 React 目前不支持函数式 ErrorBoundary），专门识别 chunk 加载失败并提示用户刷新：

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

export class ChunkErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  private handlePreloadError = (event: Event) => {
    const payload = (event as VitePreloadErrorEvent).payload ?? event;
    if (!isChunkLoadError(payload) && !isChunkLoadError(event)) return;

    event.preventDefault();
    this.setState({ error: payload instanceof Error ? payload : new Error("页面资源加载失败") });
  };

  static getDerivedStateFromError(error: Error): State {
    if (isChunkLoadError(error)) {
      return { error };
    }
    throw error; // 非 chunk 错误继续向上抛
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ChunkErrorBoundary] chunk load failed:", error.message, info.componentStack);
  }

  componentDidMount() {
    window.addEventListener("vite:preloadError", this.handlePreloadError);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentWillUnmount() {
    window.removeEventListener("vite:preloadError", this.handlePreloadError);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ marginBottom: 16, color: "#6b7280" }}>
            页面加载失败，可能是网络问题或系统已更新。请刷新页面重试。
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 20px", cursor: "pointer" }}
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 识别动态 chunk 加载失败的特征错误 */
function isChunkLoadError(error: Error): boolean {
  const name = error.name ?? "";
  const message = error.message ?? "";
  const type = typeof error === "object" && error && "type" in error ? String(error.type) : "";
  const text = `${type} ${name} ${message}`;

  return (
    text.includes("vite:preloadError") ||
    text.includes("Failed to fetch dynamically imported module") ||
    text.includes("Importing a module script failed") ||
    text.includes("Loading chunk") ||
    text.includes("Loading CSS chunk")
  );
}
```

组件不依赖 `@alifd/next`，纯 HTML + inline style，确保在 UI 库尚未加载时也能正常渲染。

布放位置：
- `main.tsx`：`ChunkErrorBoundary` 包在 `<RouterProvider />` 外层，覆盖 `/login` 路由的 chunk 错误
- `AppShell.tsx`：`ChunkErrorBoundary` 包在 `<Outlet />` 外层，覆盖认证后各页面切换时的 chunk 错误，并传入当前 pathname 作为 `resetKey`

验收：
- 模拟 chunk 404（构建后故意删掉一个异步 chunk，再访问对应页面），应看到错误提示和刷新按钮，不应白屏
- 模拟 `vite:preloadError`，应进入同一个错误兜底，不应只在控制台报错
- chunk 错误出现后切换到其他路由，错误态应随 `resetKey` 清除
- 点击"刷新页面"按钮后重新加载正常

### 6. 构建验证

执行以下命令对比优化前后的 chunk 体积：

```bash
npm run build -w @oem-crm/web
```

检查 `apps/web/dist/assets/` 目录，并采用以下至少一种方法确认模块归属：

**推荐验证方法（三选一）：**

1. **rollup-plugin-visualizer**（推荐）：构建后生成 treemap，可视化确认各模块落在哪个 chunk。
2. **开启 `build.manifest`**：在 `vite.config.ts` 中设置 `build: { manifest: true }`，构建后在 `dist/.vite/manifest.json` 中查看每个模块的 chunk 归属。
3. **开启 sourcemap**：`build: { sourcemap: true }`，构建后在浏览器 DevTools Sources 面板中查看各 chunk 包含的源文件。

**验证口径：**
- 确认主要页面已被拆出异步 chunk，观察 shared/vendor 是否合理
- **确认 `CustomerDetailPage`、`KnowledgeBasePage`、`SettingsPage` 等重页面的组件源码不再出现在入口 chunk 中**（入口 chunk 可能保留动态 import 的映射 stub，页面名出现在 chunk 列表中不等于页面代码进入口 chunk。应通过 manifest 或 visualizer 确认模块的实际归属。）
- 记录以下指标作为优化效果对比基准：入口 JS 体积、入口 CSS 体积、异步 JS chunk 数量、最大异步 chunk 体积、首屏请求数
- 确认 chunk 数量合理（异步 chunk 与页面数基本对应，不应出现每页数十个碎片 chunk）

### 7. vite.config.ts — Vendor 代码分割（第二步，按需启用）

> **不在第一版实施。** 先完成步骤 1-5，看构建结果再决定是否需要手动配置。

这一项不是“默认加上”，而是一个构建结果驱动的二次优化。具体按下面流程判断：

1. 先执行页面级 lazy 后的构建：

```bash
npm run build -w @oem-crm/web
```

2. 检查 `apps/web/dist/assets/` 中的 JS chunk：

- 如果多个异步页面 chunk 都重复包含 React 运行时代码，或入口 chunk 与多个页面 chunk 都带有明显的 React 公共依赖，可以考虑拆 `react-vendor`。
- 如果 Vite/Rollup 已经自动生成稳定的公共 chunk，且入口 chunk 体积已经明显下降，则不需要手动配置 `manualChunks`。
- 如果只是 `@alifd/next` 体积大，不要立刻拆 `alifd-vendor`，先确认它是否真的进入了首屏入口 chunk，还是只在客户详情/知识库等异步页面 chunk 中加载。

3. 若需要手动拆分，第一步只拆 `react-vendor`：

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        "react-vendor": ["react", "react-dom"]
        // "alifd-vendor": ["@alifd/next"] — 先看构建结果再决定
      }
    }
  }
}
```

`vite.config.ts` 中应合并到现有 `defineConfig` 的 `build` 配置里，不要新建第二套 Vite 配置。例如：

```ts
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"]
        }
      }
    }
  }
});
```

4. 加完 `react-vendor` 后再次构建并对比：

```bash
npm run build -w @oem-crm/web
```

验收口径：

- 构建成功，无 warning/error。
- `react-vendor-*.js` 被单独产出。
- 首屏入口 chunk 没有变大；如果入口 chunk 变大或请求链变长导致首屏更差，应撤回 `manualChunks`。
- 主要页面 chunk 仍保持异步加载，不因为 vendor 配置重新合并进入口 chunk。

`alifd-vendor` 的启用条件更严格，只有同时满足下面条件才考虑：

- `@alifd/next` 已经被多个重页面重复打入不同 chunk，造成明显重复体积。
- 用户首屏默认不会进入这些使用 Next 的页面，拆出后不会让登录页/工作台/客户列表提前加载整包 Next。
- 拆出后构建结果证明总重复体积下降，且首屏入口请求没有明显变差。

否则维持暂缓，让 Vite 自动处理。

**原则：** 只拆确定需要拆的，不确定的先交给 Vite 自动拆分。

## 验收标准

完成实施后，逐项验证：

- [ ] `npm run build -w @oem-crm/web` 构建成功，无错误
- [ ] 登录页 `/login` 可正常打开，无白屏
- [ ] 刷新 `/customers/:id/:tab?` 深链页面正常，不出现白屏或 loading 死循环
- [ ] `/reports` 和 `/settings` 权限跳转正常（无权限用户正确重定向）
- [ ] 页面切换（导航栏点击、浏览器前进/后退）无白屏或错误边界触发
- [ ] 模拟 chunk 加载失败（构建后删除一个异步 chunk 再访问对应页面），应显示错误提示 + 刷新按钮，不白屏
- [ ] 模拟 `vite:preloadError` 事件，应显示同一个刷新兜底
- [ ] chunk 加载失败后切换到其他路径，错误态不会卡死在旧页面
- [ ] 首屏入口 JS 体积有构建前后对比记录

## 实施步骤

| 步骤 | 文件 | 内容 |
|------|------|------|
| 1 | `routes.tsx` | 所有页面组件改为 `lazy(() => import(...).then(m => ({ default: m.XxxPage })))` |
| 2 | `main.tsx` | `<RouterProvider />` 外包全局 `<Suspense>` + `<ChunkErrorBoundary>` 兜底（覆盖 `/login`） |
| 3 | `layouts/AppShell.tsx` | `<Outlet />` 包裹 `<Suspense>` + `<ChunkErrorBoundary>`（认证页面的加载和错误处理） |
| 4 | `components/PageLoadingSkeleton.tsx` | 新建纯 CSS 骨架屏组件（不依赖 @alifd/next） |
| 5 | `components/ChunkErrorBoundary.tsx` | 新建 React ErrorBoundary，捕获 chunk 加载失败并提示用户刷新（不依赖 @alifd/next） |
| 6 | 构建 + 验证 | `npm run build -w @oem-crm/web`，检查 chunk 拆分结果，按验收标准逐项验证 |
| 7 | （可选）`vite.config.ts` | 先检查 `dist/assets` chunk 分布；只有公共依赖重复或入口 chunk 不理想时才添加 `manualChunks`。第一步只拆 `react-vendor`，重新构建验证收益；`alifd-vendor` 只有证明重复体积明显且不拖累首屏时才启用 |

## 风险与注意事项

1. **命名导出** — 所有页面组件都是 `export function` 命名导出，必须用 `.then(m => ({ default: m.XxxPage }))` 模式，否则 `lazy()` 无法正常加载。

2. **LoginPage 的 Suspense/ErrorBoundary 覆盖** — `/login` 不在 AppShell 的 `<Outlet />` 下，AppShell 内的 Suspense/ErrorBoundary 无法覆盖。必须在 `main.tsx` 的 `<RouterProvider />` 外层同时加全局 Suspense 和 ChunkErrorBoundary 兜底，否则登录页 lazy 后既无 loading fallback 也无 chunk 错误处理。

3. **RequireReportAccess / RequireSettingsAccess** — 这两个 wrapper 保持为普通函数组件（不 lazy），内部引用 lazy 后的 `ReportsPage` / `SettingsPage`，行为不变。

4. **路由 params** — `CustomerDetailPage` 使用 `:id/:tab?`，`SettingsPage` 使用 `:section?`，lazy 不影响参数传递。

5. **骨架屏和 ErrorBoundary 不要依赖 @alifd/next** — `PageLoadingSkeleton` 和 `ChunkErrorBoundary` 必须用纯 CSS/HTML 实现。如果引用 Next 的组件，本身就会把整个 Next 库拉进首屏 bundle，削弱拆包收益。

6. **chunk 拆分验证口径** — 不要求"每个页面严格一个独立 chunk"，Vite/Rollup 可能生成共享 chunk。验证重点是"主要页面已被拆出异步 chunk，shared/vendor chunk 规模合理"。

7. **开发体验** — Vite dev server 本身就是按需编译的，`lazy()` 在开发模式下不影响 HMR 速度。

8. **构建后验证** — 必须执行 `npm run build -w @oem-crm/web` 并按验收标准逐项验证，记录首屏入口 JS 体积变化。

9. **SSE 连接** — 当前 `AppShell` 挂载时通过 `useSse` 建立 EventSource 连接。这个属于独立优化项，不在本方案范围内，后续单独评估。

10. **AppShell 首屏体积不在本次范围** — AppShell 自身的 lucide-react 图标、Toast、SSE、侧边导航等逻辑不参与本次拆分。本方案只做页面级代码分割。若页面拆分后首屏仍不理想，再单独评估 AppShell 内图标按需加载、Toast 懒注册、SSE 延迟连接等策略。

11. **Suspense 与 ErrorBoundary 的分工** — `Suspense` 只处理加载中的 pending 状态（lazy 组件未加载完成），不处理 chunk 404、网络超时、部署后旧 chunk hash 失效等错误。必须搭配 `ChunkErrorBoundary` 才能在 chunk 加载失败时提供恢复手段（刷新页面），否则用户看到的是不可恢复的白屏。
