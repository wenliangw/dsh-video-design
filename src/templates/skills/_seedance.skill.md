# seeddance 心法 — 转译 / 计价 / 底线（v1，随官方文档迭代）

本插件与 seeddance 的契约（[官方 API 文档](https://www.seeddance.io/zh/docs/createVideoGeneration) 为基准，心法落后于官方时以官方为准）。

## 两层转译铁律

- 标准层（我们的话语）：`[时间窗] 主体 | 镜头[size]值 | 镜头[angle]值 | …`——固定子句顺序，可倒解析回 11 域封闭视觉轴（声音/画幅/人物表演不在标准句里，走厂商层扩展）。
- 厂商层（翻译稿）：seeddance 只收**单一自然语言字符串**，没有分段语法参数。单窗合句；多窗「前 N 秒…随后…」。
- 参考图模式附「真实摄影质感，电影级光影」类提示语压图纸感。

## 参数红线（能力边界）

- duration 2–30s 整数；quality 480p/720p/1080p（2.0-mini 最高 720p）。**画幅以 11 域封闭轴为准：16:9/9:16/1:1/4:3/21:9**（generate_shot 校验）；官方另支持 3:4/adaptive，要用必须先扩展 format 轴，不能绕过校验。
- image_urls 只收**公网 HTTPS** JPEG/PNG/WebP；每边 300–6000px、宽高比 0.4–2.5；1 张=I2V、2 张=首尾帧、3+ 张=参考生视频（2.5 最多 30 张，其余模型上限按 4 张）。
- reference_mode 仅 `seedance-2.0`/`seedance-2.5` 两型号 + 1–2 张图（3+ 张自动走参考生视频，不设该旗标）；本地 SVG 转的 PNG 不能直接喂（无公网 URL）——v2 接图床上传。
- **重复 POST = 第二个任务**：generate_shot 已做 task_id 幂等 + 同 shot 进程内互斥，Agent 不绕过工具手动重发。
- content_filter 是 2.5 的可选过滤器（默认 true）：只有在显式传 false 时请求才携带该字段；关闭按官方 1.1 倍费率（确认卡须明示）。reference 系数 ×1.1 是保守占位估算（官方无此费率条款），真实费率以 getCredits 为准。

## 错误码应急

402 余额不足 → 提示用户充值/调预算；429 限流 → 稍后重试；401 key 无效 → 检查 `.dvd.config.json` 的 `adapters[].apiKey`（文件优先）或环境变量 `SEEDANCE_API_KEY`；422 → 参数超能力边界，回查上表红线；请求超时（工具已带 60s 提交/20s 查询超时）→ 先 video_task 查是否已创建，避免重提产生双任务。
- 出片取回：完成态成片 URL 在官方响应 `output.video_url`（视频下载超时 5 分钟、上限 500MB）；失败态（failed/error/cancelled）video_task 会把 shot 记录标 failed 并写入服务端 error 归因。

## 计价

adapter 内置占位计价表（积分/秒×模式因子）。**真实费率以 getCredits 核实为准**——核实后：用户侧更新工作区 `.dvd/skills/_seedance.skill.md`（本文件的实例化副本，改文件即改行为）；插件航运的 PRICE 表由维护者随包更新。