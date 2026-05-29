# Email SMTP / IMAP 修改时间线汇总

## 1. 文档目的

本文档按时间线汇总本轮会话中对邮箱模块的 SMTP / IMAP 相关修改、排查结论和当前最终状态，便于：

- 团队回顾修改过程
- 给 Codex / 其他 AI reviewer 做上下文输入
- 后续继续演进邮箱模块时快速了解当前实现基础

相关核心模块包括：

- `apps/api/src/modules/emails/smtp.service.ts`
- `apps/api/src/modules/emails/imap-sync.service.ts`
- `apps/api/src/modules/emails/emails.service.ts`
- `apps/api/src/modules/emails/emails.controller.ts`
- `apps/web/src/pages/EmailCenterPage.tsx`
- `apps/web/src/api/http.ts`

---

## 2. 初始问题背景

在邮箱配置页完成邮箱账号配置后，点击“测试”按钮时，前端最初表现为：

- 统一返回 `500 Internal server error`
- 无法明确区分是 SMTP 问题还是 IMAP 问题
- 无法判断是认证失败、协议未开启、端口/SSL 不匹配，还是服务端代码本身存在错误

在排查过程中确认：

1. IMAP 日志最初出现：
   - `custom imap off`
   - 说明邮箱服务端明确拒绝 IMAP 登录，属于账号 / 邮箱后台功能未开启问题
2. SMTP 日志最初出现：
   - `Cannot read properties of undefined (reading 'createTransport')`
   - 说明 `nodemailer` 导入方式与当前 CommonJS / TS 运行方式不兼容

---

## 3. 第一阶段：修复 SMTP 基础运行错误

### 3.1 修复 `nodemailer` 导入兼容问题

文件：

- `apps/api/src/modules/emails/smtp.service.ts`

### 初始实现

原先使用：

```ts
import nodemailer from "nodemailer";
```

在当前项目运行环境下会导致：

- `createTransport` 为 `undefined`

### 修改结果

改为兼容当前 CommonJS 运行方式的导入写法：

```ts
import * as nodemailer from "nodemailer";
```

### 结果

- `createTransport()` 可以正常调用
- SMTP 测试进入真实连接和认证阶段

---

## 4. 第二阶段：把邮箱测试错误提示改清楚

### 4.1 问题

最初测试失败时：

- 前端只收到 500
- 用户无法知道到底是 SMTP 错误还是 IMAP 错误

### 4.2 后端改造

文件：

- `apps/api/src/modules/emails/emails.service.ts`

### 增加的能力

在 `testAccount()` 中为 SMTP 和 IMAP 测试分别增加错误翻译逻辑：

- `mapSmtpTestError()`
- `mapImapTestError()`

### 支持识别的错误类型

#### SMTP
- 认证失败
- 用户名/授权码错误
- 端口/SSL 不匹配
- 连接失败
- 证书/TLS 问题

#### IMAP
- IMAP 未开启
- 用户名/授权码错误
- 端口/SSL 不匹配
- 连接失败

### 结果

后端不再只抛模糊 500，而能给出更清楚的中文提示。

---

## 5. 第三阶段：改进前端错误消息解析

### 5.1 问题

后端虽然开始返回结构化错误，但前端最初仍然会把整个 JSON 字符串直接显示出来，例如：

```json
{"message":"SMTP 测试失败，请检查服务器地址、端口、SSL、用户名和授权码配置。","error":"Bad Request","statusCode":400}
```

### 5.2 修改文件

- `apps/web/src/api/http.ts`

### 修改内容

对非 2xx 响应：

- 优先解析 JSON
- 优先提取 `message`
- 如果 JSON 解析失败，再回退到原始文本

### 结果

前端可以直接显示后端 message，而不是整段 JSON 原文。

---

## 6. 第四阶段：统一测试结果到页面顶部状态栏

### 6.1 目标

让“测试邮箱”的结果与“同步邮箱”的提示方式一致，统一显示在页面顶部状态栏里。

### 6.2 修改文件

- `apps/web/src/pages/EmailCenterPage.tsx`
- `apps/api/src/modules/emails/emails.service.ts`

### 修改内容

#### 后端
测试成功时返回：

