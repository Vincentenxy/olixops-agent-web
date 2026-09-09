# olixops-agent-web

`olixops-agent` 的独立 Web 控制台。使用 React + TypeScript + Vite SPA，配合 FastAPI 后端提供本地用户登录、账户管理、基础服务检查和部署需求草稿。

基础设施执行方案为 **Pulumi**。当前提供登录与平台基础能力，Agent、MCP 查询、真实部署任务和 Pulumi 资源变更工作流等待业务设计；“提交部署”保持禁用。

## 当前页面

| 路径        | 行为                                                      |
| ----------- | --------------------------------------------------------- |
| `/login`    | 用户名/密码登录、错误反馈；已有会话时恢复登录             |
| `/`         | 受保护工作台；手动保存、恢复、清空当前用户的需求草稿      |
| `/tasks`    | 受保护的任务未接入空态                                    |
| `/settings` | 受保护的真实数据库、Redis、认证与 Pulumi SDK/CLI 状态检查 |
| `/account`  | 账户身份、修改密码；成功后退出所有会话并重新登录          |
| 其他路径    | 登录后显示 404 与返回工作台入口                           |

刷新页面时使用后端 HttpOnly Cookie 恢复会话，访问令牌仅保留内存。受保护请求遇到 401 时合并并发刷新并最多重试一次；403 保持权限错误。退出会清空内存令牌、查询缓存与当前用户草稿，并调用后端撤销会话。

草稿按后端 `user_id` 隔离存入浏览器 `localStorage`，仅允许非敏感需求，退出或会话失效时清除。旧版没有所属用户的草稿不会迁入任何账号。仓库 URL 必须使用 HTTPS，且不含凭据、查询参数或片段；默认分支为 `main`。

## 技术栈

| 组件              | 选型                                             |
| ----------------- | ------------------------------------------------ |
| 运行环境          | Node.js 24（本地基线 24.1.0），pnpm 10.11.1      |
| UI                | React 19.2.8、TypeScript 6.0.3、Ant Design 6.6.3 |
| 开发与构建        | Vite 8.2.2                                       |
| 路由 / 服务端数据 | React Router 8.3.1 / TanStack Query 5.102.8      |
| 后端 / IaC        | 独立 FastAPI 服务 / Pulumi Automation API        |

精确依赖以 [package.json](package.json)、[pnpm-lock.yaml](pnpm-lock.yaml) 和 [.node-version](.node-version) 为准；CI 安装使用 `--frozen-lockfile`。

## 本地启动与登录

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

生产输出为 `dist/`。自动化测试覆盖认证路由、错误登录、刷新恢复、并发 401、退出竞态、缓存/草稿清理、密码更新，以及统一 API 与草稿交互。浏览器和真实后端联调结果单独记录在 [todo.md](todo.md)。

## 容器部署

[Dockerfile](Dockerfile) 使用 Node 构建、Nginx 托管。启动时官方 Nginx entrypoint 对 [配置模板](deploy/nginx.conf.template) 执行 envsubst，过滤器仅替换 `API_UPSTREAM`，保留 `$uri` 等 Nginx 变量。

- `API_UPSTREAM` 默认 `http://api:8000`，可在容器环境变量中改为实际 API 根地址，不加路径前缀。
- `/api/` 转发真实后端并透传 Cookie、Authorization 和请求 ID；不会回退成 SPA HTML，也不返回模拟结果。
- `/healthz` 仅检查静态站点；页面路径回退到 `index.html`，`/assets/` 使用不可变缓存。
- Nginx 转发当前 Host，并以当前连接重建 `X-Forwarded-For` / `X-Forwarded-Proto`。生产 TLS 终止、可信代理范围、Cookie Secure 与认证 Origin 允许列表由部署环境配置。
- 后端 Compose 的 `app` profile 可构建相邻前端仓库并提供同源入口；具体命令和首次账号创建见后端 README。

## 开发规范

- [AGENTS.md](AGENTS.md)：按任务类型读取开发规范。
- [UI 开发规范](docs/ui-development-standards.md)：完整项目内副本，适用于页面和交互实现。
- [前端接口契约](docs/frontend-development.md)：认证、请求、状态与业务边界。
- [todo.md](todo.md)：待接入业务、运行条件及验证记录。

协议变更需同时更新请求解析、测试与文档，并与后端实际 OpenAPI 核对。
