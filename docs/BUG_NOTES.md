# Bug Notes

本文件只记录严重问题、回归问题或根因不直观的问题。普通样式和文案修复不进入长期复盘。

## BUG-001 — Mock Provider 虚假报告目标词已包含

- **Discovered:** 2026-07-21
- **Severity:** P0
- **Status:** Identified
- **Affected component:** `js/services/mockProvider.js`

### Symptom and Impact

用户输入的目标词会全部显示为已包含并带有成功标记，但当前 Mock Provider 返回的是按场景选择的固定正文，正文可能完全没有这些词。

这会让核心产品承诺失效，并向学习者提供虚假的完成反馈。

### Root Cause

Mock Provider 从目标词占位模板改为固定文章后，仍然直接复制用户输入作为 `targetWords`，但没有验证这些词是否实际存在于 `passage`。

### Resolution Plan

- 恢复确定性的目标词插入机制。
- Mock 与真实 Provider 使用相同的目标词完整性检查。
- 只有通过验证的结果才能进入成功展示流程。

### Validation Plan

- 分别使用 1、3 和 10 个允许的目标词生成内容。
- 验证每个被报告成功的词都出现在正文中。
- 验证大小写、重复词和无效输入边界。

### Prevention

为 Provider 成功结果建立统一契约测试，要求正文包含全部目标词。

### Related

- Development record: [DEV-001](DEVELOPMENT_LOG.md#dev-001--p0-architecture-review)
- Fix commit: Pending

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
