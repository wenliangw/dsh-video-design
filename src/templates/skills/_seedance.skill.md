# _seedance — seeddance 转译·参数红线·计价底线（契约驱动）

> 本心法是「怎么做」（转译步法、政策）；「是什么」（地址、路径、入参标准、上限、状态词、错误语义）全部由契约文件承接：
> - 机器面 `src/adapters/seedance/api.json`（代码运行时读取）
> - 人类可读面 `src/adapters/seedance/overview.md`（官方文档实录 + 来源 URL + 核对日期 + 待补录清单）
>
> **厂商事实一律以契约文件为准，不得写死在代码或本心法里。** 官方文档更新走 `src/adapters/README.md` 维护流程（改契约 → 跑测试钉一致性）。

## 0. 适配器现状（诚实基线）

- seeddance = **火山方舟 Doubao-Seedance**（端点为 ark.cn-beijing.volces.com）。早前按 seeddance.io 国际站实现的契约为过时契约，已废弃。
- 异步接口：POST 创建任务返回任务 `id`（仅存 **7 天**，无状态字段）→ GET 查询任务取成片（`content.video_url`）。
- 状态词（官方）：`queued` 排队中 / `running` 运行中 / `succeeded` 成功（终态）/ `failed` 失败（终态）/ `expired` 超时（终态）。
- **无积分/余额查询 API**：余额、用量以方舟控制台为准。计价预估当前为**未校准占位**，确认卡必须原文照说「未校准」+ 单位元（CNY）。
- 官方提示词建议：中文 ≤500 字、英文 ≤1000 词，超长易信息分散、成片缺元素——v1 已按 500 字截断兜底。

## 1. 两层转译铁律

- **标准层（我们的话语）**：`[时间窗] 主体 | 镜头[size]值 | 镜头[angle]值 | …`——固定子句顺序，可倒解析回 11 域封闭视觉轴（声音/画幅/表演不在标准句，走厂商层扩展）。
- **厂商层（翻译稿）**：content 数组首条 `{type:'text'}` 收**单一自然语言字符串**，无分段语法。单窗合句；多窗「前 N 秒…随后…」。
- 参考图模式附「真实摄影质感，电影级光影」类提示压图纸感。

## 2. 参数红线（以 overview.md 人面 + api.json 机面契约为准，此处是使用摘要）

- **model 无内置默认**：用户必须显式配置——`.dvd.config.json` 的 `adapters[].model`（或环境变量 `SEEDANCE_MODEL`）；未设置时 generate_shot 拒绝并指引，不得代编模型 ID。model 纯透传：版本化 ID / Endpoint ID 一律原样发出，客户端不做前缀/家族解析。当前在售版本见 overview「当前在售版本」表（人面参考）。
- **家族能力完全配置化（契约零内置）**：api.json **不内置任何按模型/家族区分的事实**——时长范围、参考图上限、generate_audio 策略全部由用户在 `.dvd.config.json` 该 adapter 条目的 `caps` 四字段声明（durationRange / maxReferenceImages / maxFirstLastFrame / generateAudio），四字段必填、缺项 generate_shot 显式拒绝并给可复制模板；`family` 可选，仅作显示标签。声明即用、无需发版，插件发版只跟 API 形态变化走。generateAudio 取值 `explicit-false`（家族支持参数→恒发 false 守无声承诺）/ `omit`（不支持→字段不携带）。
- **duration**：按用户 caps.durationRange clamp 后恒显式传值（官方 `-1`=模型自选，v1 不用）；caps 未声明时 generate_shot 在转译前即拒绝。
- **resolution**：480p/720p/1080p/4k；v1 客户端只发 480/720/1080 三档，各模型支持上限以方舟 model-list 为准——越界靠服务端校验错误透明呈现，客户端不预判。
- **ratio**：16:9/4:3/1:1/3:4/9:16/21:9/adaptive。
- **参考图（content 的 image_url role）**：1 张=首帧 `first_frame`；2 张=首尾帧；3+ 张或 reference_mode=true=参考图 `reference_image`。**张数上限一律按用户 caps 声明校验**（maxReferenceImages / maxFirstLastFrame），契约不内置家族数字；参考值见 overview「模型家族」表。图片只收公网 HTTPS（jpeg/png/webp/bmp/tiff/gif；2.0+ 另 heic/heif），边长 300–6000px、宽高比 0.4–2.5、<30MB。
- **generate_audio**：官方默认 true（有声），**v1 政策：按用户 caps.generateAudio 声明执行**——`explicit-false` 恒显式 false 守无声承诺；`omit` 不携带字段（家族无此参数）。将来开放有声是功能决策，不与官方默认绑定。
- **watermark**：默认 false，客户端恒显式携带。
- **无 content_filter 参数**（那是过时国际站契约）；**无 reference_mode 请求字段**（方舟用 role 表达），config.referenceMode 只是插件内 roi 分配语义触发器。
- **重复 POST = 第二个任务**：generate_shot 已做 record 幂等 + 进程内互斥，Agent 不绕过工具手动重发。

## 3. 错误面（契约表 + 兜底）

- HTTP 语义：400 参数/媒体不符合要求、401 鉴权失败（查 `.dvd.config.json` `adapters[].apiKey` 或 `SEEDANCE_API_KEY`）、403 无权限、429 限流（稍后重试）、5xx 服务端（稍后重试）。
- 业务码：`InvalidParameter.TaskTypeConstraint`（参数与自动判定任务类型不兼容，异步报错）、`InvalidParameter.TaskTypeMismatch`（显式任务类型与实际判定不一致，异步报错）。
- 提交/查询超时（60s/20s）→ 先 video_task 查是否已创建，避免重提双任务。
- 失败终态（failed/expired）：video_task 把 shot 记录标 failed 并写服务端 error 归因，解除 pending 死锁后允许重提。

## 4. 计价与成本

- **未校准占位**（est 返回 estimatedCost=null）：方舟计费为人民币刊例价/秒，无积分 API；官方刊例价表待补录进 `src/adapters/seedance/api.json` 的 `pricing` 段——补录后 estimate 自动给元级预估。
- 已知限时活动价（仅企业用户、达量恢复刊例，勿写进估算）：2.0 mini 480p/720p 四折（720p≈0.2 元/秒）、2.0 fast 480p/720p 七五折（720p≈0.6 元/秒），活动期至 2026-10-07 14:00（UTC+8）。
- 预算硬闸：`budgetCredits`（口径已定为元）> 0 且费率已校准才拦截；未校准时放行但确认卡/提交回复明示「闸门未拦截」。
- dry_run 免费；确认卡必须明示「计价未校准」口径，绝不报一个没根据的数字。

## 5. 契约维护

官方文档更新 → 改 `src/adapters/seedance/overview.md`（人面）与 `api.json`（机面）两份 → 跑 `npx vitest run test/adapter.test.ts`（钉「代码行为=api.json 事实」）→ 提交。新增请求字段未接入插件语义时，先记入 overview.md「待补录」，不伪造支持。