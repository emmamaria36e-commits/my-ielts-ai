# Architecture

本文区分项目的真实现状与计划架构。`Current` 表示代码中已经存在，`Planned` 表示已确定方向但尚未实现。

## Current Architecture

当前项目由没有构建步骤的单页前端和同仓库最小 Node 服务组成：

```text
server.js                    静态资源和受保护的模型 API
server/promptBuilder.js      服务端可信 Prompt
index.html
├─ css/                      页面模块样式
└─ js/
   ├─ generator.js          输入、生成流程和结果展示
   ├─ player.js             自定义音频播放器
   └─ services/
      ├─ aiService.js       Provider 选择和统一入口
      ├─ promptBuilder.js   Prompt 与显示元数据
      ├─ mockProvider.js    本地模拟文本
      └─ apiProvider.js      同源 Node API 客户端
```

### Current Request Flow

直接打开 `index.html` 时使用 Mock：

```text
Browser → AIService → MockAIProvider → fixed passage → result display
```

通过 Node 服务访问时使用受保护的真实 Provider 路径：

```text
Browser
  → APIProvider
  → POST /api/generate with structured parameters
  → Node validates input and builds the prompt
  → external model API with server-only credentials
  → Node returns the normalized result
```

浏览器不再保存密钥、上游地址或 Authorization Header。Node 只公开首页、`css/`、`js/`、`assets/` 和明确的 API 路由，不公开服务端文件或 `.env`。

## Completed P0 Foundation

- 模型密钥、上游地址和 Prompt 已移到 Node 可信边界，见 [DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)。
- `/api/generate` 对词汇数量、字符、场景、声音和难度执行服务端验证。
- 上游请求设置超时，接口包含基础频率限制和受控错误响应。
- 模型响应只接受严格 JSON、纯文本 title 和 passage，并验证长度、HTML 和全部目标词。
- 页面使用文本节点和可信高亮元素展示正文，不将模型内容写入 `innerHTML`，见 [DEC-002](DECISION_LOG.md#dec-002--模型结果必须验证并以纯文本展示)。

## Remaining P0 Risks

1. Mock Provider 返回固定正文，却把所有输入词报告为已包含，见 [BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)。
2. 当前音频只是 Web Audio 提示音，没有实现 TTS。
3. 首页展示范围大于当前 MVP，产品范围以 [PRODUCT.md](PRODUCT.md) 为准。

## Current Validated Text Flow

文本生成：

```text
Browser
  → POST /api/generate with structured parameters
  → Node backend validates input and builds the prompt
  → AI provider
  → Node backend parses strict JSON and validates text, length, HTML, and target words
  → Browser performs a defensive shape check
  → Browser creates text nodes and trusted highlight elements
```

无效 JSON、错误字段、HTML、缺词或异常长度都会以失败响应终止，不能进入成功展示流程。

## Next MVP Architecture Work — Planned

语音生成仍为计划：

```text
Browser
  → POST /api/speech with validated text and one voice
  → Node backend
  → TTS provider
  → audio response
  → existing player controls
```

## Trust Boundaries

- 浏览器不能持有模型或 TTS 密钥。模型密钥边界已经实现，TTS 尚未接入。
- 浏览器只发送业务参数，不能指定任意上游接口或系统 Prompt。该边界已经实现。
- 用户输入、AI 输出和外部 API 响应均为不可信数据。
- 模型返回的 JSON 必须经过结构和业务规则验证。真实 API 路径已经实现。
- 展示层默认使用纯文本节点，不直接渲染模型 HTML。该边界已经实现。
- Mock 与真实 Provider 必须满足相同的成功结果契约。Mock 一致性将在 P0 Step 3 完成。

## Intentionally Absent

当前不引入前端框架、数据库、用户系统、消息队列、微服务或对象存储。这些能力只有在产品需求出现后才重新评估。
