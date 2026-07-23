# Roadmap

本文只记录已经确认的开发顺序和明确暂缓的事项。实现状态以代码和 Git 历史为准。

## Current Milestone — P0 MVP Foundation

| Step | Work | Status | Completion condition |
|---|---|---|---|
| 1 | 建立最小 Node 后端并迁移模型 API 调用 | Completed | 浏览器不再持有上游密钥或直接调用模型接口 |
| 2 | 验证模型结果并安全渲染正文 | Completed | 无效结构和缺词结果不能进入成功流程，模型 HTML 不被直接渲染 |
| 3 | 修复 Mock Provider 业务一致性 | Completed | Mock 成功结果确实包含全部目标词 |
| 4 | 接入单声音真实 TTS | Planned | 播放器能够播放与正文一致的真实语音 |
| 5 | 收缩首页 MVP 展示范围 | Planned | 页面承诺与当前可用能力及近期路线一致 |

每个 Step 应作为独立、可验证、可回滚的修改处理，不提前混入后续 Step。

## Deferred

| Item | Reason |
|---|---|
| 多角色 TTS | 需要角色分段、多次合成和音频拼接，不属于最小可靠流程 |
| Voice Studio | 依赖声音上传、授权和克隆能力，不属于当前核心问题 |
| 登录和学习记录 | 核心生成与播放流程稳定前不引入持久化和用户系统 |
| Writing、Reading、Speaking | 先证明 Listening MVP 的学习价值，避免产品范围失控 |
| 填空、逐句精听和答案解析 | 依赖可靠文本、音频和时间轴，应在 TTS 之后评估 |
| 前端框架迁移 | 当前规模下 Vanilla JavaScript 仍可支持下一个 MVP 里程碑 |
| 正式发布 Changelog | 等项目开始产生面向用户的版本发布后建立 |

## Re-evaluation

完成 P0 MVP Foundation 后，根据真实主流程测试结果重新确定下一阶段，不提前承诺完整 IELTS 平台。
