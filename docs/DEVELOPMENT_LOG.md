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

后续只在完成重要里程碑或开发阶段发生明显变化时新增记录。
