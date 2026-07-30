# Architecture

本文区分项目的真实现状与计划架构。`Current` 表示代码中已经存在，`Planned` 表示已确定方向但尚未实现。

## Current Architecture

当前项目由没有构建步骤的单页前端和同仓库最小 Node 服务组成：

```text
server.js                    静态资源、受保护的模型 API 和 Speech API
server/promptBuilder.js      服务端可信 Prompt
index.html
├─ css/                      页面模块样式
└─ js/
   ├─ generator.js          输入、生成流程和结果展示
   ├─ player.js             自定义音频播放器
   └─ services/
      ├─ aiService.js       Provider 选择和统一入口
      ├─ promptBuilder.js   Mock 调试 Prompt 与 Section/Voice 显示元数据
      ├─ mockProvider.js    确定性 Section 测试文本
      ├─ apiProvider.js      同源 Node 模型 API 客户端
      └─ speechService.js    同源 Node Speech API 客户端
```

### Current Request Flow

直接打开 `index.html` 时使用 Mock：

```text
Browser
  → AIService
  → MockAIProvider validates and normalizes target words
  → stable Section passage + lightweight target-word sentence
  → result satisfies the real Provider contract
  → safe result display
```

通过 Node 服务访问时使用受保护的真实 Provider 路径：

```text
Browser
  → APIProvider
  → POST /api/generate with words, Section, Voice and difficulty
  → Node validates input and builds a Section-specific prompt
  → external model API with server-only credentials
  → a failed first result triggers one focused repair or fresh regeneration within a two-call ceiling
  → Node returns the normalized result
```

生成正文后，单声音语音路径为：

```text
Browser
  → SpeechService
  → POST /api/speech with validated passage text and one trusted voice key
  → Node validates text and maps the voice key to an Azure voice
  → Azure Speech with server-only credentials and escaped SSML
  → one controlled retry for a temporary provider failure or timeout
  → Node returns MP3 audio
  → existing player loads a temporary browser object URL
```

浏览器不再保存密钥、上游地址或 Authorization Header。Node 只公开首页、`css/`、`js/`、`assets/` 和明确的 API 路由，不公开服务端文件或 `.env`。

## Completed P0 Foundation

- 模型密钥、上游地址和 Prompt 已移到 Node 可信边界，见 [DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)。
- `/api/generate` 对词汇数量、字符、IELTS Listening Section、声音和难度执行服务端验证。
- 上游请求设置超时，接口包含基础频率限制和受控错误响应。
- 模型响应只接受严格 JSON、纯文本 title 和 passage，并验证长度、HTML 和全部目标词。
- Generation Pipeline V2 将总模型调用预算固定为两次：首次结果合格则立即返回；少量缺词时最小修订上一版正文；大量缺词、无效 JSON 或结构错误时重新生成。第二次结果仍经过同一严格校验，见 [DEC-005](DECISION_LOG.md#dec-005--generation-pipeline-v2-按失败类型使用一次恢复调用)。
- 目标词检测将大小写与 Unicode 标点规范化后按完整词元序列匹配；标点不影响短语检测，但 `study` 不匹配 `studying`，`planet` 不匹配 `planets`。
- 生成过程输出结构化事件日志，并将匿名汇总追加到 Git 忽略的 `logs/generation.jsonl`；统计只包含 Section、目标词数量、首次缺词数量、恢复动作、成功状态、调用次数和耗时，不包含正文、密钥或完整词表。
- V2.1 在 User Prompt 中使用编号精确词表和内部 coverage 自检，初稿 temperature 为 0.3；建议长度按目标词数量动态调整为 160–210、190–250 或 220–290 词。coverage 不进入浏览器响应，服务端仍只信任 passage 检测。
- 页面使用文本节点和可信高亮元素展示正文，不将模型内容写入 `innerHTML`，见 [DEC-002](DECISION_LOG.md#dec-002--模型结果必须验证并以纯文本展示)。
- Mock Provider 会验证输入，并确保全部目标词进入轻量测试文本；其输出通过与真实 Provider 相同的结果契约，见 [BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)。
- `/api/speech` 使用服务端 Azure Speech 凭据，将受验证的正文合成为单声音 MP3；声音来自固定白名单，SSML 中的正文经过 XML 转义，见 [DEC-003](DECISION_LOG.md#dec-003--使用服务端-azure-speech-rest-api-生成单声音音频)。
- AI 与 Speech 使用独立的基础频率限制；Speech 临时失败或超时时最多自动重试一次。
- Section 1、3 的 `Speaker A/B/C:` 标签保留在页面原文中，但在构造 Speech SSML 前移除，避免被朗读。
- Section 1–4 决定文本是对话还是独白及其内容组织；Voice 只决定 TTS 音色，见 [DEC-004](DECISION_LOG.md#dec-004--以-ielts-listening-section-1-4-决定文本结构)。

## Remaining P0 Risks

1. 当前语音为一次性实时生成，不包含缓存或持久化。
2. 两次模型调用预算控制成本，但不能保证每次生成最终成功；终态失败保留严格校验并允许用户重新发起。

## Current Validated Text Flow

文本生成：

```text
Browser
  → POST /api/generate with structured parameters
  → Node backend validates input and builds the initial prompt
  → AI provider call 1
  → inspect strict JSON, text, length, HTML, and exact target-word tokens
  → accept, or choose one recovery action:
      small missing set → minimal repair of the existing draft
      large missing set / invalid result → fresh regeneration
  → AI provider call 2 (only when recovery is needed)
  → inspect with the same complete validation contract
  → Browser performs a defensive shape check
  → Browser creates text nodes and trusted highlight elements
```

无效 JSON、错误字段、HTML、缺词或异常长度都会以失败响应终止，不能进入成功展示流程。

如果两次尝试仍然失败，浏览器只在输入区显示可重试的简短中文提示，不将供应商或内部校验信息写入听力原文区域，也不覆盖已有成功结果。

## Current Validated Speech Flow

语音生成：

```text
Browser
  → POST /api/speech with validated text and one voice
  → Node validates text length, rejects HTML, and enforces a voice allowlist
  → Node escapes the text and builds trusted SSML
  → Azure Speech REST API
  → MP3 audio response
  → browser object URL
  → existing player controls
```

## Trust Boundaries

- 浏览器不能持有模型或 TTS 密钥。两类密钥都只存在于服务端环境变量中。
- 浏览器只发送业务参数，不能指定任意上游接口或系统 Prompt。该边界已经实现。
- 用户输入、AI 输出和外部 API 响应均为不可信数据。
- 模型返回的 JSON 必须经过结构和业务规则验证。真实 API 路径已经实现。
- 展示层默认使用纯文本节点，不直接渲染模型 HTML。该边界已经实现。
- 浏览器不能指定 Azure voice name、区域或上游地址，只能提交一个受支持的产品 voice key。
- Speech 正文视为不可信数据；服务端拒绝 HTML，并在构造 SSML 前执行 XML 转义。
- Mock 与真实 Provider 必须满足相同的成功结果契约。该契约已经通过自动测试统一验证。

## Intentionally Absent

当前不引入前端框架、数据库、用户系统、消息队列、微服务或对象存储。这些能力只有在产品需求出现后才重新评估。
