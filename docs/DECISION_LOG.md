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
- 模型恢复策略由 [DEC-005](#dec-005--generation-pipeline-v2-按失败类型使用一次恢复调用) 统一定义；修订和重新生成结果仍经过相同严格校验，不进行宽松解析。
- 目标词匹配按规范化后的英文完整词元序列执行。

### Revisit When

当 V2 的两次调用预算仍无法满足实际可靠性时，先根据结构化日志评估具体失败类型；不得通过恢复宽松 HTML 或 JSON 解析来降低失败率。

### Related

- Development record: [DEV-003](DEVELOPMENT_LOG.md#dev-003--验证并安全展示模型结果)
- Bug note: [BUG-002](BUG_NOTES.md#bug-002--模型-html-被直接写入页面)
- Implementation: P0 Commit 2

## DEC-003 — 使用服务端 Azure Speech REST API 生成单声音音频

- **Date:** 2026-07-29
- **Status:** Accepted
- **Implementation:** Implemented

### Context

Listening MVP 需要把已验证的 AI 正文转换为与页面内容一致的真实语音。浏览器不能持有 Speech 密钥，当前阶段也不需要多角色拼接、时间轴或 Speech SDK 的高级事件能力。

### Options Considered

1. 浏览器直接调用 Azure Speech。
2. Node 服务端通过 Azure Speech REST API 合成音频。
3. 引入 Azure Speech SDK。

### Decision

选择由现有 Node 服务端调用 Azure Speech REST API。浏览器只向 `/api/speech` 提交正文和一个产品 voice key；服务端验证输入、映射受信任的 Azure voice、转义 XML、构造 SSML 并返回 MP3。

### Why

该方案复用现有可信边界和原生 `fetch`，不增加运行依赖，也不暴露密钥。当前需求是一段文本生成一条音频，REST API 已能覆盖。

### Consequences

正面影响：

- Speech 密钥、区域和 Azure voice name 不进入浏览器。
- 前端现有播放器可以直接加载 MP3。
- 声音选择和 SSML 构造由服务端白名单控制。

负面影响：

- 每次生成正文后都会产生一次实时合成请求和相应费用。
- 当前没有音频缓存、持久化、自动重试或逐句时间轴。
- 多角色文本仍使用一个声音朗读。

### Revisit When

需要流式音频、单词边界事件、逐句时间轴、多角色音频或更复杂的合成控制时，再评估 Speech SDK、缓存和音频处理管线。

### Related

- Development record: [DEV-005](DEVELOPMENT_LOG.md#dev-005--接入单声音-azure-speech)
- Roadmap: P0 Step 4

## DEC-004 — 以 IELTS Listening Section 1–4 决定文本结构

- **Date:** 2026-07-29
- **Status:** Accepted
- **Implementation:** Implemented

### Context

原有 Scene 同时混合了使用场景、对话形式和学术主题，不能准确表达 IELTS Listening 四个 Section 的文本结构与考点差异。Voice 选择也不应反过来决定正文是对话还是独白。

### Decision

- 页面和生成接口使用 Section 1–4，不再提交旧 Scene。
- Section 1、3 生成带明确说话人标签的对话；Section 2、4 生成单人独白。
- 每个 Section 的 Prompt 分别约束实际语境、信息组织和典型听力特征。
- Voice 只用于选择整篇正文的 TTS 音色，不参与内容结构判断。

### Consequences

正面影响：

- 用户选择与 IELTS Listening 的正式结构一致。
- Prompt 可以针对不同 Section 形成更真实的互动和信息组织。
- 内容生成与声音合成职责保持清晰。

负面影响：

- 当前单声音 TTS 会用同一音色朗读 Section 1、3 的全部角色。
- 旧 Scene 字段不再兼容；当前项目没有持久化数据，因此无需迁移。
- 本阶段只生成听力原文，不生成题目、答案或按题型校验。

### Related

- Development record: [DEV-006](DEVELOPMENT_LOG.md#dev-006--按-ielts-listening-section-生成正文)
- Roadmap: P0 Step 5

## DEC-005 — Generation Pipeline V2 按失败类型使用一次恢复调用

- **Date:** 2026-07-30
- **Status:** Accepted
- **Implementation:** Implemented

### Context

严格目标词校验必须保留，但模型偶发漏词。统一重复生成或持续增加重试次数会提高费用和等待时间，也不能保证解决具体失败。

### Decision

- 每次用户请求最多调用模型两次。
- 第一次结果合格时立即返回，不产生额外调用。
- 缺词不超过 3 个且占目标词总数不超过 25% 时，第二次调用最小修订上一版正文。
- 缺词较多、JSON 无效或结果结构错误时，第二次调用重新生成完整正文。
- Repair Prompt 不删除已有目标词、不修改无关内容，保持主题、Section 结构和难度，只做满足缺词要求的最小修改。
- 第二次结果使用与第一次相同的严格安全与目标词校验。
- 生成阶段记录不含正文、密钥和完整词表的结构化事件日志。

### Consequences

正面影响：

- 首次成功只产生一次模型费用。
- 唯一一次恢复调用根据失败类型使用，成本和最长等待时间可预测。
- 少量漏词可以保留合格初稿，减少整篇重写。
- 日志可以支持后续基于真实成功率调整阈值。

负面影响：

- 两次结果都不合格时仍会终止，不保证每次生成成功。
- 大量目标词或与 Section 不自然的词组仍可能提高最终失败率。
- 阈值目前是固定常量，需要真实日志数据后才能优化。

### Related

- Development record: [DEV-008](DEVELOPMENT_LOG.md#dev-008--generation-pipeline-v2)
- Extends: [DEC-002](#dec-002--模型结果必须验证并以纯文本展示)

## DEC-006 — Closed Beta 付费接口使用服务端邀请码保护

- **Date:** 2026-08-11
- **Status:** Accepted
- **Implementation:** Implemented

### Context

公开 URL 会使任何访问者都能直接调用 `/api/generate` 和 `/api/speech`。现有 IP 内存限流不能识别封闭测试用户，也不能阻止未获邀请的人触发 DeepSeek 或 Azure 成本。

### Decision

- 两个付费 POST 接口在现有限流、输入处理和供应商调用前验证 `X-Beta-Invite`。
- 邀请码只从服务端 `BETA_INVITE_CODES` 环境变量读取，采用逗号分隔；未配置时默认拒绝全部付费 API 请求。
- 服务端启动时只保留每个邀请码的 SHA-256 摘要，并使用摘要前 16 个字符作为内部匿名 invite identifier。
- 浏览器首次调用时向用户请求邀请码，并仅保存到当前标签页的 sessionStorage；403 时清除旧值、显示统一提示并允许重新输入。
- 缺少或错误邀请码统一返回 403，不披露有效数量、错误位置或服务端配置。

### Consequences

正面影响：

- 获取公网 URL 不再足以调用付费 API。
- 前端和 Git 中不包含有效邀请码。
- 匿名 invite identifier 可供后续 quota、concurrency 和审计日志复用。

负面影响：

- sessionStorage 中的邀请码仍属于浏览器端会话凭据，必须依赖 HTTPS 和 XSS 防护。
- 本阶段不提供 quota、并发限制、kill switch 或邀请码撤销管理界面；修改环境变量后需按部署方式重新加载服务配置。

### Out of Scope

每日额度、并发限制、kill switch、账号系统、现有限流重构和部署均不属于本阶段。

## DEC-007 — Closed Beta 成本保护使用单进程匿名身份状态

- **Date:** 2026-08-11
- **Status:** Accepted
- **Implementation:** Implemented

### Context

邀请码阻止未获邀请的访问，但不能限制单个测试用户或全站的每日供应商成本，也不能阻止多个长请求同时占用 DeepSeek、Azure 和 Node 连接。

### Decision

- AI 与 Speech 分别使用 per-invite 和 global 每日额度，身份复用 DEC-006 的 16 字符 anonymous invite ID。
- 每日计数按服务器本地自然日重置，状态只保存在单个 Node 进程内存。
- 同一 invite 每类最多一个活动请求；AI 与 Speech 默认各自最多 3 个全局活动请求。
- 顺序固定为：邀请码、kill switch、原 IP 限流、输入验证、invite/global quota 检查、invite/global slot、扣减一次 quota、provider、`finally` 释放 slot。
- 一次用户请求只扣一次额度；DeepSeek Repair/Regenerate 或 Azure 502 retry 不重复扣减。
- `AI_ENABLED` 和 `SPEECH_ENABLED` 仅在配置明确为 `true` 时启用，缺失或非法值关闭对应付费接口。

### Consequences

- 并发拒绝、kill switch、无效邀请码和 provider 调用前的其他拒绝不消耗每日额度。
- Provider 已开始后，无论成功、错误、超时或内部恢复，额度都保留。
- 重启会重置额度，多实例不共享状态；该限制在 5–10 人单实例 Closed Beta 中明确接受。

### Out of Scope

不修改现有 IP 短期限流、proxy 信任、持久化、多实例协调、安全事件日志、账号系统或部署。

## DEC-008 — Closed Beta 使用单实例内存保护与固定 Proxy Hop 信任

- **Date:** 2026-08-19
- **Status:** Accepted
- **Implementation:** Implemented in working tree; not committed or deployed

### Context

Phase 2 的 quota 与 concurrency 状态只存在于单个 Node 进程内存。部署到反向代理后，短期限流还需要在不无条件信任 `X-Forwarded-For` 的前提下识别客户端地址。

### Decision

- Closed Beta 第一版必须运行单个 Node.js application instance，不支持 horizontal scaling。
- 服务重启会重置每日 quota；多实例不会共享 quota 或 concurrency。
- `TRUST_PROXY_HOPS` 默认 0，只接受 0–10 的十进制整数；0 或非法配置不信任转发头，正整数只信任对应数量的最近代理 hop。
- quota 与 concurrency 数字配置只接受有界正整数；缺失或非法配置回退到 Phase 2 的有限安全默认值。
- `GET /health` 只返回 `{ "ok": true }`，不公开配置状态，也不进入邀请码、额度、并发或 Provider 流程。

### Consequences

- 单实例 Closed Beta 的成本保护行为可预测，且代理信任必须与真实部署拓扑显式匹配。
- 当前不能通过增加应用实例进行水平扩展；如未来需要多实例，必须先引入共享持久化状态并重新评估限流和并发边界。

### Out of Scope

Redis、数据库、持久化 quota、多实例同步、云平台配置和实际部署不属于 Phase 3A。
