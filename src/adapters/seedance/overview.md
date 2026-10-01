# seedance 适配器契约总览（人类可读面）

> 本文件是 `api.json` 的人类可读依据；`api.json` 是本文件的机器面提取，代码运行时读取（地址/路径/入参标准/上限/状态词不写死在代码里）。
> 契约与更新流程见 `../README.md`。

## 来源与核对

- **厂商**：火山方舟（Volcengine Ark）· Doubao-Seedance
- **官方文档来源**：https://ark.volcengine.com/region:cn-beijing/docs/ark/create-video-generation-task-api
- **本版核对日期**：2026-09-27（由用户提供的完整官方 md 转录；查询任务 API 与错误码总表两页待补录，见「待补录」）
- **在售版本核对**：2026-10-02 按两个方舟官方兼容源交叉核对当前在售 Model ID（见「当前在售版本」）；官方 model-list 页为登录墙，最终以方舟控制台为准
- **重要更正**：本适配器早前依据 seeddance.io（seedance 1.x 国际站）契约实现——**已过时**。现行官方契约为本文件所述火山方舟形态（端点、模型 ID、请求体、状态词均不同）。

## 基础地址与认证

- **创建任务端点**：`POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`
- **认证**：`Authorization: Bearer <Ark API Key>`（方舟控制台创建的 API Key）
  - 凭证通道：`.dvd.config.json` 的 `adapters[].apiKey`（留空回退环境变量 `SEEDANCE_API_KEY`）
  - baseUrl 三级覆盖：配置文件 `adapters[].baseUrl` > 环境变量 `SEEDANCE_BASE_URL` > 本文件 api.json 默认值
- **异步 + 有效期**：创建任务立即返回任务 `id`（仅保存 **7 天**）；进度须查询任务 API；成功后在查询响应 `content.video_url` 取成片（提取器兼容多路径兜底）。

## API 路径

| 动作 | 方法 + 路径 | 状态 |
|---|---|---|
| 创建视频生成任务 | `POST /api/v3/contents/generations/tasks` | ✅ 本文件已核录 |
| 查询视频生成任务 | `GET /api/v3/contents/generations/tasks/{id}` | 🟡 路径为方舟标准形态，正文待官方查询页补录 |
| 积分/余额查询 | **不存在**（计费为人民币，余额走方舟控制台） | ❌ 已移除调用，不伪造 |

## 模型家族（Model ID 带日期版本号，以方舟 model-list 为准）

| 家族 | Model ID 形态 | 能力摘要 | duration | 有声 |
|---|---|---|---|---|
| Seedance 2.5 | `doubao-seedance-2-5-*`（当前在售版本见下方） | 全模态参考生成（图片 0–30 / 视频 ≤10 / 音频 ≤10）、图生首帧/首尾帧、文生、视频编辑/延长；`output_format` mp4/mov；`draft` 样片；`omni_reference_task_type` auto/reference/edit/extend | `[4,30]` 或 `-1` | 有声/无声 |
| Seedance 2.0 系列 | `doubao-seedance-2-0-*` / `-fast` / `-mini` | 全模态参考生成（图片 0–9 / 视频 ≤3 / 音频 ≤3）、首帧/首尾帧、文生；2.0 支持 4k | `[4,15]` 或 `-1` | 有声/无声 |
| Seedance 1.0 pro | `doubao-seedance-1-0-pro-*` | 首帧/首尾帧/文生；`frames` 25+4n；`seed`/`camera_fixed`/`service_tier` | `[2,12]` | 无声 |
| Seedance 1.0 pro fast | `doubao-seedance-1-0-pro-fast-*` | 首帧/文生（无首尾帧）；frames/seed/camera_fixed/service_tier | `[2,12]` | 无声 |

### 当前在售版本（2026-10-02 交叉核对，以方舟控制台 model-list 为准）

