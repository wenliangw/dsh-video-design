# 模块规划：seeddance-adapter

> 状态：v1 已实现（转译两层 / 参数映射 / 占位计价 / 幂等三份记录 / 错误映射 / API 客户端与任务查询 + 失败终态标记）。审查轮修订：费率系数×2（reference + content_filter 可叠加）计入预算闸与预览；`axes.format` 映射 `aspect_ratio`；attempts 追加；mini 无 1080p 档按 720p 计价。

## 职责

标准镜头语言 JSON ↔ seeddance 厂商请求的转译层：prompt 转译、参数映射、计价、错误处理。

## API 形态（官方，[createVideoGeneration](https://www.seeddance.io/zh/docs/createVideoGeneration)）

- 提交：`POST /v1/videos/generations`，Bearer token，参数 = model（1.0-pro-fast/1.5-pro/2.0/2.0-fast/2.0-mini/2.5）、prompt（单一字符串）、duration（2–30s）、quality（480p/720p/1080p）、aspect_ratio（16:9/9:16/1:1/4:3/3:4/21:9/adaptive）、generate_audio、image_urls（1 张 I2V / 2 张首尾帧 / 3+ 参考生视频）、reference_mode（1–2 张当参考素材，仅 2.0/2.5）、content_filter、web_search。
- 轮询：`GET /v1/tasks/{task_id}`；余额：`GET /getCredits`。
- 错误码：402 余额不足 / 429 限流 / 422 参数错 → 映射中文可读提示 + 处置建议。

## 转译规则（已实现）

- 标准句法（`buildStandardSentence` 固定子句序 `[时间窗] 主体 | 镜头[key]值…`）→ 厂商叙述流（`buildVendorPrompt` 单窗合句、多窗「前 N 秒…随后…」）→ `toRequest` 参数映射（含 reference_mode/content_filter）。
- 参考图模式附「真实摄影质感」提示语；image_urls 仅公网 HTTPS（本地 SVG 转 PNG 不能直接喂，v2 接图床）。
- 错误码映射 ERROR_ZH；提示词长度截断。content_filter=false 按 1.1 倍费率计入预算与预览（官方契约），真实价格原样替换后 COMPILE 确认。

## 计价与成本（已实现）

- `estimate`：模型×时长×画质×模式因子（reference ×1.1 与 content_filter=false ×1.1 **可叠加**）→ 预估积分；计价表为占位值，PRICING_NOTE 明示「真实费率以 getCredits 核实为准」（决策 ID 83186e33）。
- `generate_shot` 侧：预算硬闸（工作区 config.budgetCredits ?? 插件配置）、dry_run 免费预览、task_id 幂等（pending 拒绝重复提交；attempts 追加不覆盖）、三份记录 `S00n.json`（shot/vendor_prompt/meta + attempts + status）。
- `video_task`：done/succeeded/completed/success → 下载 mp4 更新记录；failed/error/cancelled → 记录标 failed（幂等重提前置）；两者之外显示进度。
- **画幅轴与官方能力边界**：generate_shot 校验用 dvd 封闭 format 轴（16:9/9:16/1:1/4:3/21:9）；官方另支持 3:4/adaptive，要用须先扩轴（不得绕过校验）。
- **官方响应结构（已核对）**：POST 返回 {task_id, status}；GET /v1/tasks/{id} 处理中 `output: null`，完成后成片 URL 在 **`output.video_url`**（顶层无）——`extractVideoUrl` 双路径读取；failed/error/cancelled 落记录 meta.error。
- **请求体契约（已核对）**：content_filter 是 2.5 可选过滤器——仅显式 false 携带；reference_mode 仅 seedance-2.0/2.5 + 1–2 图（3+ 图走参考生视频）；image_urls 2.5 上限 30 张；negatives 接入 prompt；超长 prompt 按子句边界砍尾。
- **运行期纪律**：fetch 全带超时（提交 60s/查询·余额 20s/下载 300s）；mp4 下载上限 500MB；同 shot 进程内互斥 + attempts 留 5 条防幂等竞态。