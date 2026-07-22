# Decision Log

本文件采用轻量 ADR 方式记录会长期影响项目的技术选择。Accepted 记录不直接删除；如果方向改变，新增记录并标记原决策为 Superseded。

## DEC-001 — 将模型调用迁移到最小 Node 后端

- **Date:** 2026-07-22
- **Status:** Accepted
- **Implementation:** Planned

### Context

当前 API Provider 设计要求浏览器保存上游 endpoint、模型配置和 API Key。真实用户能够读取并滥用这些信息，项目也无法在可信位置统一执行输入校验、超时和错误处理。

### Options Considered

1. 保留浏览器直连模型接口。
2. 在同一仓库新增最小 Node 后端。
3. 将项目整体迁移到完整全栈框架。

### Decision

选择同仓库最小 Node 后端。浏览器只向自己的 `/api/generate` 提交结构化业务参数；服务端保存密钥、构造可信 Prompt，并访问上游模型。

### Why

该方案建立了必要的安全边界，同时保留现有 HTML/CSS/JavaScript 和 `AIService` 调用接口，不要求重写前端或提前引入复杂架构。

### Consequences

正面影响：

- 密钥不会发送到浏览器。
- 输入验证、超时和上游错误可以集中处理。
- 更换模型供应商时不必向用户暴露配置。

负面影响：

- 项目不能继续只依赖静态文件部署。
- 本地开发需要启动 Node 服务。
- 生产环境需要支持服务端运行和环境变量。

### Out of Scope

本决策不包含 TTS、数据库、用户系统、前端框架迁移和多角色音频。

### Revisit When

当项目需要用户账户、持久化学习数据、多个独立服务或明显的扩缩容需求时，重新评估完整全栈或服务拆分方案。

### Related

- Development record: [DEV-001](DEVELOPMENT_LOG.md#dev-001--p0-architecture-review)
- Implementation commit: Pending
