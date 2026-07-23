# Bug Notes

本文件只记录严重问题、回归问题或根因不直观的问题。普通样式和文案修复不进入长期复盘。

## BUG-001 — Mock Provider 虚假报告目标词已包含

- **Discovered:** 2026-07-21
- **Resolved:** 2026-07-23
- **Severity:** P0
- **Status:** Resolved
- **Affected component:** `js/services/mockProvider.js`

### Symptom and Impact

用户输入的目标词会全部显示为已包含并带有成功标记，但当前 Mock Provider 返回的是按场景选择的固定正文，正文可能完全没有这些词。

这会让核心产品承诺失效，并向学习者提供虚假的完成反馈。

### Root Cause

Mock Provider 从目标词占位模板改为固定文章后，仍然直接复制用户输入作为 `targetWords`，但没有验证这些词是否实际存在于 `passage`。

### Resolution

- Mock 验证并规范化 1–20 个目标词，拒绝非法输入。
- 每种场景在稳定基础文章后添加对应的 Vocabulary Focus，明确包含全部目标词。
- `targetWords`、正文和 `wordCount` 使用同一份规范化结果。
- Mock 输出通过真实 Provider 的 `validateModelResult()` 契约测试。

### Validation

- 四种场景分别使用 1、3、10 和 20 个目标词通过统一结果契约。
- 重复词、多余空格、短语、连字符和撇号测试通过。
- 0 个词、超过 20 个词和 HTML 字符输入会被拒绝。

### Prevention

保留 Mock 与真实 Provider 的统一契约测试，任何虚假 `targetWords` 回归都会导致测试失败。

### Related

- Development records: [DEV-001](DEVELOPMENT_LOG.md#dev-001--p0-architecture-review)、[DEV-004](DEVELOPMENT_LOG.md#dev-004--恢复-mock-provider-业务一致性)
- Fix: P0 Commit 3

## BUG-002 — 模型 HTML 被直接写入页面

- **Discovered:** 2026-07-21
- **Resolved:** 2026-07-22
- **Severity:** P0
- **Status:** Resolved
- **Affected components:** `server.js`、`server/promptBuilder.js`、`js/generator.js`

### Symptom and Impact

Prompt 要求模型返回 `<b>`，前端随后通过 `innerHTML` 展示 passage。模型如果返回脚本、事件属性或其他 HTML，浏览器可能把不可信内容解释为页面结构和代码。

### Root Cause

模型格式化和页面高亮职责混在一起：模型负责生成 HTML，前端依赖这段 HTML 展示结果，同时服务端只做宽松 JSON 解析，没有建立完整的响应契约。

### Resolution

- 模型只返回纯文本 JSON。
- 服务端严格验证字段、长度、HTML 和目标词完整性。
- 前端使用文本节点展示正文，并由可信代码创建高亮 `<span>`。
- 自动测试禁止恢复 `transcriptText.innerHTML` 和 `targetWords.innerHTML`。

### Validation

- 自动化测试覆盖 HTML、非严格 JSON 和缺词响应。
- 完整本地请求测试确认不合格响应返回 502，不能进入页面成功流程。

### Prevention

所有 AI 和外部服务内容默认视为不可信数据；格式化只能由本地可信代码生成。

### Related

- Decision: [DEC-002](DECISION_LOG.md#dec-002--模型结果必须验证并以纯文本展示)
- Development record: [DEV-003](DEVELOPMENT_LOG.md#dev-003--验证并安全展示模型结果)
- Fix: P0 Commit 2
