# Decision Log

本文件采用轻量 ADR 方式记录会长期影响项目的技术选择。Accepted 记录不直接删除；如果方向改变，新增记录并标记原决策为 Superseded。

## DEC-001 — 将模型调用迁移到最小 Node 后端

- **Date:** 2026-07-22
- **Status:** Accepted
- **Implementation:** Implemented

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

- Development records: [DEV-001](DEVELOPMENT_LOG.md#dev-001--p0-architecture-review)、[DEV-002](DEVELOPMENT_LOG.md#dev-002--建立服务端模型安全边界)
- Implementation: P0 Commit 1

## DEC-002 — 模型结果必须验证并以纯文本展示

- **Date:** 2026-07-22
- **Status:** Accepted
- **Implementation:** Implemented

### Context

模型输出无法被视为可信数据。原有流程会宽松提取 JSON，并把 passage 作为 HTML 写入页面；异常或恶意内容可能绕过业务要求，甚至被浏览器解释为页面代码。

### Decision

- 模型必须返回只包含纯文本 title 和 passage 的严格 JSON。
- 服务端负责验证字段类型、长度、HTML 和全部目标词。
- 验证失败采用 fail-closed：返回错误，不把原始结果交给页面。
- 前端只使用文本节点展示模型内容，高亮标签由本地可信代码创建。

### Consequences

正面影响：

- 模型无法直接控制页面 HTML。
- 缺词或结构错误的内容不会被误报为成功。
- Provider 契约可以通过自动化测试持续验证。

负面影响：

- 不严格遵守 JSON 的模型响应会直接失败。
- 在获得真实调用数据前，不自动重试或修复失败响应。
- 目标词匹配暂时以英文单词和短语边界为准。

### Revisit When

获得真实供应商的失败数据后，再评估是否增加一次受控修复请求；不得通过恢复宽松 HTML 或 JSON 解析来降低失败率。

### Related

- Development record: [DEV-003](DEVELOPMENT_LOG.md#dev-003--验证并安全展示模型结果)
- Bug note: [BUG-002](BUG_NOTES.md#bug-002--模型-html-被直接写入页面)
- Implementation: P0 Commit 2
