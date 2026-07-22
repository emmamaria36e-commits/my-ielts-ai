# Architecture

本文区分项目的真实现状与计划架构。`Current` 表示代码中已经存在，`Planned` 表示已确定方向但尚未实现。

## Current Architecture

当前项目是没有构建步骤的单页应用：

```text
index.html
├─ css/                     页面模块样式
└─ js/
   ├─ generator.js          输入、生成流程和结果展示
   ├─ player.js             自定义音频播放器
   └─ services/
      ├─ aiService.js       Provider 选择和统一入口
      ├─ promptBuilder.js   Prompt 与显示元数据
      ├─ mockProvider.js    本地模拟文本
      └─ apiProvider.js     浏览器端模型请求
```

### Current Request Flow

默认 Mock 模式：

```text
Browser → AIService → MockAIProvider → fixed passage → result display
```

当前真实 Provider 设计：

```text
Browser → APIProvider → external model API
```

真实 Provider 尚不适合生产使用，因为密钥和上游接口配置需要进入浏览器。播放器当前加载的是浏览器生成的短提示音，不是真实语音。

## Known P0 Risks

1. 浏览器直接访问模型接口会暴露 API Key，见 [DEC-001](DECISION_LOG.md#dec-001--将模型调用迁移到最小-node-后端)。
2. 模型正文通过 `innerHTML` 进入页面，缺少可信边界和安全清理。
3. Mock Provider 返回固定正文，却把所有输入词报告为已包含，见 [BUG-001](BUG_NOTES.md#bug-001--mock-provider-虚假报告目标词已包含)。
4. 当前音频只是 Web Audio 提示音，没有实现 TTS。
5. 首页展示范围大于当前 MVP，产品范围以 [PRODUCT.md](PRODUCT.md) 为准。

## Target MVP Architecture — Planned

文本生成：

```text
Browser
  → POST /api/generate with structured parameters
  → Node backend validates input and builds the prompt
  → AI provider
  → Node backend validates the provider response
  → Browser renders trusted plain-text fields safely
```

语音生成：

```text
Browser
  → POST /api/speech with validated text and one voice
  → Node backend
  → TTS provider
  → audio response
  → existing player controls
```

## Trust Boundaries

- 浏览器不能持有模型或 TTS 密钥。
- 浏览器只发送业务参数，不能指定任意上游接口或系统 Prompt。
- 用户输入、AI 输出和外部 API 响应均为不可信数据。
- 模型返回的 JSON 必须经过结构和业务规则验证。
- 展示层默认使用纯文本节点，不直接渲染模型 HTML。
- Mock 与真实 Provider 必须满足相同的成功结果契约。

## Intentionally Absent

当前不引入前端框架、数据库、用户系统、消息队列、微服务或对象存储。这些能力只有在产品需求出现后才重新评估。
