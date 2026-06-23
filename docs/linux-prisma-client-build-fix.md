# Linux 构建时 Prisma Client 类型错误修复

## 现象

Linux 服务器执行：

```bash
npm run build -w @oem-crm/api
```

出现大量错误，例如：

```text
Module '"@prisma/client"' has no exported member 'CustomerStage'
Module '"@prisma/client"' has no exported member 'WebsiteAnalysis'
Parameter 'row' implicitly has an 'any' type
Property 'dependsOn' does not exist on type '{}'
```

这些错误不应该通过给业务代码加大量 `any` 解决。

## 根因

这通常表示服务器上的 `@prisma/client` 不是根据当前项目的：

```text
apps/api/prisma/schema.prisma
```

生成的，或者生成结果是旧的/损坏的。

当 Prisma Client 类型丢失时，代码里的 Prisma 查询结果会退化，进而触发大量连锁 TypeScript 错误。

## 可靠修复步骤

在 Linux 服务器执行：

```bash
cd /home/yuewei/CRMforOEM

# 1. 停掉旧进程，避免端口和文件占用
fuser -k 4100/tcp || true
fuser -k 5174/tcp || true

# 2. 确认代码是最新的
git pull

# 3. 安装依赖
npm install

# 4. 用 API 的 schema 显式生成 Prisma Client
npx prisma generate --schema apps/api/prisma/schema.prisma

# 5. 验证 Prisma Client 是否生成了项目枚举和模型类型
grep -n "CustomerStage" node_modules/.prisma/client/index.d.ts | head
grep -n "WebsiteAnalysis" node_modules/.prisma/client/index.d.ts | head

# 6. 再构建 API
npm run build -w @oem-crm/api
```

如果第 5 步没有任何输出，说明 Prisma Client 仍然没有按项目 schema 生成。

## 如果仍然失败

清理旧生成物后重新生成：

```bash
cd /home/yuewei/CRMforOEM
rm -rf node_modules/.prisma node_modules/@prisma/client
npm install
npx prisma generate --schema apps/api/prisma/schema.prisma
npm run build -w @oem-crm/api
```

## 前端端口占用

如果出现：

```text
Port 5174 is already in use
```

说明旧 Vite 进程还在运行：

```bash
lsof -i :5174
fuser -k 5174/tcp
```

然后重新启动：

```bash
npm run dev
```

## 不建议的做法

不要为了绕过这些错误批量写：

```ts
(row: any) => ...
```

因为这会掩盖真正问题：Prisma Client 类型没有正确生成。
