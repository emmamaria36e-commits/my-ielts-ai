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
