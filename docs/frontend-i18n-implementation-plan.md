# 前端国际化翻译功能实现方案

## 1. 背景与目标

项目计划支持中文、英语、西语三种界面语言，用户可以在前端通过下拉框随时自由切换语言。切换后立即影响当前页面和后续页面展示，并在浏览器本地持久化，刷新页面后保持上次选择。

本方案采用前端主导实现，不新增用户表字段，不要求登录态绑定语言偏好，不改动后端权限、认证、业务数据合同。

## 2. 支持语言

| 语言 | Locale | 展示名称 |
| --- | --- | --- |
| 中文 | `zh-CN` | 中文 |
| 英语 | `en-US` | English |
| 西语 | `es-ES` | Español |

默认语言为 `zh-CN`。

## 3. 范围边界

### 3.1 本期处理

- 登录页、主导航、系统设置入口等固定 UI 文案。
- 通用组件文案：按钮、空态、加载态、错误态、toast、弹窗基础操作。
- 业务枚举标签：客户阶段、跟进任务类型、报价状态等。
- 前端表格表头、筛选项、表单 label、placeholder、校验提示。
- 前端下拉框语言切换控件。
- 浏览器本地持久化语言选择。

### 3.2 本期不处理

- 不翻译客户录入的名称、备注、邮件正文、附件名等业务数据。
- 不翻译历史 AI 报告、历史跟进任务描述、历史审计日志内容。
- 不新增后端用户语言偏好字段。
- 不让后端根据语言返回不同结构的数据。
- 不把中文文案继续散落在页面组件里。

这些内容如果未来需要多语言版本，应作为独立的数据翻译能力或 AI 内容生成能力设计，不能混入 UI 国际化层。

## 4. 总体设计

推荐使用 `i18next` 和 `react-i18next` 作为前端国际化基础设施。

核心 owner：

- `apps/web/src/i18n`：前端 UI 翻译资源、语言初始化、语言切换 API。
- `packages/shared/src/labels.ts`：跨前后端共享枚举标签的多语言真源。
- `apps/web/src/layouts/AppShell.tsx`：主界面语言下拉框入口。
- `localStorage.preferredLocale`：浏览器本地语言选择持久化。

UI 页面只消费 `t()`、共享 label helper 或结构化 locale，不直接判断当前语言，也不私自维护翻译字典。

## 5. 文件结构建议

```text
apps/web/src/i18n/
  index.ts
  locale.ts
  resources/
    zh-CN.ts
    en-US.ts
    es-ES.ts
  useLocale.ts

packages/shared/src/
  i18n.ts
  labels.ts
```

说明：

- `apps/web/src/i18n/index.ts` 初始化 i18next。
- `apps/web/src/i18n/locale.ts` 负责读取、校验、保存前端语言。
- `apps/web/src/i18n/resources/*.ts` 存放三语言翻译资源。
- `apps/web/src/i18n/useLocale.ts` 封装切换语言的 hook，供下拉框使用。
- `packages/shared/src/i18n.ts` 定义 `Locale`、`SUPPORTED_LOCALES`、`DEFAULT_LOCALE`、`normalizeLocale()`。
- `packages/shared/src/labels.ts` 改造为支持 `locale` 参数。

## 6. 语言选择优先级

应用启动时按以下顺序确定语言：

1. `localStorage.preferredLocale`
2. 浏览器语言 `navigator.language`
3. 默认语言 `zh-CN`

如果浏览器语言是 `zh`、`zh-CN`、`zh-Hans`，归一化为 `zh-CN`。

如果浏览器语言是 `en`、`en-US`、`en-GB`，归一化为 `en-US`。

如果浏览器语言是 `es`、`es-ES`、`es-MX`，归一化为 `es-ES`。

其他语言全部回退到 `zh-CN`。

## 7. 前端下拉框设计

语言切换控件放在主界面固定位置，建议放在 `AppShell` 侧边栏底部或顶部品牌区域附近。登录页也应提供同样控件，保证未登录用户能切换语言。

交互规则：

- 使用普通下拉框或项目已有 `AppSelect` 组件。
- 当前选中项展示当前语言。
- 用户切换后立即调用 `i18n.changeLanguage(locale)`。
- 切换成功后写入 `localStorage.preferredLocale`。
- 不刷新页面。
- 不调用后端接口。
- 不影响 token、权限、路由和业务数据缓存。

示例伪代码：

```tsx
const { locale, setLocale, options } = useLocale();

<AppSelect
  value={locale}
  onChange={(nextLocale) => setLocale(nextLocale)}
  options={options}
/>
```

## 8. 翻译资源组织

翻译 key 按业务域组织，不按页面随意命名。

示例：

```ts
export const zhCN = {
  common: {
    save: "保存",
    cancel: "取消",
    delete: "删除",
    loading: "加载中..."
  },
  nav: {
    dashboard: "工作台",
    customers: "客户开发",
    emailCenter: "邮件中心",
    followUps: "跟进任务",
    knowledge: "企业资料库",
    reports: "数据看板",
    settings: "系统设置"
  },
  auth: {
    email: "邮箱",
    password: "密码",
    login: "登录",
    loggingIn: "登录中...",
    loginFailed: "登录失败，请检查邮箱和密码。"
  }
};
```

