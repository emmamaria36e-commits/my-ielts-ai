# Development Log

本文件记录里程碑级开发过程。普通文件修改以 Git Commit 为准，技术选择以 `DECISION_LOG.md` 为准。

## DEV-001 — P0 Architecture Review

- **Date:** 2026-07-21
- **Phase:** UI Demo → Listening MVP
- **Objective:** 在继续开发前确认现有结构、完成情况和进入真实 MVP 的主要风险。
- **Starting state:** 项目是 Vanilla HTML/CSS/JavaScript 单页应用，已有生成器 UI、Provider 分层和播放器控件，但没有后端、测试或真实 TTS。
- **Review performed:** 检查了完整目录、Git 状态、页面结构、生成流程、Prompt、Mock/API Provider、结果渲染和播放器生命周期；六个 JavaScript 文件通过语法检查。
- **Key findings:** 浏览器密钥风险、模型 HTML 直接渲染、Mock 目标词虚假、音频仍为提示音，以及首页范围大于当前 MVP。
- **Outcome:** 保留现有前端，将安全边界、结果可靠性、Mock 一致性和单声音 TTS 拆为独立 P0 Step。
- **Checkpoint:** `2938539` 保存了迁移前已有的前端和文档状态。
- **Remaining decisions:** 生产部署平台和 TTS 供应商尚未确定。
- **Related records:** [DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)、[BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)、[AI-001](AI_COLLABORATION.md#ai-001--从-claude-code-迁移到-codex-并完成-p0-审查)。

## DEV-002 — 建立服务端模型安全边界

- **Date:** 2026-07-22
- **Milestone:** P0 Step 1
- **Objective:** 在不重构前端的情况下，将模型密钥和上游请求迁移出浏览器。
- **Implementation:** 新增无第三方运行依赖的最小 Node 服务、服务端 Prompt、`.env` 配置、输入验证、请求超时、基础频率限制和受控静态资源；前端 API Provider 改为同源 `/api/generate`。
- **Compatibility:** 直接打开 `index.html` 时继续使用 Mock；通过 Node 服务打开时自动使用后端 API。
- **Validation:** 全部 JavaScript 通过语法检查；首页、静态资源、健康检查、非法输入、缺少密钥、服务端文件隔离和本地模拟上游端到端请求均通过。
- **Security result:** 浏览器代码中不再包含 API Key、Authorization Header、上游模型地址或服务端 Prompt。
- **Not yet verified:** 尚未使用真实供应商密钥进行外部端到端调用；模型响应的严格 Schema、目标词完整性和安全展示属于 P0 Step 2。
- **Related decision:** [DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)。

## DEV-003 — 验证并安全展示模型结果

- **Date:** 2026-07-22
- **Milestone:** P0 Step 2
- **Objective:** 防止结构错误、缺少目标词或包含 HTML 的模型内容进入页面成功流程。
- **Implementation:** Prompt 改为纯文本契约；Node 严格解析 JSON 并验证字段、长度、HTML 和目标词；前端使用文本节点构造段落、错误提示和目标词高亮。
- **Automated validation:** 8 条测试覆盖输入空格规范化、严格 JSON、字段类型、HTML 拒绝、缺词、大小写、多词短语、单词边界和前端 `innerHTML` 回归保护。
- **Request validation:** 本地模拟上游中，合格结果返回 200；HTML、缺词和 JSON 外附加文字均返回 502。
- **Not yet verified:** 尚未使用真实供应商密钥验证严格 JSON 遵从率；自动修复和重试需等待真实失败数据。
- **Related records:** [DEC-002](DECISION_LOG.md#dec-002--模型结果必须验证并以纯文本展示)、[BUG-002](BUG_NOTES.md#bug-002--模型-html-被直接写入页面)。

后续只在完成重要里程碑或开发阶段发生明显变化时新增记录。
