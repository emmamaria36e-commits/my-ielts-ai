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

## DEV-004 — 恢复 Mock Provider 业务一致性

- **Date:** 2026-07-23
- **Milestone:** P0 Step 3
- **Objective:** 确保 Mock 页面显示的每个成功目标词都真实存在于正文。
- **Implementation:** Mock 验证并规范化目标词；四种场景保留稳定基础文章并添加场景化 Vocabulary Focus；浏览器端调试 Prompt 同步为纯文本契约。
- **Contract result:** Mock 结果直接通过真实 Provider 使用的 `validateModelResult()`，不再单独定义宽松成功标准。
- **Validation:** 四种场景分别覆盖 1、3、10、20 个词；重复词、短语、连字符、撇号和非法输入测试通过；测试总数由 8 增加到 11。
- **Product limitation:** Vocabulary Focus 只保证目标词真实出现，不代表 Mock 能理解任意词义或达到真实 AI 的写作质量。
- **Related bug:** [BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)。

## DEV-005 — 接入单声音 Azure Speech

- **Date:** 2026-07-29
- **Milestone:** P0 Step 4
- **Objective:** 用真实语音替换 Web Audio 提示音，并保持 Speech 密钥只存在于 Node 服务端。
- **Implementation:** 新增同源 `/api/speech`；服务端验证正文和单声音白名单、转义 XML、构造 SSML并调用 Azure Speech REST API；前端新增轻量 Speech Service，将返回的 MP3 交给现有播放器。
- **Scope:** Voice 选择收敛为单选；一篇正文生成一条 MP3；未实现多角色切换、音频拼接、缓存、持久化和时间轴。
- **Automated validation:** JavaScript 语法检查通过；14 条测试通过，其中新增 Speech 输入、声音白名单、HTML 拒绝和 SSML 转义覆盖。
- **External validation:** 使用已配置的 Azure Speech 资源完成真实请求，`/api/speech` 返回 HTTP 200、`audio/mpeg` 和非空 MP3 数据。
- **Security result:** Key 和 Region 只从服务端 `.env` 读取；浏览器不接触 Azure 凭据、区域或上游地址。
- **Related decision:** [DEC-003](DECISION_LOG.md#dec-003--使用服务端-azure-speech-rest-api-生成单声音音频)。

## DEV-006 — 按 IELTS Listening Section 生成正文

- **Date:** 2026-07-29
- **Milestone:** P0 Step 5
- **Objective:** 用 Section 1–4 替换混合 Scene 分类，让正文结构更贴近 IELTS Listening，同时保持单声音 TTS 和 MVP 范围。
- **Implementation:** 页面改为选择 Section 1–4；前后端请求字段统一为 `section`；服务端 Prompt 为四个 Section 分别定义对话或独白格式、语境、信息组织和典型听力特征；Voice 明确只作为播放元数据。
- **Scope:** 未加入题目、答案、题型策略、多角色 TTS、音频拼接或自动质量重试。
- **Validation:** Section 输入白名单、Section Prompt 结构、四种 Mock 契约以及既有模型、Speech 和批量词条测试全部通过。使用已配置的 DeepSeek 分别完成四种 Section 的真实生成：Section 1、3 返回带说话人标签的对话，Section 2、4 返回无说话人标签的独白；四篇均带正确 Section 元数据并包含全部目标词。
- **Related decision:** [DEC-004](DECISION_LOG.md#dec-004--以-ielts-listening-section-1-4-决定文本结构)。

## DEV-007 — 降低生成与语音的可恢复失败率

- **Date:** 2026-07-29
- **Objective:** 减少偶发模型格式错误、重复点击、共享限流和 Speech 临时超时导致的失败，并避免朗读角色标签。
- **Implementation:** Generate 进行中禁用按钮；DeepSeek 缺词时把实际缺失词和上一版草稿送入一次定向修订，其他 502 类供应商或结果校验失败最多重新生成一次，第二次降低随机度；两次仍失败时只在输入区显示简短中文提示，不覆盖听力原文；AI 与 Speech 分开限流；Azure Speech 对临时失败或超时最多重试一次；构造 SSML 前移除行首 `Speaker A/B/C:`，页面原文保持不变。
- **Scope:** 未加入无限重试、后台任务、多角色 TTS、音频拼接或宽松模型结果校验。
- **Validation:** 24 项自动测试通过，覆盖定向修订携带缺失词和上一版草稿、按钮防重复提交、终态错误不进入原文区及 Speech 标签清理；真实 DeepSeek 使用 12 个目标词生成成功并包含全部词；真实 Azure Speech 返回非空 MP3。验证期间实际观察到一次 Azure 超时，新增受控重试后再次请求成功。

后续只在完成重要里程碑或开发阶段发生明显变化时新增记录。