官方 model-list 页需登录，本表由两个方舟官方兼容源交叉核对（[亿速云 Seedance 2.x 文档](http://www.yisu.com/help/ai_docs/video-api/api-capabilities/seedance_2x.html) 的上游模型 ID 表 + [apifox 官方格式接口页](https://gpt-best.apifox.cn/api-510675713)）。**插件默认 `doubao-seedance-2-0-fast-260128`**（生成快、720p 上限与 v1 默认画质一致；需要 1080p 换 2.0 基座、需要 4k/长时长/全模态参考换 2.5）。

| 家族 | 当前在售版本 ID | 分辨率上限 |
|---|---|---|
| Seedance 2.5 | `doubao-seedance-2-5-260628` | 480p/720p/1080p/4k |
| Seedance 2.0 | `doubao-seedance-2-0-260128` | 480p/720p/1080p/4k |
| Seedance 2.0 fast | `doubao-seedance-2-0-fast-260128` | 480p/720p |
| Seedance 2.0 mini | `doubao-seedance-2-0-mini-260615` | 480p/720p |

> 旧示例 ID `doubao-seedance-1-0-pro-250528` 已过时，仅作 1.0 家族前缀解析的历史样例保留在代码测试中，不用于默认配置。

## 请求入参（标准）

### 主体字段

| 字段 | 类型 | 必填 | 要点 |
|---|---|---|---|
| `model` | string | ✅ | 方舟 Model ID 或 Endpoint ID（版本化 ID，当前在售如 `doubao-seedance-2-0-fast-260128`，见「当前在售版本」表） |
| `content` | array | ✅ | 多模态内容列表，见下 |
| `resolution` | string | 否 | `480p`/`720p`/`1080p`/`4k`；各模型支持上限以 model-list 为准（客户端不预判，越界错误由接口返回并透明呈现） |
| `ratio` | string | 否 | `16:9`/`4:3`/`1:1`/`3:4`/`9:16`/`21:9`/`adaptive`；1.0 系列文生默认 `16:9`、图生默认 `adaptive` |
| `duration` | integer | 否 | 见上表各家族范围；`-1` = 模型自选。插件 v1 恒显式传值 |
| `frames` | integer | 否 | 1.0 系列；`25+4n`，n∈[1,66]，即 [29,289]；与 duration 二选一（frames 优先） |
| `generate_audio` | boolean | 默认 **true** | 2.5 / 2.0 系列有声视频。**插件 v1 政策：显式 `false`（保持无声承诺）**；1.0 系列不携带该字段 |
| `watermark` | boolean | 默认 false | 是否附带水印 |
| `seed` | integer | 默认 -1 | 1.0 系列；[0, 2147483647] |
| `camera_fixed` | boolean | 1.0 系列 | 镜头固定 |
| `return_last_frame` | boolean | 否 | 返回尾帧（多镜连续叙事 v2 的弹药） |
| `output_format` | string | 默认 `mp4` | 2.5：`mp4`/`mov` |
| `draft` | boolean | 2.5 | 样片模式（稿预演，正式片前验画风） |
| `omni_reference_task_type` | string | 默认 `auto` | 2.5：`auto`/`reference`/`edit`/`extend`；edit 需参考视频 + ratio adaptive + duration -1 |
| `service_tier` | string | 默认 `default` | 1.0 系列：`default`/`flex`（flex 高配额、价格 50%） |
| `priority` | integer | 默认 0 | [0, 9]，只影响排队顺序 |
| `execution_expires_after` | integer | 默认 172800 | [3600, 259200] 秒；超时任务标 `expired` |
| `callback_url` / `safety_identifier` / `description` / `tools(web_search)` | — | 否 | 回调、用户标识（≤64 字符）、任务描述、2.5 联网搜索 |

### content[] 多模态条目

| type | 付档 | role 取值 |
|---|---|---|
| `text` | `text` | 提示词正文（中文 ≤500 字 / 英文 ≤1000 词，官方建议） |
| `image_url` | `url`（HTTPS）/ 素材 ID `asset://<id>` / base64 | `first_frame`（首帧）、`last_frame`（尾帧）、`reference_image`（参考图，仅 2.5/2.0 系列） |
| `video_url` | `url` / 素材 ID | `reference_video`（参考视频，2.5/2.0 系列） |
| `audio_url` | `url` | `reference_audio`（参考音频，2.5/2.0 系列） |
| `draft_task` | `id` | 样片任务引用（2.5） |

### 输入素材上限（按家族）

| 项 | Seedance 2.5 | Seedance 2.0 系列 | 1.0 pro / fast |
|---|---|---|---|
| 参考图 | 0–30 张 | 0–9 张 | ❌ 不支持参考图（仅首帧 1 张；1.0 pro 另支持首尾帧 2 张，fast 首帧 1 张） |
| 参考视频 | ≤10 个，总时长 ≤30s，单个 [2,30]s | ≤3 个，总时长 ≤15s，单个 [2,15]s | ❌ |
| 参考音频 | ≤10 段，总时长 ≤30s，单个 [2,30]s | ≤3 段，总时长 ≤15s，单个 [2,15]s | ❌ |

### 图片/视频/音频限制速查

- **图片**：jpeg/png/webp/bmp/tiff/gif（2.0+ 另支持 heic/heif）；宽高比 [0.4, 2.5]；边长 [300, 6000]px；单张 <30MB。
- **视频**：mp4/mov；编码 H.264 等；分辨率 480p/720p/1080p/4k；单个 ≤200MB；帧率 24–60 FPS。
- **音频**：mp3/wav；单个 ≤15MB。
- **请求体**：整体 ≤64MB；大文件勿用 Base64（用 URL 或素材 ID）。

### 弱校验传参（提示词尾部语法）

`resolution/ratio/duration/frames/seed/camera_fixed/watermark` 支持提示词末尾追加 `--[parameters]`（如 `--resolution 720p`）。插件 v1 恒走 body 强校验，不使用此语法。

## 响应与任务状态

- **创建响应**：仅返回任务 `id`（无状态字段）；插件落盘初始状态 `pending`（本地词汇），真实进度以查询 API 为准。
- **任务状态词汇（官方）**：`queued`（排队中）/ `running`（运行中）/ `succeeded`（成功）/ `failed`（失败）/ `expired`（超时，运行/排队超 `execution_expires_after`）
- **成片位置**：查询响应 `content.video_url`（提取器兼容 `output.video_url` / 顶层 `video_url` 兜底）。
- **提示词建议**：中文 ≤500 字、英文 ≤1000 词——超长易信息分散、成片缺元素。

## 错误码

- 已知业务码：`InvalidParameter.TaskTypeConstraint`（参数与自动判定的任务类型不兼容，异步报错）、`InvalidParameter.TaskTypeMismatch`（显式指定任务类型与实际判定不一致，异步报错）
- HTTP 语义：400 参数/媒体不符合要求、401 鉴权失败、403 无权限、429 限流、5xx 服务端错误
- 🟡 完整错误码表走官方 `error-codes` 页，**待补录**。

## 计费 / 积分

- **不存在积分/余额查询 API**——余额与用量以方舟控制台为准；本插件 v1 的计费预估为**未校准占位**（确认卡明示口径）。
- 计费单位：人民币，按刊例价计费；known 活动价（2026-08-07 14:00 → 2026-10-07 14:00 UTC+8，限企业用户，达 token 上限恢复刊例价）：Seedance 2.0 mini 480p/720p 四折（720p 约 0.2 元/秒）、2.0 fast 480p/720p 七五折（720p 约 0.6 元/秒）。
- 🟡 各模型各分辨率刊例价表待官方计费页补录 → `api.json` 的 `pricing` 段。

## 待补录（诚实清单）

1. 查询视频生成任务 API 正文（响应结构/字段）——官方页 /ark/get-video-generation-task-api
2. 错误码完整表——官方页 /ark/error-codes
3. 🟡→🟢（部分）Model ID 全表：当前在售版本经两官方兼容源交叉核对（见「当前在售版本」），官方 model-list 页登录墙未直读；各模型分辨率上限表与刊例价表仍待 model-list / 计费页补录
4. 各家族 `generate_audio` 精确支持面（fast/mini 是否有声）——模型能力页