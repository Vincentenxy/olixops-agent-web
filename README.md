# olixops-agent-web

`olixops-agent` 的独立 Web 控制台。使用 React + TypeScript + Vite SPA，配合 FastAPI 后端提供本地用户登录、账户管理、基础服务检查、需求草稿与 LangGraph 方案分析。

当前 Agent 可将 Redis / PostgreSQL 需求整理为 Kubernetes 部署规格，支持补充信息、修改方案和恢复分析会话。MCP 环境查询和真实部署任务尚未接入；“提交部署”保持禁用。

用户确认的后续开发路线见 [Redis 开发计划](../olixops-agent/design/redis-development-plan.md)（[独立检出入口](https://github.com/Vincentenxy/olixops-agent/blob/main/design/redis-development-plan.md)）：先验证集群与固定参数模板，再接 Git 配置版本、独立 kubectl Worker、前端发布和自然语言入口。**业务开发暂不使用 Pulumi**，现有代码、依赖及 SDK/CLI 状态诊断保留。前端阶段与接入条件记录在 [todo.md](todo.md)。

## 当前页面

| 路径             | 行为                                                      |
| ---------------- | --------------------------------------------------------- |
| `/login`         | 用户名/密码登录、错误反馈；已有会话时恢复登录             |
| `/`              | 受保护工作台；当前用户草稿与自然语言需求分析              |
| `/tasks`         | 当前用户最近 50 个分析方案，查看状态、刷新或新建方案      |
| `/tasks/:taskId` | 持久对话、补充需求、失败重试与结构化部署规格              |
| `/settings`      | 受保护的真实数据库、Redis、认证与 Pulumi SDK/CLI 状态检查 |
| `/account`       | 账户身份、修改密码；成功后退出所有会话并重新登录          |
| 其他路径         | 登录后显示 404 与返回工作台入口                           |

刷新页面时使用后端 HttpOnly Cookie 恢复会话，访问令牌仅保留内存。受保护请求遇到 401 时合并并发刷新并最多重试一次；403 保持权限错误。退出会清空内存令牌、查询缓存与当前用户草稿，并调用后端撤销会话。

草稿按后端 `user_id` 隔离存入浏览器 `localStorage`，仅允许非敏感需求，退出或会话失效时清除。旧版没有所属用户的草稿不会迁入任何账号。仓库 URL 必须使用 HTTPS，且不含凭据、查询参数或片段；默认分支为 `main`。

## 分析一个部署方案

在工作台填写需求并点击“分析需求”，例如“在测试集群的 demo 命名空间部署 Redis 7.4，名称 cache，存储 10 GiB，单副本”。分析仅发送需求正文，每次 1–4000 字，无需填写仓库；仓库和分支字段仍只作为草稿保存。也可以先说“部署一个 PostgreSQL”，再根据 Agent 的问题补充参数。

创建后进入方案详情。后端保存会话并异步分析，页面每 2 秒查询正在分析的任务；可以离开页面或刷新，再从方案列表继续。待补充或方案就绪时可继续发送需求，失败时可手动重试。方案并发修改会提示刷新并保留输入，不覆盖其他页面的新版本。

“方案已就绪”只表示结构化规格已生成，不代表集群存在、资源变更已预览或应用已部署。分析服务需由管理员按后端 README 配置模型；未配置时前端禁用分析并提供重新检查入口。错误界面使用固定业务提示和请求编号，不展示模型供应商的原始异常。

## 技术栈

| 组件              | 选型                                                           |
| ----------------- | -------------------------------------------------------------- |
| 运行环境          | Node.js 24（本地基线 24.1.0），pnpm 10.11.1                    |
| UI                | React 19.2.8、TypeScript 6.0.3、Ant Design 6.6.3               |
| 开发与构建        | Vite 8.2.2                                                     |
| 路由 / 服务端数据 | React Router 8.3.1 / TanStack Query 5.102.8                    |
| 后端 / 部署规划   | 独立 FastAPI 服务 / Git + Kustomize + kubectl Worker（待接入） |

精确依赖以 [package.json](package.json)、[pnpm-lock.yaml](pnpm-lock.yaml) 和 [.node-version](.node-version) 为准；CI 安装使用 `--frozen-lockfile`。

## 本地启动与登录

本项目统一使用 **pnpm 10.11.1** 安装依赖和执行脚本，锁文件为 `pnpm-lock.yaml`；不要在项目目录混用 `npm install` 或 `yarn install`。先执行 `pnpm --version` 确认版本；尚未安装 pnpm 时，可执行 `npm install -g pnpm@10.11.1` 安装工具，再使用下述 pnpm 命令。

1. 先按后端 `olixops-agent/README.md` 完成数据库迁移、签名密钥和本地用户初始化，并启动 API。当前没有默认公开密码或前端注册入口。
2. 在前端仓库执行：

```bash
pnpm install --frozen-lockfile
pnpm dev --port 5175 --strictPort
```

3. 打开 `http://127.0.0.1:5175`，输入后端创建的用户名和密码。进入“连接与配置”检查基础服务，进入“账户设置”验证改密与重新登录。

浏览器始终请求同源 `/api`。开发代理默认转发 `http://127.0.0.1:8000`，其他目标通过 shell 设置：

```bash
API_PROXY_TARGET=http://127.0.0.1:8001 pnpm dev --port 5175 --strictPort
```

[.env.example](.env.example) 记录用法；当前 [Vite 配置](vite.config.ts) 读取 shell 变量，复制 `.env` 不会自动改变代理。浏览器地址的 Origin 必须在后端认证允许列表中；本地默认允许 127.0.0.1/localhost 的 5173、5175 端口，其他地址需同步配置后端。代理不改写浏览器 Origin。

`VITE_*`、浏览器包和静态资源均属于公开配置，不能放密码、签名私钥或 Pulumi/云凭据。后端断开时登录或状态检查显示真实错误，不使用模拟登录绕过。

### 安装报错排查

如果误执行 `npm install` 后出现 `Cannot read properties of null (reading 'matches')`，先改用 `pnpm install --frozen-lockfile`，再执行 `pnpm check` 验证依赖和构建。本机 npm 11.3.0 在读取既有 `.pnpm` 链接目录时已复现此错误，使用 pnpm 10.11.1 安装通过。无需为此删除 `pnpm-lock.yaml`、清理全局缓存或升级 Node。

## 检查与构建

| 命令                                | 用途                         |
| ----------------------------------- | ---------------------------- |
| `pnpm dev`                          | 本地开发                     |
| `pnpm lint`                         | ESLint，警告视为失败         |
| `pnpm format:check` / `pnpm format` | Prettier 检查 / 写入格式化   |
| `pnpm typecheck`                    | TypeScript 检查              |
| `pnpm test` / `pnpm test:watch`     | Vitest 单次 / 监听           |
| `pnpm build`                        | 类型检查及静态生产构建       |
| `pnpm preview`                      | 本地预览构建产物             |
| `pnpm check`                        | lint、格式、类型、测试、构建 |

生产输出为 `dist/`。自动化测试覆盖认证路由、错误登录、刷新恢复、并发 401、退出竞态、缓存/草稿清理、密码更新、统一 API、草稿交互及 Agent 分析、幂等重试、版本冲突、轮询和规格呈现。浏览器和真实后端联调结果单独记录在 [todo.md](todo.md)。

## 容器部署

[Dockerfile](Dockerfile) 使用 Node 构建、Nginx 托管。启动时官方 Nginx entrypoint 对 [配置模板](deploy/nginx.conf.template) 执行 envsubst，过滤器仅替换 `API_UPSTREAM`，保留 `$uri` 等 Nginx 变量。

- `API_UPSTREAM` 默认 `http://api:8000`，可在容器环境变量中改为实际 API 根地址，不加路径前缀。
- `/api/` 转发真实后端并透传 Cookie、Authorization 和请求 ID；不会回退成 SPA HTML，也不返回模拟结果。
- `/healthz` 仅检查静态站点；页面路径回退到 `index.html`，`/assets/` 使用不可变缓存。
- Nginx 转发当前 Host，并以当前连接重建 `X-Forwarded-For` / `X-Forwarded-Proto`。生产 TLS 终止、可信代理范围、Cookie Secure 与认证 Origin 允许列表由部署环境配置。
- 后端 Compose 的 `app` profile 可构建相邻前端仓库并提供同源入口；具体命令和首次账号创建见后端 README。

## 开发规范

- [AGENTS.md](AGENTS.md)：按任务类型读取开发规范。
- [Redis 开发计划](../olixops-agent/design/redis-development-plan.md)（[远程正文](https://github.com/Vincentenxy/olixops-agent/blob/main/design/redis-development-plan.md)）：后续 AI 按阶段实施的唯一计划正文。
- [UI 开发规范](docs/ui-development-standards.md)：完整项目内副本，适用于页面和交互实现。
- [前端接口契约](docs/frontend-development.md)：认证、请求、状态与业务边界。
- [todo.md](todo.md)：待接入业务、运行条件及验证记录。

协议变更需同时更新请求解析、测试与文档，并与后端实际 OpenAPI 核对。