对应英语、西语资源必须保持相同 key 结构。缺失 key 应在开发期暴露，不允许静默显示空字符串。

## 9. 共享枚举标签改造

当前 `packages/shared/src/labels.ts` 中的阶段、任务、报价状态标签是单语言中文。应改为多语言结构：

```ts
export const STAGE_LABELS: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    PENDING_RESEARCH: "待背调"
  },
  "en-US": {
    PENDING_RESEARCH: "Pending research"
  },
  "es-ES": {
    PENDING_RESEARCH: "Pendiente de investigación"
  }
};

export function stageLabel(stage: string, locale: Locale = DEFAULT_LOCALE) {
  return STAGE_LABELS[locale]?.[stage] ?? STAGE_LABELS[DEFAULT_LOCALE]?.[stage] ?? stage;
}
```

页面消费枚举标签时统一传当前 locale：

```tsx
stageLabel(customer.stage, locale)
taskTypeLabel(task.type, locale)
quoteFlowStatusLabel(quote.status, locale)
```

这样可以避免每个页面自己维护状态翻译。

## 10. 后端处理原则

本方案下后端不负责 UI 翻译。

后端应继续返回稳定的业务码、枚举值和结构化错误，不根据语言返回不同字段。

后端中文文案分三类处理：

- 业务码、枚举、状态：返回 code，由前端翻译。
- 用户输入、AI 内容、历史记录：保持原文，不由 UI i18n 翻译。
- 后端异常 message：短期可保持现状；若要完整国际化，应另行设计错误码体系，由前端按错误码翻译。

## 11. 分阶段实施计划

### 阶段一：基础设施闭环

目标：语言切换可用，核心壳层可切换。

改动：

- 安装 `i18next`、`react-i18next`。
- 新增 `apps/web/src/i18n`。
- 在 `main.tsx` 初始化 i18n。
- 在 `LoginPage` 和 `AppShell` 加语言下拉框。
- 替换登录页、导航、通用 toast 文案。

验收：

```bash
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
```

浏览器验收：

- 登录页能切换中文、英语、西语。
- 主导航能切换中文、英语、西语。
- 刷新页面后保留上次选择。
- 切换语言不触发登出、不刷新页面、不破坏路由。

### 阶段二：共享标签和高频页面

目标：业务状态标签和主流程页面完成多语言。

改动：

- 改造 `packages/shared/src/labels.ts`。
- 替换客户列表、客户详情、跟进任务、邮件中心、数据看板中的固定文案。
- 表格表头、筛选项、按钮、空态全部接入 `t()`。

验收：

```bash
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
```

补充检查：

```bash
rg "[\u4e00-\u9fff]" apps/web/src packages/shared/src
```

检查结果中只允许保留：

- 注释。
- 测试 fixture。
- 用户业务数据示例。
- 暂未迁移且已记录的后续页面文案。

### 阶段三：复杂业务面收口

目标：报价、样品、设置、报告编辑等复杂页面完成迁移。

改动：

- 报价公式说明、审批弹窗、样品流程文案接入 i18n。
- 设置页各 section 的表单、表头、按钮接入 i18n。
- AI 报告编辑器字段标题接入 i18n。

验收：

```bash
npm run lint --workspaces --if-present
npm run build --workspaces --if-present
```

浏览器验收：

- 中文、英语、西语下按钮文字不溢出。
- 弹窗标题、footer 按钮、表单 label 无遮挡。
- 桌面和移动宽度下布局稳定。

## 12. 测试策略

### 单元测试

- `normalizeLocale()` 输入不同语言码时回退正确。
- `stageLabel()`、`taskTypeLabel()`、`quoteFlowStatusLabel()` 在三语言下返回正确。
- 缺失翻译时回退到 `zh-CN`，再回退到原始 code。

### 集成测试

- i18n 初始化读取 localStorage。
- 切换语言后 localStorage 更新。
- 页面重新渲染后使用新语言。

### UI 验收

- 登录页三语言展示。
- AppShell 导航三语言展示。
- toast 三语言展示。
- 表格、弹窗、表单在西语长文本下不溢出。

## 13. 风险与处理

| 风险 | 等级 | 处理方式 |
| --- | --- | --- |
| 页面硬编码中文迁移不完整 | 阻断问题 | 用 `rg` 扫描并按页面清单收口 |
| 西语文案更长导致按钮或表头溢出 | 阻断问题 | 浏览器截图验收，必要时调整布局宽度和换行 |
| 枚举标签多处重复翻译 | 设计风险 | 统一走 `packages/shared/src/labels.ts` |
| 后端错误 message 仍是中文 | 可记录债务 | 后续单独设计错误码翻译体系 |
| AI 生成内容语言与 UI 语言混淆 | 设计风险 | UI 语言只控制界面，不自动改写 AI 内容 |

## 14. 完成定义

本功能完成需满足：

- 用户可以在登录页和主界面通过下拉框切换中文、英语、西语。
- 切换后当前页面即时更新。
- 刷新后保留用户上次选择。
- 不依赖后端接口、不新增用户语言字段。
- 主导航、登录页、通用状态、toast、核心枚举标签完成三语言。
- 构建和类型检查通过。
- 已用 `rg` 扫描剩余中文，并明确剩余项是否属于业务数据、注释、测试或后续迁移范围。
