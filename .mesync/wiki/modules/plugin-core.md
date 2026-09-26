# 模块规划：dsh-video 插件核心

> 状态：v1 已实现（骨架 + 注入面 + 工具面 + 骨架初始化 + 多 adapter 凭证配置 + 工作区行为配置生效），profile 挂载验证待用户 dsh 环境。检查轮全面审查后修复一批逻辑/契约问题（见下）。

## 全面审查修复（自检 + 双复审，adopted）

- **运行参数合并链**：`shot.shot.duration`（2–30 钳制）> 工作区 `.dvd/config.json`（defaultDuration/defaultQuality/defaultAspectRatio/budgetCredits/adapter）> 插件 Config——`loadWorkspaceConfig`；此前 `.dvd/config.json` 是死配置（代码根本不读），README 假契约，修。
- **画幅轴生效**：`axes.format`（封闭枚举 '16:9'/'9:16'…）映射请求 `aspect_ratio`，此前校验后丢弃。
- **费率系数完整计入预算闸与预览**：reference_mode 带参考图 ×1.1、content_filter=false ×1.1（可叠加）；此前 content_filter 未计费。
- **attempts 追加不覆盖**：幂等重提保留历史 attempts；`2.0-mini` 移除 1080p 占位价 0（misleading 免费）。
- **决策因果链闭环**：新增 `updateDecisionOutcome`；`video_remember` 传 `supersedes` 时自动把旧节点标 refined（或 `superseded_outcome=reverted`），此前规则里有、实现里没有。
- **video_task 失败终态**：failed/error/cancelled → 记录标 failed（解除 pending 死锁，可重提）；done 集合加 success。此前幂等拦截消息引导「用 video_task 更新状态」，但实现没有失败标记能力——自相矛盾。
- **video_view 补素材/纠错清单**（描述承诺了、实现没读）；**decisions 不落 `.story/`**（全量 db），移除死目录并同步总纲/README/记忆总览措辞。
- **`apiKeyEnv` 配置项移除**（与 registry 的 `<NAME>_API_KEY` 解析脱钩，误导）；消息统一引用 SEEDANCE_API_KEY。
- **产物依赖修正**：better-sqlite3/js-yaml/schemastery/sharp 从 devDependencies 移到 dependencies（模块加载期即 import，宿主安装生产包缺它们会崩）。
- 旧名清理：copyTemplates 加 pruneLegacy（correction.skill.md → _correction.skill.md 等改名残留自动删除）。
- outcome 非法值归一为 adopted；video_remember 参数补 superseded_outcome。

## 适配器凭证配置（用户拍板）

- 工作区根 `.dvd.config.json`：`{"adapters":[{"name","baseUrl","apiKey","model"}]}`——多 adapter 按 `name` 对应；apiKey 留空回退环境变量 `<NAME大写>_API_KEY`（seedance 兼容 SEEDANCE_API_KEY）。
- `.dvd/config.json` = 行为参数（预算闸/默认画质等非敏感项）；凭证优先顺序：文件 apiKey > 环境变量。
- **保密默认**：首次初始化自动把 `.dvd.config.json` 写进工作区根 `.gitignore`（追加不触碰已有内容）；API 信息不提交远端——用户自行移出该行 = 明确共享，插件此后不加回（ensureSensitiveIgnored 仅在 created 时调用）。
- v1 客户端仅 seeddance（`SUPPORTED_ADAPTERS`）；未实现的 name 诚实报错不静默。
- 解析实现：`src/adapter/registry.ts`（loadAdaptersConfig/resolveAdapter/describeAdapters）。

## 职责

Cordis bundle——注入面 + 工具面 + 工具内部实现。

## 注入面（v1：三块，全部文件驱动——代码不写死任何提示词）

位序：`video-capabilities`(125，常驻) → `video-doctrine-guide`(135，有 story 时) → `video-story-context`(145，有 story 时)。

- **能力速览表**（唯一常驻块）：读 `.dvd/capabilities.md`（工作区在场时；缺失回退航运母版 `CAPABILITIES.md`）。内容 = dvd 介绍 + 激活三态 + 一句话/主闭环/三阶层/7工具/记忆五块/出片契约/红线/分层心法（触发块已并入本表，主 Agent 只注入速览表）。用户可编辑 `.dvd/capabilities.md` 自行调整。
- **心法总纲**：读故事 `AGENTS.md` 原文；缺失/空白回退航运母版 `AGENT_TEMPLATE.md`（无硬编码兜底文案）。
- **Story Context**：动态数据投影（overview/品味/EP进度/素材/纠错/决策），结构标签在代码、内容全部来自文件与 db。
- 种子模板（story overview/README、workspace README、dvd-config.json）也全部航运文件化（`src/templates/story|workspace/`），`seedFileIfAbsent` 幂等播种。
- skills + rules 按需读（skill = 怎么做，rule = 判定与边界，动手前先读规则再读心法）：航运拷贝至 `.dvd/skills` + `.dvd/rules`（用户可编辑），主 Agent 用 read 工具读。内部文件一律 `_` 下划线命名。rules 家族六份：`_workspace`（目录/配置契约）、`_sync_wiki` / `_sync_decision` / `_sync_taste` / `_material`（记忆四块判定规范，对齐 mesync rule=规范层形态）、`_correction`（纠错纪律）；出片底线（幂等/dry-run/预算）不单独成 rule（已代码硬闸 + 红线，防三处重复）。

## 工具面（契约，v1 已实现）

| 工具 | 契约要点 |
|---|---|
| `video_init` | 建工作区/故事骨架：.dvd（skills/rules/tastes/db/config.json）+ story（.story 记忆层 + EP001 + AGENTS.md 总纲），skills/rules 航运资产幂等实例化，故事注册入库 |
| `video_view` | 故事全景：overview + EP 进度 + 素材档案/纠错清单 + 最近决策 |
| `video_remember` | 记创作决策（决策链 caused_by/supersedes/taste_signals），落工作区库 |
| `video_recall` | 召回决策：摘要列表（query/scope）或单条详情 |
| `generate_shot` | 标准 JSON 校验（11 域）→ 两层转译预览 → dry_run 或提交：幂等（pending 拒重发）、预算硬闸（费率系数全计入）、（有 key 时）查真实余额、三份记录落盘；参数合并 shot > 工作区 config > 插件默认；attempts 追加 |
| `video_task` | 任务进度；失败终态标 failed；完成时下载 mp4 进 EP/shots 并更新记录状态 |
| `svg_render` | SVG→PNG（sharp 动态 import，失败给安装提示）；本地图仅供人确认 |

> 命名决策：全部带 video_ 前缀或领域名，避免与 dsh-mesync 工具同名冲突（决策 ID 903df615）。

## 调用关系

- 依赖 dsh 宿主：tools / session-projection / agent-instructions / skill / jobs / ask-user。
- 依赖 doctrine（校验 schema 与卡片索引）、seeddance-adapter（generate 内部转译）。
- 被主 Agent 调用；Agent 模型无关（工具描述自洽 + schema 严格校验）。