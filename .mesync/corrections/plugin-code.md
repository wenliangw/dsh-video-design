# plugin-code

## 插件代码里出现注入提示词中文文案 → 必须检查是否违反「代码不写死提示词」

- 改动 `src/agent/context.ts`、`events.ts` 或任何会进 `ctx.systemPrompt.section(...)` 的文本 → 提示词内容必须来自文件（航运母版 `src/templates/**` / 工作区可编辑副本 `.dvd/*.md` / 故事文件），代码只做「读文件 + 结构组装」，不构造任何指导性文案。
- 曾经翻过两次：TRIGGER_BLOCK 写死在 context.ts（已撤并入 CAPABILITIES.md）；总纲缺失兜底文案写死在 buildDoctrineGuide（已改为回退航运 AGENT_TEMPLATE.md）。
- 为什么：用户侧改注入文件即可调行为，不必改代码发版；写死的提示词用户无法调整且易被「顺路」改动漂移。
- 例外（不是提示词）：工具参数 description（工具 API 契约元数据）、Story Context 的动态数据结构标签（## EP 进度 等）、播种模板的结构占位符（{storyName}）。

## 触碰宿主 dsh-system-prompt 注册 → 必须检查「同层重名必抛」

- `systemPrompt.section()` 是「层内 NamedEntries 重名 insert 即抛异常」——写进 `agent/session-start` 事件回调 = 每个新会话/子代理都重复注册 → 第二次 session 必崩。正确姿势：只注册一次，`text()` 动态解析当前会话（模块态）。
- 曾经翻过：三段注入全部写在 session-start 回调里（events.ts），已改为一次注册 + peekVideoContext() 动态 text。
- 为什么：host 契约在 lib（NamedEntries.insert if(data.has(name)) throw），不读源码就会踩；mesync 同款模式单会话侥幸未炸，不代表正确。

## 对接厂商 API 响应结构 → 必须用官方文档样例核对字段层级

- 出片 URL 猜成顶层 `video_url` 时，官方实际是 `output.video_url`（处理中 output=null）——猜错 = 每次成功任务都死锁。修法：extractVideoUrl 双路径 + 官方文档样例核对。
- 同时核对的官方契约（已落地）：content_filter 仅 2.5、false 才显式携带；reference_mode 仅 2.0/2.5 + 1–2 图；image_urls 2.5 上限 30 张；POST 重复=第二任务（幂等设计依据）。
- 为什么：占位猜测不可长期挂着「已完成」的帽子——字段层级错了，整条取片链路都是死的。