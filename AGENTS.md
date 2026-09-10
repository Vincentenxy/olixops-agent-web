# 项目开发指引

- 修改代码前阅读 [README.md](README.md)，确认当前能力、运行方式和仓库边界。
- 继续业务开发、实现部署或评审相关变更前，必须阅读用户确认的 [Redis 开发计划](../olixops-agent/design/redis-development-plan.md)（独立检出时使用 [远程正文](https://github.com/Vincentenxy/olixops-agent/blob/main/design/redis-development-plan.md)），并核对[前端 todo](todo.md) 与[后端 todo](../olixops-agent/todo.md)（[远程入口](https://github.com/Vincentenxy/olixops-agent/blob/main/todo.md)）。完整计划以该正文为准；当前暂停使用 Pulumi，既有代码、依赖和诊断保留。
- 按计划中最早未验收阶段推进，在用户已授权范围内继续实施，不为常规下一步反复确认。前端部署页面属于阶段 5，自然语言发布属于阶段 6；可以依据已确定契约先做独立设计，缺少环境时记录阻塞并继续无依赖工作，只有真实联调满足验收条件才标记完成。
- 实现或评审前端 UI 时，必须先完整阅读 [UI 开发规范](docs/ui-development-standards.md)；页面、组件、布局、样式和交互修改均适用，按其中的视觉验收项检查受影响流程。
- 修改路由、状态、请求、认证或后端联调时，先阅读 [前端开发与接口契约](docs/frontend-development.md)，并核对后端最新契约。
- 处理功能缺口、接入条件或架构未决项时，读取并同步 [todo.md](todo.md)，记录影响、当前行为和完成条件。
- 检查命令以 `package.json` 为准；交付时报告实际运行的检查及结果，区分前端演示、真实接口验证和真实部署。
