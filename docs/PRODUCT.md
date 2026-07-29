# Product

## Product Purpose

My IELTS AI 帮助 IELTS 学习者把正在记忆的词汇转化为有语境、可播放、可复习的听力材料。

项目首先解决一个具体问题：学习者可能认识一个单词，却无法在真实语速和连续语境中听懂它。

## Target Users

- 正在准备 IELTS 的英语学习者。
- 希望用个人词汇表进行听力训练的学习者。
- 需要重复听取目标词在不同语境中用法的学习者。

## Listening MVP

当前已经确认的 MVP 核心流程是：

```text
输入目标词汇
→ 选择 IELTS Listening Section 1–4 和单一声音
→ AI 生成包含全部目标词的听力文本
→ TTS 生成与文本一致的真实语音
→ 播放音频并查看原文和目标词
```

### In Scope

- 目标词输入、去重和基础限制。
- IELTS Listening Section 1–4 选择；Section 决定文本结构和考点风格。
- 单声音选择。
- AI 听力文本生成。
- 目标词完整性验证。
- 真实 TTS 音频。
- 播放、暂停、进度、音量和倍速控制。
- 原文展示与目标词高亮。
- 生成失败时提供清晰、可恢复的反馈。

### Product Boundary

- 产品只聚焦 IELTS Listening 工具，不计划扩展 Writing、Reading 或 Speaking 模块。

### Out of Scope for the Current MVP

- 用户登录、云端同步和学习记录。
- Voice Studio 和声音克隆。
- 多角色 TTS、音频拼接和逐句时间轴。
- 按题型生成题目、答案或解析。
- 填空练习、逐句精听和答案解析。
- 付费、订阅和社交功能。
- 为未来功能提前建立复杂扩展架构。

## MVP Success Criteria

- 模型和 TTS 密钥不会出现在浏览器或仓库中。
- 每次成功生成的正文都确实包含全部目标词。
- AI 内容经过验证，并以安全方式展示。
- 播放的语音与生成正文一致。
- 文本生成或语音生成失败时，用户能知道发生了什么并可以重试。
- 核心流程在桌面和移动端都能完成。

## Product Principle

在 Listening 核心流程可靠之前，不扩大 IELTS 模块范围。新的功能想法先评估是否直接提升当前 MVP，再决定进入 Roadmap 或 Deferred 列表。