```json
{
  "ok": true,
  "smtp": "ok",
  "imap": "ok",
  "message": "邮箱测试成功：SMTP 与 IMAP 均连接正常。"
}
```

#### 前端
`testAccount` mutation 成功后：

- 优先显示后端返回的 `result.message`
- 所有成功/失败信息统一通过顶部状态栏 `setMessage(...)` 输出

### 结果

用户无需看控制台，也能在界面顶部看到统一反馈。

---

## 7. 第五阶段：重构邮箱测试为“分项结果”而不是“整体失败”

### 7.1 问题认定

在进一步排查后确认，当前邮箱测试功能存在设计缺陷：

- SMTP 和 IMAP 被耦合为一个成功/失败结果
- 任何一项失败都会整体报错
- 会把“部分可用（比如 SMTP 正常、IMAP 失败）”误判成“完全不可用”

这与 `docs/Email_Test_Refactor_Proposal.md` 的判断一致。

### 7.2 修改文件

- `apps/api/src/modules/emails/emails.service.ts`
- `apps/api/src/modules/emails/imap-sync.service.ts`
- `apps/web/src/pages/EmailCenterPage.tsx`

### 7.3 具体修改

#### 后端 `testAccount()`
从：

- SMTP 失败就抛 400
- IMAP 失败就抛 400

改为：

- 分别测试 SMTP 和 IMAP
- 分别生成结果对象
- 汇总成统一结构返回

现在返回结构为：

```json
{
  "overallOk": false,
  "smtp": { "ok": true, "message": "SMTP 连接正常。" },
  "imap": { "ok": false, "message": "IMAP 未开启，请先在邮箱后台启用 IMAP 或第三方客户端访问。" },
  "message": "SMTP 正常，IMAP 未开启。该邮箱当前可用于发信，但无法同步回复。"
}
```

#### IMAP 基础测试降级
原先 `verifyAccount()` 需要：

- `connect()`
- `getMailboxLock("INBOX")`

现在改为：

- 只验证连接和认证
- 不在“测试邮箱”路径中要求 `INBOX` lock

这样降低了误判概率。

#### 前端返回类型调整
`EmailCenterPage.tsx` 中的测试 mutation 改为接收新的结构化结果，并继续显示 `result.message`。

### 结果

邮箱测试不再是简单的“全或无”，而是能表达：

- SMTP 正常 / IMAP 失败
- IMAP 正常 / SMTP 失败
- 两者都正常

---

## 8. 第六阶段：给 SMTP 增加调试日志

### 8.1 目标

因为 IMAP 默认有较详细的协议日志，而 SMTP 没有，所以排查 SMTP 问题时信息不足。

### 8.2 修改文件

- `apps/api/src/modules/emails/smtp.service.ts`

### 修改内容

给 `nodemailer.createTransport()` 增加：

```ts
logger: true,
debug: true,
```

### 结果

后端测试时可以看到：

- SMTP 建连
- TLS 握手
- EHLO
- AUTH
- 退出连接

这使得 SMTP 可以像 IMAP 一样做深度排查。

---

## 9. 第七阶段：引入 `tls.servername` 兼容 IP 排查场景

### 9.1 背景

在排查 `smtp.139.com` 的 DNS 超时问题时，使用 IP 地址：

- `120.232.169.42`

可以绕过域名解析，但会触发证书校验失败：

- `IP is not in the cert's list`

### 9.2 修改文件

- `apps/api/src/modules/emails/smtp.service.ts`

### 修改内容

增加：

- 当 `smtpHost` 是 IP 时，推导 `tls.servername`
- 优先从 `smtpUsername` 的邮箱域名推导，例如：
  - `13428277520@139.com`
  - 推导为 `smtp.139.com`

### 结果

在“手动填 IP 排查 DNS”场景下：

- 连接可以走 IP
- 证书仍按域名校验

这是一个排查增强，而不是最终产品方案。

---

## 10. 第八阶段：将 SMTP 连接层改造成可复用部署方案

### 10.1 问题背景

前面的 IP 方案只能用于排查，不能作为正式部署方案。

原因：

- 不能要求用户手工填写 IP
- 不能要求每台部署主机修改 `hosts`
- 不适合不同邮箱服务商复用

### 10.2 目标

将 SMTP 连接层改造成：

