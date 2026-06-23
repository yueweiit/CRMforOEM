# 本地开发环境搭建

本文档给同事拉取代码后搭建后端数据库和进入系统使用。

## 1. 依赖要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Docker Desktop

## 2. 环境变量

项目使用根目录 `.env` 作为本地配置文件：

```bash
cp .env.example .env
```

默认数据库连接如下：

```text
DATABASE_URL=postgresql://oem_crm:oem_crm_password@localhost:5432/oem_crm?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4100
WEB_PORT=5174
```

注意：真实的 `.env` 不会提交到 GitHub，只提交 `.env.example`。

## 3. 启动 PostgreSQL / Redis / MinIO

```bash
docker compose up -d postgres redis minio
```

确认 PostgreSQL 已经健康：

```bash
docker compose ps
```

默认数据库由 Docker Compose 自动创建：

- database: `oem_crm`
- user: `oem_crm`
- password: `oem_crm_password`
- port: `5432`

## 4. 初始化数据库表和基础账号

本项目不是手动导入一个单独的 `init.sql` 文件，而是使用 Prisma migration 管理表结构。

建表 SQL 文件位置：

```text
apps/api/prisma/migrations/*/migration.sql
```

初始化命令：

```bash
npx playwright install chromium
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:migrate` 会把 `apps/api/prisma/migrations` 里的 SQL 应用到 PostgreSQL。

`db:seed` 会创建组织、角色、权限和默认管理员账号。

## 5. 启动前后端

```bash
npm run dev
```

默认访问地址：

- 前端：http://localhost:5174
- 后端 API：http://localhost:4100/api
- Swagger：http://localhost:4100/api/docs

默认登录账号：

```text
Email: admin@oem-crm.local
Password: Admin@123456
```

## 6. 常见问题

### 找不到 SQL 配置文件

系统没有单独的 SQL 配置文件。数据库连接在根目录 `.env` 的 `DATABASE_URL`，建表 SQL 在 Prisma migration 目录：

```text
apps/api/prisma/migrations/*/migration.sql
```

正常只需要执行：

```bash
npm run db:migrate
```

### 后端启动了但无法登录

通常是没有执行 seed，导致没有默认管理员账号：

```bash
npm run db:seed
```

### 数据库连不上

先确认 Docker 里的 PostgreSQL 是否启动：

```bash
docker compose ps
```

如果本机 5432 端口被其他项目占用，可以改 `docker-compose.yml` 的端口映射和 `.env` 里的 `DATABASE_URL`。

例如把本机端口改成 5433：

```yaml
ports:
  - "5433:5432"
```

然后 `.env` 改成：

```text
DATABASE_URL=postgresql://oem_crm:oem_crm_password@localhost:5433/oem_crm?schema=public
```

### 进入 apps/api 后单独运行 Prisma

推荐在项目根目录运行 `npm run db:*` 命令。若必须进入 `apps/api` 单独运行，需要让 `apps/api` 能读到根目录环境变量，例如：

```bash
ln -sf ../../.env apps/api/.env
```

Windows 环境可以直接复制一份：

```bash
copy .env apps\api\.env
```
