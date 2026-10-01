# 模块规划：seeddance-adapter（火山方舟契约驱动）

> 状态：v1 已实现。2026-09-27 按用户提供的最新官方文档（方舟 Doubao-Seedance）整模块重构：**契约文件化**（facts 在文件）——`src/adapters/seedance/overview.md`（人面）+ `api.json`（机面），实现 `seedance.ts` 运行时读 api.json，任何厂商事实零代码写死。旧 seeddance.io 国际站契约为过时契约，已废弃。2026-10-02 按两个方舟官方兼容源交叉核对当前在售版本表（用户本地归档副本已移除，官方文档以 URL 引用为准）。

## 结构（一厂商一目录，2026-09-27 用户拍板）

```
src/adapters/
├── README.md        ← 目录契约 + 维护流程（官方更新 → 改两层契约 → 跑测试钉一致性）
├── registry.ts      ← 多厂商注册解析（.dvd.config.json 按 name 对应；apiKey 空回退 <NAME大写>_API_KEY）
└── seedance/
    ├── overview.md  ← 人类可读契约实录（来源 URL + 核对日期 + 参数表 + 待补录清单）
    ├── api.json     ← 机器面事实（endpoints/paths/家族前缀/duration 范围/图上限/状态词/错误语义）
    └── seedance.ts  ← 转译两层/参数映射/计价预估/错误映射/API 客户端/三份记录
```

api.json 只装「是什么」（What），不装「怎么做」（How）——转译句法、装配顺序、幂等/预算策略仍是代码职责。航运随包：copy-assets.mjs 把 `src/adapters/**/{*.md,*.json}` 复制进 lib/adapters，package.json files 已覆盖。

## API 形态（方舟，2026-09-27 核对）

- 提交：`POST /api/v3/contents/generations/tasks`（baseUrl 覆盖链：.dvd.config.json > `SEEDANCE_BASE_URL` 环境变量 > api.json 默认 `https://ark.cn-beijing.volces.com`），Bearer Ark API Key。响应仅含任务 `id`（无状态字段，7 天有效）——归一化 `{task_id, status:'queued'}`。
- 请求体：`model`（版本化 ID，**无内置默认**——用户须在 `.dvd.config.json` 显式设置或设 `SEEDANCE_MODEL` 环境变量，未设置时 generate_shot 拒绝；在售版本表见契约 overview「当前在售版本」，仅作选择参考）、`content[]`（首条 `{type:'text'}` prompt + 可选 `{type:'image_url', image_url:{url, role}}`）、resolution（480p/720p/1080p/4k）、ratio（16:9/4:3/1:1/3:4/9:16/21:9/adaptive）、duration（按家族 clamp：2.5 [4,30] / 2.0 系列 [4,15] / 1.0 系列 [2,12]）、generate_audio（官方默认 true，仅 2.5/2.0 系列）、watermark（默认 false，恒显式）。
- 家族门控完全配置化：api.json **不内置任何按模型/家族区分的事实**（无前缀表、无时长/图片/audio 家族表）；能力（durationRange 时长 clamp / 参考图与首尾帧上限 / generate_audio 策略）必须由用户在 .dvd.config.json adapter 条目的 `caps` 四字段声明，`family` 可选仅作显示标签；缺项 → generate_shot 拒绝并给可复制模板；参考值见 overview「模型家族」表（人面参考）。声明即用、无需发版——插件发版只跟 API 形态变化走。
- 轮询：`GET /api/v3/contents/generations/tasks/{id}`（路径待官方查询页核实，标记 `getTaskVerified:false`）；状态词 queued/running/succeeded/failed/expired。**无积分/余额查询 API**（getCredits 已整个移除）——余额与用量以方舟控制台为准。
- 错误：400/401/403/429/5xx HTTP 语义 + 业务码 `InvalidParameter.TaskTypeConstraint` / `InvalidParameter.TaskTypeMismatch`（异步报错）→ 契约表逐条中文化。

## 校验/门控（实现要点）

- `validateReferenceInput`：图 role 按张数自动分配（1=首帧 / 2=首尾帧 / 3+=参考图）；reference_mode → 全参考图，仅 2.5（≤30 张）/ 2.0 系列（≤9 张）；1.0 pro 仅首尾帧 2 张、1.0 pro fast 仅首帧 1 张——越界在 generate_shot 前置返回中文错误。
- `familyOf`：按 Model ID 前缀解析（fast/mini 先于 2.0 基座匹配），未知前缀回退 generic（保守上限 [2,30]）。
- prompt 兜底 `clampPrompt`：官方建议中文 ≤500 字（api.json promptMaxCharsZh），超长按「；」子句边界砍尾保主体。
- 无声承诺：2.5/2.0 系列恒显式 `generate_audio=false`（官方默认 true，静默生成有声会破坏 v1 无声承诺）；1.0 系列不携带该字段。

## 计价与成本（2026-09-27 pivot）

- `estimate` 恒返回 `estimatedCost=null` + 契约 pricingStatus=uncalibrated——方舟按人民币刊例价/秒计费，刊例价表待补录进 api.json pricing 段（补录后 estimate 自动给出元级预估，零代码改动）。已知活动价（2.0 mini 四折 / 2.0 fast 七五折，企业用户限时）只入 overview.md 参考层，不进估算。
- `generate_shot`：预览明示「计价未校准 + 余额以控制台为准」；预算硬闸预算 budgetCredits（口径=元）仅在 `estimatedCost !== null` 时拦截，未校准时放行并显式提示「闸门未拦截」。
- `video_task`：done 集合 = succeeded；失败终态 = failed/expired → 记录标 failed + 写服务端 error 归因（幂等重提前置）；成片 URL `content.video_url` 优先，`output.video_url` / 顶层 `video_url` 兜底。

## 运行期纪律（沿用）

fetch 全带超时（提交 60s / 查询 20s / 下载 300s）；mp4 下载上限 500MB；同 shot 进程内互斥 + attempts 留 5 条防幂等竞态；重复 POST = 第二个任务（record task_id 未完成拒绝重发）。

## 待补录（overview.md 透明清单）

查询任务官方文档页（getTask 路径最终核实）、error-codes 完整表、model-list/定价页、generate_audio 对 fast/mini 的支持矩阵——补录只动契约两层文件，不改实现代码。