- 用户继续填写域名，如 `smtp.139.com`
- 服务端内部预解析域名
- 优先 IPv4 建连
- TLS 证书仍按原始域名校验

### 10.3 修改文件

- `apps/api/src/modules/emails/smtp.service.ts`

### 10.4 具体修改

#### 新增 DNS 预解析
引入：

```ts
import { promises as dns } from "node:dns";
```

新增：

```ts
async function resolveSmtpHost(host: string) {
  if (isIpAddress(host)) return host;
  const result = await dns.lookup(host, { family: 4 });
  return result.address;
}
```

#### `createTransport()` 改为异步
原来：

- 直接使用 `account.smtpHost`

现在：

- 先 `await resolveSmtpHost(account.smtpHost)`
- 再把解析到的 IPv4 地址作为真实连接 host

#### 保留 `tls.servername`
- 如果原始 `smtpHost` 是域名，则证书校验按域名走
- 如果原始 `smtpHost` 是 IP，则继续按当前兼容逻辑处理

#### `verify()` 和 `send()` 统一复用
从：

```ts
const transport = this.createTransport(account)
```

改成：

```ts
const transport = await this.createTransport(account)
```

这样无论：

- 测试邮箱
- 真实发信

都走同一套“服务端预解析 + IPv4 优先 + TLS 按域名校验”的连接逻辑。

### 10.5 结果

现在项目可以支持：

- 用户继续填写标准 SMTP 域名
- 服务端内部自动预解析
- 避免 Node 运行时对某些域名解析不稳定导致的 `queryA ETIMEOUT`
- 保持可部署、可复用，而不是只适用于当前开发机

---

## 11. 关键排查结论时间线

### 阶段 A：最初失败
- IMAP 未开启
- SMTP 默认导入崩溃

### 阶段 B：IMAP 登录成功
- 说明用户名、授权码、IMAP 协议本身没问题

### 阶段 C：SMTP 域名报 `queryA ETIMEOUT`
- 说明更像 Node DNS 解析问题，而不是认证问题

### 阶段 D：SMTP 用 IP 成功握手和认证
- 说明 SMTP 服务端本身是正常的
- 问题在域名解析链路

### 阶段 E：最终改造成服务端预解析方案
- 不再依赖 IP 填写
- 不再依赖本机 `hosts`
- 更适合作为正式部署策略

---

## 12. 当前最终状态

本轮完成后，邮箱 SMTP / IMAP 模块具备如下状态：

### 已具备
- SMTP 导入兼容修复
- SMTP 协议调试日志
- IMAP 基础连接与认证测试
- SMTP / IMAP 分项结果返回
- 顶部状态栏统一展示结果
- SMTP 服务端预解析域名
- IPv4 优先建连
- TLS 按域名校验
- 测试链路与真实发信链路复用同一套连接策略

### 仍未做
- 邮箱 provider 预设（139、QQ、网易、Gmail、Outlook 等）
- OAuth2 / App Password 专用认证模式分层
- SMTP / IMAP 分项结果的更细粒度 UI 展示
- 测试结果持久化（如 `lastTestedAt`、`testSnapshot`）
- 更强的自动回退（多 IP 尝试、IPv6 回退等）

---

## 13. 本轮修改涉及的主要文件

### 后端
- `apps/api/src/modules/emails/smtp.service.ts`
- `apps/api/src/modules/emails/imap-sync.service.ts`
- `apps/api/src/modules/emails/emails.service.ts`

### 前端
- `apps/web/src/pages/EmailCenterPage.tsx`
- `apps/web/src/api/http.ts`

### 文档
- `docs/Change.md`
- `docs/Email_Test_Refactor_Proposal.md`
- `docs/Email_SMTP_IMAP_Change_Timeline.md`

---

## 14. 校验与结果

本轮改动完成后，已执行类型检查：

```bash
npm run lint -w @oem-crm/api
npm run lint -w @oem-crm/web
```

结果：

- API 通过
- Web 通过

---

## 15. 一句话总结

本轮对邮箱模块的修改，已经从“基础 SMTP/IMAP 测试 + 模糊失败提示”，演进到：

> **可区分 SMTP / IMAP 分项状态、支持服务端预解析 SMTP 域名、优先 IPv4、保持 TLS 域名校验、适合部署到其他主机复用的基础邮箱接入实现。**
