# olixops-agent-web

`olixops-agent` 的独立 Web 控制台，围绕自然语言需求、部署任务和 Pulumi 变更构建操作工作区。

前端采用 React + TypeScript + Vite SPA，后端独立使用 FastAPI。控制台以登录后的交互操作为主，当前无需 SSR；前端交付静态资源，Agent 编排和 Pulumi 执行保留在后端。

## 当前范围

本轮初始化提供中文紧凑工作台、需求草稿、任务未接入空态和连接状态入口。真实任务创建、MCP 查询、Pulumi preview/up（变更预览/更新）和部署结果尚未接入；“提交部署”保持禁用，健康检查通过也不会启用。

| 路径        | 当前行为                                                                       |
| ----------- | ------------------------------------------------------------------------------ |
| `/`         | 编辑部署需求、可选的 HTTPS 仓库地址与分支/版本；手动保存、恢复和清空浏览器草稿 |
| `/tasks`    | 显示任务服务尚未接入的空态                                                     |
| `/settings` | 实际调用后端健康接口，展示检查状态、失败请求编号和各功能待接入项，可手动刷新   |
| 其他路径    | 显示 404 与返回工作台入口                                                      |

草稿保存在当前浏览器的 `localStorage`，只允许非敏感需求。保存会检查需求非空、内容长度以及仓库 URL；仓库地址使用 HTTPS，且不能包含凭据、查询参数或片段。草稿没有自动保存或跨设备同步，默认分支为 `main`。

后端同步初始化最小 FastAPI 服务，提供 `GET /api/v1/pub/health`、统一错误响应和 `X-Request-Id`。健康检查成功表示 API 可访问，不表示端到端部署已经完成。

## 技术栈

| 组件       | 选型与用途                                  |
| ---------- | ------------------------------------------- |
| 运行环境   | Node.js 24（本地基线 24.1.0），pnpm 10.11.1 |
| UI         | React 19.2.8 + TypeScript 6.0.3             |
| 开发与构建 | Vite 8.2.2                                  |
| 页面路由   | React Router 8.3.1                          |
| 服务端数据 | TanStack Query 5.102.8                      |
| 控制台组件 | Ant Design 6.6.3 + Ant Design Icons         |
| 后端       | 独立的 `olixops-agent` FastAPI 服务         |

当前版本记录随依赖变更更新，精确声明以 [package.json](package.json)、[pnpm-lock.yaml](pnpm-lock.yaml) 和 [.node-version](.node-version) 为准。提交锁文件，CI 与可重复安装使用 `--frozen-lockfile`。

## 本地开发

使用 Node.js 24 与项目指定版本的 pnpm，在本仓库执行：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

开发服务地址以终端输出为准。前端可独立打开；真实连接检查需要另行启动后端。后端运行方式见 `olixops-agent` 仓库的 README。

浏览器固定请求当前站点的 `/api`。Vite 开发代理默认转发到 `http://127.0.0.1:8000`；需要其他后端地址时，通过 shell 设置：

```bash
API_PROXY_TARGET=http://127.0.0.1:8001 pnpm dev
```

[.env.example](.env.example) 记录这个用法；当前配置直接读取 shell 的 `API_PROXY_TARGET`，复制为 `.env` 不会自动改变代理。代理设置见 [vite.config.ts](vite.config.ts)。页面上的连接入口用于查看状态，不会修改 API 目标。

当前未使用 `VITE_*` 变量或持久化登录 token。以后增加的 `VITE_*` 变量会成为浏览器可读取的公开配置；云密钥、JWT 签名密钥和 Pulumi 凭据交给后端管理。API 封装预留内存 token provider，登录来源与会话流程仍待接入。

## 构建与验证

| 命令                                | 用途                                          |
| ----------------------------------- | --------------------------------------------- |
| `pnpm dev`                          | 启动本地开发服务                              |
| `pnpm lint`                         | ESLint 检查，警告视为失败                     |
| `pnpm format:check` / `pnpm format` | Prettier 格式检查 / 写入格式化                |
| `pnpm typecheck`                    | TypeScript 类型检查                           |
| `pnpm test` / `pnpm test:watch`     | Vitest 单次运行 / 监听                        |
| `pnpm build`                        | 类型检查后构建静态产物                        |
| `pnpm preview`                      | 预览已有构建产物                              |
| `pnpm check`                        | 依次运行 lint、格式检查、类型检查、测试与构建 |

生产构建输出为 `dist/`。`pnpm preview` 用于本地预览，沿用 Vite 的 `/api` 代理配置；生产环境使用静态托管或 Nginx 容器并配置实际 API 转发。

前端需要验证页面加载、草稿操作、路由切换、连接失败与真实健康检查。后端尚未实现的业务接口保持未连接/空态，测试数据不作为实际部署记录展示。

## 部署边界

- 已提供 [Dockerfile](Dockerfile)，使用 Node 构建、Nginx 托管；[Nginx 配置](deploy/nginx.conf) 对页面路径提供 `index.html` 回退，`/assets/` 使用静态资源缓存。
- 容器的 `/healthz` 只验证静态站点可用。当前 `/api/` 固定返回统一 HTTP 503，等待环境配置真实反向代理；API 路径不会被 SPA 回退吞成 HTML。
- 生产 API 的同源反向代理与集群入口由部署配置确定；构建前端不会启动 FastAPI、Agent 或 Pulumi Worker。
- 后续接入的 Worker 应在后端持续执行任务；用户关闭页面后，重新进入应通过任务 ID 读取真实进度。
- Docker 生产代理、集群入口与任务流协议等接入事项记录在 [todo.md](todo.md)。

## 开发规范与后续工作

- [AGENTS.md](AGENTS.md)：开发入口与按任务类型读取的规范。
- [UI 开发规范](docs/ui-development-standards.md)：完整项目内副本，适用于 UI 实现和评审。
- [前端开发与接口契约](docs/frontend-development.md)：组件/状态边界、统一响应、JWT、请求 ID 与异步任务约定。
- [todo.md](todo.md)：基础能力清单、待接入功能、未决事项及当前行为。

接口契约来源于后端 `olixops-agent/README.md`；对接时同步核对后端实际 OpenAPI。界面、协议或运行方式发生变化时，同步更新对应文档。
