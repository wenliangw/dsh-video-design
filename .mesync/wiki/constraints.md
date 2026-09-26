# 约束

## 环境约束

- **宿主**：dsh（DeepSeek Harness），插件 = Cordis bundle，本地开发期先于发布。
- **主 Agent 模型无关**：编译在 Agent 侧靠注入心法完成，执行固化成工具合约（schema 严格校验）；任何模型可用。
- **视觉能力依赖**：参照图解读依赖主 Agent 多模态（read_image）；非视觉模型降级为「存原图 + 用户描述 + Agent 只出 SVG 骨架」。
- **凭据**：seeddance API key 不进 config.json 明文，优先环境变量；key 只从可信服务端发送。

## seeddance API 约束（官方文档查证）

- prompt 是**单一自然语言字符串**，无分段语法参数；时间只能由 `duration`（2–30s 整数，各模型范围不同）表达。
- 图片输入只收 JPEG/PNG/WebP：1 张 = 图生视频，2 张 = 首尾帧，3+ 张（2.5 支持） = 参考生视频；每边 300–6000px，宽高比 0.4–2.5；reference_mode=true 把 1–2 张图当参考素材（仅 2.0/2.5）。
- 任务异步：POST 返回 task_id，GET 轮询进度；**重复 POST 会创建第二个任务**——generate_shot 必须幂等（提交即写 task_id）。
- 积分计费：`GET /getCredits` 查余额，402 = insufficient_credits，429 = 限流，422 = 参数错；content_filter 默认开，关闭按 1.1 倍费率。
- 提示词长度上限因模型而异 → adapter 截断策略（超长砍氛围保留主体与运动）。

## 性能与成本约束

- 生成是分钟级异步任务 → 后台 job 执行，不阻塞对话。
- 成本面设计：确认卡成本预估（积分计价表按模式因子维护）、预算硬闸（config.json 上限，超限工具拒绝）、重试上限（默认 ≤2）、单 shot 粒度出片（错一格重拍一格）。
- SVG 栅格化失败必须降级纯 T2V，预览是增强不是依赖。

## 其他约定

- 内容落文件（md/json），索引落 sqlite 且可随时从内容重建 → story 目录自包含，可直接拷贝归档。
- 命名：EP001/EP002（机器可排序）、shots/S001.json + S001.mp4 同目录。
- 素材共识门控在数据层拦死：confirmed 未过的不进档案。