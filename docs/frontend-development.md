# 前端开发与接口契约

更新日期：2026-09-10。运行方式见 [README](../README.md)，交互规则见 [UI 开发规范](ui-development-standards.md)，待接入能力见 [todo](../todo.md)。接口以同版本后端 OpenAPI 和 README 为准。

## 模块与状态

- React + TypeScript + Vite 提供独立 SPA；React Router 管理 URL，TanStack Query 管理服务端查询，Ant Design 提供紧凑操作组件。
- `features/auth/session.ts` 负责内存身份、认证请求、恢复/刷新与会话失效；`AuthProvider` 桥接 React 并在会话世代变化时清空 QueryClient。组件不能自行拼接 token 或持久化会话。
- `lib/api/client.ts` 负责传输、超时/取消、请求 ID 与统一 envelope；受保护请求通过 `session.request` 执行。外部数据需运行时解析，类型断言不能代替验证。
- 页面编辑状态留在组件，查询缓存按会话世代和用户 ID 分区；URL 表达页面位置。身份变更重新挂载受保护页面，旧请求返回值不进入新会话。
- 后端已提供 Pulumi 基础集成与持久 LangGraph 方案分析；MCP 查询、业务部署 Worker 待接入。页面关闭或请求取消不能推断为分析任务或部署取消/失败。

## API 传输

业务路径为 `/api/v1/...`，显式公开接口位于 `/api/v1/pub/...`；GET 只读，带参数及有副作用操作使用 POST。浏览器始终同源访问 `/api`，所有请求使用 `credentials: 'same-origin'` 和 `X-Olixops-Client: web`；JSON POST 设置 `Content-Type: application/json`。

统一响应：

```json
{ "code": 0, "msg": "", "data": {} }
```

| code       | 行为                                  |
| ---------- | ------------------------------------- |
| `0`        | 解析 `data`                           |
| `-1`       | 通用业务失败                          |
| `1 ~ 1000` | 系统保留码，HTTP 错误与对应状态码一致 |
| `10000+`   | 约定的业务失败                        |

HTTP 200 仍必须检查 `code`；非 JSON、无效 envelope、结构不匹配、超时与网络失败均不可作为成功数据。错误保留服务端 `X-Request-Id`。客户端生成 32 位十六进制请求 ID，并避免在日志/错误输出中泄露密码、Cookie 或令牌。

## 本地认证

| 方法 / 路径                     | 请求                                       | 成功 `data`                                          |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| POST `/api/v1/pub/auth/login`   | `{username,password}`                      | `{access_token,token_type:"bearer",expires_in,user}` |
| POST `/api/v1/pub/auth/refresh` | `{}`                                       | 同登录                                               |
| POST `/api/v1/pub/auth/logout`  | `{}`                                       | `null`                                               |
| GET `/api/v1/auth/me`           | Bearer                                     | `user`                                               |
| POST `/api/v1/auth/password`    | Bearer + `{current_password,new_password}` | `null`；撤销所有会话                                 |

`user` 明确包含字符串 `user_id`、`username`、`name` 和布尔值 `is_admin`。身份展示来自后端响应，不解析 JWT 以做权限判断。后端校验签名和会话状态，前端只负责携带访问令牌。

- Access token 只保留 JavaScript 内存；不得放入 localStorage、sessionStorage、URL 或日志。Refresh token 由后端设置 HttpOnly、SameSite=Strict Cookie，路径限定 `/api/v1/pub/auth`；前端无法读取。
- 登录、刷新、退出和改密需通过后端精确 Origin 校验及自定义客户端头校验；站点地址变动需同步后端允许列表。生产 HTTPS 配合 Secure Cookie。
- 页面启动只恢复一次，React StrictMode 重挂载共享恢复请求；网络故障显示可重试错误，401 表示未登录。
- 受保护请求遇到 401 时合并同一会话的刷新请求，使用新令牌最多重试一次；第二次 401 清除会话。已被其他请求换新的令牌直接用于重试，避免重复旋转 Cookie。403 保持权限错误，不触发刷新。
- 已登录会话发起刷新时绑定原始用户 ID；若其他标签页切换账号导致 Cookie 返回另一身份，立即失效当前会话并清理缓存/草稿，禁止重放原用户请求或接纳迟到数据。初次匿名恢复可接受 Cookie 对应的身份。
- 登录/刷新/退出的 Cookie 写入请求串行；退出立即清除内存身份与缓存，再等待已发出的登录/刷新完成后撤销后端 Cookie。旧世代响应不能重新恢复身份或返回受保护数据。
- 退出使用可用的访问令牌与 Cookie 撤销会话；网络失败时页面提示“重试退出”，不会谎报后端撤销成功。
- 改密为 12–128 字符，新密码须与旧密码不同，二次确认需一致。旧密码错误/重复密码返回 400；身份令牌无效返回 401。成功后重新登录，客户端清空当前用户草稿和缓存。
- 登录后的跳转仅接受站内 pathname；拒绝外部地址、双斜线、反斜线及编码变体。

多标签页的主动身份广播、SSO、用户管理和细粒度 RBAC 仍见 todo；当前身份失效由下一次受保护请求发现。

## 基础服务状态

`GET /api/v1/system/status` 需要 Bearer，返回：

```json
{
  "database": { "status": "ok", "message": "..." },
  "redis": { "status": "disabled", "message": "..." },
  "pulumi": { "status": "ok", "message": "...", "sdk_version": "...", "cli_version": "..." },
  "auth": { "status": "ok", "message": "..." }
}
```

