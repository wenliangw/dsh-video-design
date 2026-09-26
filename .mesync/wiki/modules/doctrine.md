# 模块规划：doctrine 官方能力库

> 状态：v1 已实现（11 轴 / 12 官方卡 / 3 组合包航运资产 + 装载器 + 轴值校验器）。

## 三阶层能力库（静态航运）

- **词汇轴**：11 域 = 经典 7 轴内核（封闭枚举严格校验）+ 4 扩展域（声音配乐/画幅时长输出/VFX特效后期/人物动作表演，开放成长枚举）。载体 = 双面 md：front-matter 存枚举与参数形状（机器锚），正文存技法说明/情绪标签/示例（LLM 血肉）；构建期导出 JSON Schema，spec lint 防漂移。
- **手法卡片**：第一公民。字段 = 名称/人话描述/轴值配方/情绪标签/示例/provenance（官方|项目沉淀）。v1 首批 12 张（dutch-angle/low-angle-hero/slow-push-in/orbit-reveal/silhouette-backlight/warm-side-light/over-shoulder-follow/whip-pan-cut/cyber-neon/one-take-long/vertigo-dolly-zoom/handheld-chase）+ 3 组合包（悬疑开场/治愈日常/史诗登场），先验链路。
- **组合包**：预制多卡配方，新手入口。
- **装载器**：`src/doctrine/index.ts` 解析双面 md（js-yaml front-matter），`validateAxes` 对封闭轴严格校验、开放轴放行；`loadCards/loadPresets/parseFrontmatter` 供工具面与测试调用。
- **Agent 读通路**：工作区初始化同步播种 `.dvd/doctrine/`（axes/cards/presets 参考副本）——compile 选项化从 cards/presets 抽样；封闭轴硬校验走插件航运副本（`lib/templates`），改工作区副本不影响 generate_shot 校验（扩轴需升插件版本）。

## skills 家族（心法，v1 已实现 10 个）

- **创作管线组**：`_compile`（收敛协议）、`_svg_preview`（绘制规范）、`_seedance`（转译/计价/底线）
- **记忆五块组**：`_init_story`（首次建档）/ `_sync_wiki`（wiki 增量）/ `_sync_taste`（品味两层 + 漂移）/ `_sync_decision`（决策因果链）/ `_material`（共识门控）/ `_correction`（纠错因果清单）＋ `_sync_video_memory`（记忆模型总览）
- **规则**：`_workspace.rule.md`（命名/配置纪律 + doctrine 副本语义）、`_correction.rule.md`（纠错纪律 + 诚实纪律）、`_sync_wiki/_sync_decision/_sync_taste/_material.rule.md`（四块记忆判定规范）
- 航运 skills 是默认值，story init 时拷贝进 `.dvd/skills`，用户可编辑覆盖。

## 职责边界

- 手法卡 = 「你会拍什么」（能力）；skills = 「你该怎么工作」（心法）。
- 航运 skills 是默认值，story init 时拷贝进 `.dvd/skills`，用户可编辑覆盖。
- 项目沉淀手法卡进 story wiki（provenance: project），人气/复用可回迁官方（v2 机制，数据模型已预留）。