# dsh-video-design 能力速览（含激活协议）

## 这是什么（dvd 介绍 + 何时开工）

dsh-video-design（dvd）是 dsh 视频创作插件：把自然语言编译成专业镜头语言（11 域校验），转译两层提示词驱动出片，并用五块记忆越用越懂用户的品味。

**仅当用户表达视频创作意图时动作**（想做视频/短片/分镜/镜头设计/素材设定等）：
- 当前目录向上无 `.story`/`.dvd` → 询问用户是否用 dvd 创建视频工作区（用户确认后调用 `video_init`）。
- 已有 `.story` → 直接激活：读故事根 `AGENTS.md` 心法与 `.story/` 记忆，按 compile 心法服务用户；素材/镜头语言定案需用户共识确认，未经确认不入 `material/`。
- 表意模糊（如「帮我剪点东西」）→ 先澄清用途。
- 用户未表意 → 不主动出现本插件的任何能力。

## 一句话

自然语言 → 专业镜头语言（11 域校验）→ 两层提示词 → 出片（seeddance）；记忆五块越用越懂用户。

## 主工作闭环（上游创作链 + 七步编译环）

**上游创作链**（整故事/单集需求走这里）：口述情节 `_story` 或小说 `_novel2story`（以事件为单位推进，提取完整故事结构）→ `.story/story-structure.md`（事件弧五段 + 分集计划，用户确认）→ 分集 → `_screenplay` 每集四拍+beat 剧本（`EP00N/script.md`）→ `_script2shot` 拆镜+11 域草案（`EP00N/plan.md`，卡片库在此充当转译词典）。单镜头需求直接进编译环。

**七步编译环**：判定具体度（具体直编译/模糊选项化）→ 记忆预筛（video_recall + tastes/corrections 文件，高置信预填、历史坑转约束）→ 分层选项 ≤3 轮（感觉→手法→补缺，从手法卡/组合包取正交选项）→ 确认卡（SVG 构图预览 + 11 域清单 + 素材登记区 + 约束区 + 成本预估）→ `generate_shot` 出片（dry_run 先行）→ `video_task` 取片 → 纠错回流（记因果不记结果）。

## 三阶层能力库

| 层 | 规模 | 作用 |
|---|---|---|
| 词汇轴 | 11 域：经典内核 8 封闭枚举（景别/机位角度/机位运动/构图/光线/色彩氛围/时间节奏/画幅）+ 开放成长 3（声音配乐/VFX特效/人物动作表演） | `generate_shot` 入参校验；封闭轴非法值拦截，开放轴放行（加词不动 schema） |
| 手法卡 | 12 官方卡（荷兰角/仰拍英雄/缓慢推近/环绕揭示/逆光剪影/暖色侧逆光/过肩跟随/甩镜转场/赛博霓虹/一镜到底/希区柯克变焦/手持追逐）+ 故事沉淀项目卡（provenance: project，入 `.story/wiki/`） | compile 选项化候选；卡片 = 轴值配方 recipe + 情绪标签 + 人话示范；正文读 `.dvd/doctrine/cards/` |
| 组合包 | 紧绷悬疑开场 / 治愈系日常 / 史诗主角登场 | 新手捷径；组合包 = 多张卡 recipe 叠加；正文读 `.dvd/doctrine/presets/` |

## 工具面（7 个）

| 工具 | 干什么 |
|---|---|
| `video_init` / `video_view` | 建工作区+故事骨架 / 故事全景（故事结构·剧本·进度·决策·记忆） |
| `generate_shot` | 校验 → 两层转译 → 计价 → dry_run 预览 → 幂等提交；adapter 按 `.dvd.config.json` 的 `name` 对应 |
| `video_task` | 查任务进度；完成取回 mp4 落 `EP/shots/` 并回填记录状态 |
| `svg_render` | SVG → PNG（确认卡/设定卡预览图） |
| `video_remember` / `video_recall` | 记决策（因果链+品味指针）/ 召回决策摘要或详情 |

## 记忆五块（双级：工作区底色 → 故事覆盖）

| 块 | 落点 | 要点 |
|---|---|---|
| wiki | `.story/wiki/` + `overview.md` 摘要 | 故事认知 + 项目沉淀手法；只记定稿，未确认进「待确认」区 |
| tastes | `.dvd/tastes/`（底色）+ `.story/tastes/`（覆盖） | 高置信才记；≥2 故事升维工作区；漂移划删除线不删历史 |
| decisions | `.dvd/db/`（工具面 records） | 有取舍才记；`supersedes`/`caused_by` 成链，不记流水 |
| material | `.story/material/<类型>/<实体>/{card.md, card.svg, refs/}` | **共识门控**：用户确认才落盘 |
| corrections | `.story/corrections/<分类>.md` | 「改这里→检查哪里」，记因果不记结果 |

## 出片契约（重要）

- **两层提示词**：标准层（`[时间窗] 主体 | 镜头[key]值…` 固定子句序，可倒解析）+ 厂商层（单一叙述流字符串）；**三份记录** = shot 标准 JSON / vendor_prompt 全文 / meta（模型·时长·画质·task_id·attempts·状态）。
- **adapter**：v1 客户端仅 seeddance（火山方舟 Doubao-Seedance；契约文件驱动：`src/adapters/seedance/overview.md` + `api.json`，地址/入参/状态词/错误语义零代码写死）；`.dvd.config.json` 多条目按 `name` 对应，apiKey 留空走环境变量 `<NAME大写>_API_KEY`；未实现的 adapter 诚实报错，不静默。
- **成本**：计价现为**未校准占位**（方舟按人民币刊例价/秒计费，无积分/余额查询 API，余额以方舟控制台为准；刊例价表待补录 api.json pricing 段）；dry_run 免费；预算硬闸（`.dvd/config.json` 的 budgetCredits，口径为元；费率未校准时闸门放行并明示）。无声承诺：2.5/2.0 系列恒显式 `generate_audio=false`（官方默认 true），1.0 系列不携带。
- **幂等**：同 shot 有 pending 任务拒绝重复提交（官方明示重复 POST 会开第二个任务）。

## 红线（六条）

共识门控（material 未确认不落盘）· 幂等出片 · dry-run 先行 · 成本即责任（确认卡明码标价）· 纠错记因果 · 凭证保密（`.dvd.config.json` 默认 gitignore，用户移出为准）。

## 分层心法（按需读 `.dvd/skills/` 与 `.dvd/rules/`，具体操作不凭感觉）

- 创作管线：`_story`（口述情节→故事结构）/ `_novel2story`（小说→故事结构）/ `_screenplay`（故事→分集剧本）/ `_script2shot`（剧本→拍片计划，key 连接）→ `_compile`（逐镜收敛协议）/ `_svg_preview`（绘制规范）/ `_seedance`（转译·计价·底线）
- 官方能力库正文：`.dvd/doctrine/`（axes 11 轴 / cards 12 卡 / presets 3 包——compile 选项化从 cards/presets 抽样；封闭轴硬校验以插件航运为准）
- 记忆五块：`_init_story` / `_sync_wiki` / `_sync_taste` / `_sync_decision` / `_material` / `_correction` ＋总览 `_sync_video_memory`
- 规则（判定与边界，动手前对照）：`_workspace`（目录/配置契约）、`_sync_wiki` / `_sync_decision` / `_sync_taste` / `_material`（四块记忆判定规范）、`_correction`（纠错纪律）

<!-- 本表为速览：只答「有什么、去哪办」，细节一律去 .dvd/skills/ 与 .story/ 对应文件。 -->