数据库/Pulumi 状态为 `ok` 或 `error`，Redis 还允许 `disabled`，CLI 不可用时 `cli_version` 为 `null`。页面仅展示真实响应；服务检查通过不等于 Agent/MCP 或部署任务可执行。`GET /api/v1/pub/health` 仍保留给健康探针。

## Agent 方案分析

所有 Agent 接口均需要认证，通过 `auth.session.request` 使用统一响应。任务是一段持久分析会话，不是部署记录；前端入口在工作台，列表位于 `/tasks`，详情位于 `/tasks/:taskId`。

| 方法 / 路径                        | 请求                                                                | 成功 `data`                           |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------- |
| GET `/api/v1/agent/status`         | 无                                                                  | `{configured:boolean,message:string}` |
| GET `/api/v1/agent/tasks`          | 无                                                                  | `{items:TaskSummary[]}`，最近 50 个   |
| POST `/api/v1/agent/tasks/create`  | `{request_id:UUID,message:string}`                                  | `TaskDetail`                          |
| POST `/api/v1/agent/tasks/detail`  | `{task_id:UUID}`                                                    | `TaskDetail`                          |
| POST `/api/v1/agent/tasks/message` | `{task_id,request_id:UUID,expected_revision:number,message:string}` | `TaskDetail`                          |
| POST `/api/v1/agent/tasks/retry`   | `{task_id,expected_revision:number}`                                | `TaskDetail`                          |

`TaskSummary` 包含 `task_id`、`title`、`status`、`revision`、ISO 时间 `create_at` / `update_at`。`TaskDetail` 另有 `messages: {role:'user'|'assistant',content:string}[]`、`spec: DeploymentSpec|null`、`questions:string[]` 和 `error:string|null`。必要结构均在 `features/agent/api.ts` 运行时校验。

`DeploymentSpec` 的目标为 `kubernetes`，包含 `cluster`、`namespace` 和服务列表 `services`。每个服务包含 `kind:'redis'|'postgresql'`、`name`、`version`、正整数 `storage_gi`、固定为 `1` 的 `replicas`。这些是模型整理的规格，尚未通过 MCP 校验环境，也未执行 Pulumi preview/up。

| 状态          | 前端行为                           |
| ------------- | ---------------------------------- |
| `queued`      | 每 2 秒查询进度；禁用发送和重试    |
| `needs_input` | 展示问题，允许补充需求             |
| `ready`       | 展示规格与“尚未部署”，允许修改需求 |
| `failed`      | 展示固定失败提示，允许手动重试     |

- 创建和消息正文为 1–4000 字；工作台只发送需求正文，仓库与分支不参加分析。创建返回后即进入详情，不在一个请求内等待模型完成。
- 创建从 `revision=1` 开始，每次新消息递增；失败重试不增加 revision。编辑开始时记录版本，发送带 `expected_revision`；版本冲突时拉取最新数据、保留输入，由用户查看后再次提交。
- 创建/消息使用 UUID 幂等键；同一次内容未确认成功时重试复用原键，不进行网络失败后的自动重试。业务操作的 401 会话恢复仍遵守前文认证契约。
- 查询 key 包含会话世代和用户 ID，详情还包含任务 ID；queued 以外状态或查询出错停止轮询。重新登录、页面恢复或手动刷新重新读取服务端会话，不把断线当成任务失败。
- 业务码 `11001` 为模型未配置、`11002` 为任务忙、`11003` 为版本冲突、`11004` 为上限、`11005` 为幂等键内容冲突。前端映射固定提示，不直接展示 `error` 或未知异常正文；请求编号可用于排查。
- 对话和规格按普通文本呈现，保留选择/复制；任务列表、对话和问题有自己的有界滚动区。真实“提交部署”继续禁用。

## 草稿与异步业务

- 草稿手动保存到当前用户的浏览器存储，按 `user_id` 分区；退出/身份失效清除，未保存编辑不持久化。旧版无用户归属的草稿不迁移。
- 用户 ID 分区提供界面隔离，不是浏览器数据加密；草稿仅保存非敏感描述，凭据交给后端。
- 只有后端真正创建并返回任务后，才能进入分析任务列表；查询失败与成功的空列表分别呈现。真实部署提交仍未接入。
- Pulumi preview/up 分别表示变更预览与更新。审核绑定部署规格、程序与组件版本、依赖锁、配置、目标 stack/state 和预览摘要；执行前后端重新核对，变化时按环境策略重新审核。前端仅呈现服务端权限和动作。
- Pulumi update plan 不等同于 Terraform 保存计划，也不是事务保证；详细审核与执行约束以同版本后端 README 的“Agent 与 Pulumi 执行规范”为准。
- 部署创建/取消等副作用请求仍需后端幂等契约，不能因网络失败任意自动重试。当前仅轮询分析任务；部署进度、事件游标、重连与结果结构待业务设计确定。

## 验证

修改后运行 `pnpm check`。认证测试需覆盖错误登录、刷新恢复、并发刷新、退出与迟到响应竞态、身份失效、密码更新及缓存/草稿清理；组件测试关注用户可见结果。

桌面和窄屏检查遵守项目 [视觉验收](ui-development-standards.md#10-视觉验收)，包括键盘访问、表单提交/错误、加载状态、路由切换、无页面级横向溢出。真实后端、容器和远程 CI 验证分别记录，不用测试桩代替真实能力声明。
