# AI Collaboration

本文件只记录影响架构、质量或开发方法的重要 AI 协作。它不保存完整聊天、普通代码修改流水账、密钥或敏感信息。

## AI-001 — 从 Claude Code 迁移到 Codex 并完成 P0 审查

- **Date:** 2026-07-21
- **Development phase:** UI Demo → Listening MVP
- **Human objective:** 在继续开发前理解现有功能、技术栈、完成情况和主要风险。
- **Constraints:** 只读审查，不修改代码；重大修改先提供方案并等待确认。
- **AI role:** 检查仓库结构、追踪生成与播放流程、识别架构和安全风险、提出分阶段开发建议。
- **Areas inspected:** HTML、CSS、生成器交互、播放器、AI Service、Prompt、Mock/API Provider、文档和 Git 状态。
- **Key findings:** 浏览器密钥风险、模型 HTML 直接渲染、Mock 目标词虚假、音频仍为提示音，以及 MVP 范围需要收缩。
- **Recommendations accepted:** 保留现有前端；先建立服务端安全边界；将 P0 工作拆成可验证、可回滚的独立 Commit；建立轻量长期文档体系。
- **Recommendations deferred:** 前端框架迁移、多角色 TTS、用户系统以及 Writing、Reading、Speaking 模块。
- **Human verification:** 用户先审查项目分析、P0 方案、Commit 边界和文档基线，确认后才授权修改仓库。
- **Lesson:** AI 审查、人工决策、实现和验证应保持为不同阶段；AI 建议不能直接当作已实现事实。
- **Related records:** [DEV-001](DEVELOPMENT_LOG.md#dev-001--p0-architecture-review)、[DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)、[BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)。

普通 AI 辅助修改不新增记录，除非形成可复用的工程经验或影响长期决策。
