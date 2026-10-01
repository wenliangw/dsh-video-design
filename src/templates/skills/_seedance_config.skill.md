# _seedance_config — seeddance 适配器配置引导（字段语义 + 官方文档查阅）

> 本心法管「帮用户把 seedance 配好」：`.dvd.config.json`（API 凭证 / 模型 / 家族能力声明）+ 相干的 `.dvd/config.json`（画质 / 预算 / 参考图语义开关）。
> 出片转译与阈值见 `_seedance.skill.md`；契约事实（地址、入参标准、上限、家族预设）**一律以 `src/adapters/seedance/overview.md` + `api.json` 为准**，本心法不重复数字、不写死参数值。

## 0. 什么时候用本心法

- 用户要求配置 / 更换 seedance 凭证、模型、家族能力（含「帮我配好生成」「换个模型」「API Key 报错」等）。
- `generate_shot` / `video_task` 因配置缺失或错误被拒：缺 key、缺模型、模型家族未登记、401、参数类 400。
- 创建新工作区后用户首次开跑前的初始化引导。

## 1. 字段全解（.dvd.config.json 的 adapter 条目）

| 字段 | 语义 | 特殊含义与坑 |
|---|---|---|
| `name` | adapter 标识 | v1 固定 `"seedance"`，别改 |
| `baseUrl` | API 基地址 | 覆盖链：本文件 > 环境变量 `SEEDANCE_BASE_URL` > 契约默认。**区域语义**：key / 模型端点必须在同一 region，默认 cn-beijing；换 region 要查官方区域文档，不能用猜的 |
| `apiKey` | 方舟 Ark API Key | 留空回退环境变量 `SEEDANCE_API_KEY`。红线：不向用户索要全文（让用户自己填文件/设环境变量），不打印、不回显、不写入任何记忆档案 |
| `model` | 必填，无内置默认 | 两种形态：**版本化 Model ID**（前缀=家族、日期=版本，如 `doubao-seedance-2-0-fast-260128`）或 **Endpoint ID**（`ep-*`，字符串里没有家族信息）。**不得代编**：以用户方舟控制台 model-list 为准，或按 `overview.md`「当前在售版本」表核对（该表可能过期，标了核对日期） |
| `family` | 显式声明家族名 | 当前缀解析不认识模型 ID 时用（Endpoint ID / 全新家族）。填一个已登记家族名（2.5 / 2.0 / 2.0fast / 2.0mini / 1.0pro / 1.0profast）= 整套预设复用，一行解决 |
| `caps.durationRange` | 家族时长范围 `[最短秒, 最长秒]` | 客户端会按它 clamp 并**恒显式传值**（官方 `-1`=模型自选，v1 不用）。填错最短值（比如 2.5 家族最小 4 填成 2）会被静默 clamp——数字必须查官方文档，不拍脑袋 |
| `caps.maxReferenceImages` | 参考图上限张数 | **0 = 该家族不支持参考图**（1.0 系列就是）。注意角色语义：3+ 张图（或 reference_mode）走 `reference_image`；1–2 张走首/尾帧角色 |
| `caps.maxFirstLastFrame` | 首尾帧上限 | 1 = 仅支持首帧；2 = 支持首尾帧。与 maxReferenceImages 是两回事 |
| `caps.generateAudio` | **语义陷阱最大的一项** | `explicit-false` = 家族**支持**该参数（v1 恒发 false，守无声承诺）；`omit` = 家族**不支持**该参数（请求不携带）。选错的两类后果：对不支持的家族发字段 → 服务端 400；对支持的家族 omit → 官方默认 true → 成片有声，无声承诺失守。默认方向选 `explicit-false`（宁可透明 400 也不静默出声） |

## 2. 配置流程（引导用户，不代猜）

1. **读现状**：读工作区根 `.dvd.config.json`（缺失 / JSON 损坏 / 字段空都要如实报告）；环境变量通道（`SEEDANCE_API_KEY` / `SEEDANCE_MODEL` / `SEEDANCE_BASE_URL`）只提示「有/无」，不打印值。
2. **诊断**：对每条缺失或可疑项，一次只问当下需要的最小信息——不要把全部字段一次性抛给用户。
3. **自行查阅官方文档**（主 Agent 主动做，不用等用户教）：
   - 首选契约人面 `src/adapters/seedance/overview.md`：官方文档转录、来源 URL、核对日期、待补录清单——参数语义以它为准。
   - 需要**最新事实**（当前在售模型 ID、新家族能力、region 与计费）时，用 web 检索官方页：
     - 创建视频生成任务 API：`https://ark.volcengine.com/region:cn-beijing/docs/ark/create-video-generation-task-api`（请求参数语义的权威页）
     - 模型列表 / 计费页在方舟控制台（**登录墙**）：不能装作已读——用公开的官方兼容镜像交叉核对（如亿速云、apifox 官方格式页），并明示「来源：镜像（非官方），以方舟控制台为准」；或直接请用户贴控制台信息。
   - 官方文档查不到的数字就明说查不到，绝不编。
4. **给方案并确认**：把改动后的完整 JSON 片段给用户看，每个改动字段附一句话解释；特别语义（`generateAudio` 两值、Endpoint ID + family）要点名。**用户确认后才写文件**（配置变更同样是共识）。
5. **写文件**：只动 `.dvd.config.json` 的目标条目，不碰其他键；写完后用 JSON 校验确认合法。
6. **验证**：用 `generate_shot` 的 `dry_run=true` 跑一单最省参数（短时长、低画质）验证全链路——dry_run 免费且会走到模型/家族解析；通过后再请用户决定是否真提交。

## 3. 报错 ↔ 配置动作速查

- 「未配置模型」→ 补 `adapters[].model`（或 `SEEDANCE_MODEL`）
- 「未在契约已登记家族内」→ 补 `family`（复用预设）或 `caps` 四字段（新家族）
- 401 鉴权失败 → 查 apiKey / Endpoint 权限 / region 是否匹配
- 400 参数不符合要求 → 查 duration/resolution 与家族上限（契约表），或参考图张数/角色
- 业务码 `TaskTypeConstraint` / `TaskTypeMismatch` → 参考图数量与 role 语义和任务类型不兼容

## 4. 红线

- **不编造**：不代编 model ID、不代编 caps 数字——查不到就明说，请用户贴控制台信息。
- **官方文档唯一事实源**：写入配置的每个数字都有出处（官方文档 / 契约转录 / 镜像交叉核对），核对日期与来源在回复里讲明。
- **凭证保密**：绝不打印 API Key、绝不写入记忆文件（`.story/` / wiki / decisions）。
- **契约改动走维护流程**：发现契约与官方文档冲突时，暂停配置，按 `src/adapters/README.md` 的维护流程改 `overview.md` + `api.json` 并跑测试，再回来继续配置——本心法只指导「用」，不指导「改契约内部事实」。