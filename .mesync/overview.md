# 项目速览

## 项目简介

dsh-video-design 是运行在 DeepSeek Harness(dsh) 里的**视频创作插件**（v1 已交付）。它把「拍摄手法」做成官方能力库，让用户用自然语言生成专业镜头语言，驱动 seeddance 视频生成 API 产出符合其影视品味的视频；并携带 mesync 理念（wiki/tastes/decisions/material/corrections）让插件越用越懂用户、从因果中学习。

核心价值不是「能出片」，而是：

- 把「很燃」「主角登场」这类模糊自然语言，编译成**结构化、可校验、可积累**的镜头语言。
- 记忆驱动：选项化采集品味、共识门控沉淀素材、纠错记因果不记结果。

## 技术栈（规划）

| 领域 | 选型 |
|---|---|
| 宿主 | dsh（Cordis 插件体系） |
| 插件形态 | npm 包声明 `dsh.bundle`，挂 profile bundles |
| 注入面 | `systemPrompt.section`：能力速览表（常驻，文件驱动）+ AGENTS.md 总纲 + Story Context 投影；skills/rules 按需读 |
| 工具面 | `dsh-tools` 注册（7 工具：video_init/video_view/video_remember/video_recall/generate_shot/video_task/svg_render） |
| 内容/索引 | 内容落 md/json 文件，索引关系落 sqlite（`.dvd/db/`） |
| SVG 栅格化 | sharp 首选 / resvg 备选 |
| 视频生成 | seeddance API（异步任务 + 积分计费） |

## 模块索引

- **dsh-video（插件核心）**：Cordis bundle——注入面（能力速览表常驻 + AGENTS.md 总纲 + Story Context 投影，**全部文件驱动、代码不写死提示词**）+ 工具面（`video_init`/`video_view`、`generate_shot` 幂等出片、`video_task`、`svg_render`、`video_remember`/`video_recall`）+ 骨架初始化 + 多 adapter 凭证配置（`.dvd.config.json`）+ 决策库。详见 [wiki/modules/plugin-core.md](wiki/modules/plugin-core.md)
- **doctrine（官方能力库）**：三阶层能力库——11 域词汇轴、手法卡片（provenance 官方/项目沉淀）、组合包；静态航运，SKILL.md + references 按需读。详见 [wiki/modules/doctrine.md](wiki/modules/doctrine.md)
- **seeddance-adapter**：标准镜头语言 JSON → seeddance prompt 转译、计价表、错误码映射、reference_mode/首帧模式。详见 [wiki/modules/seeddance-adapter.md](wiki/modules/seeddance-adapter.md)
- **skills 家族（心法）**：记忆整理组（sync wiki/taste/decision/correction）、transform 组（compile/确认卡/dry-run）、SVG 绘制规范组、adapter 组。详见 [wiki/modules/doctrine.md](wiki/modules/doctrine.md)

## 状态

设计讨论定稿（v2，README.md 为完整设计文档）；**v1 首版已交付并推送远端**（github.com/wenliangw/dsh-video-design master；本机 git HTTPS 传输层 GnuTLS 握手失败，已切 SSH remote 正常推拉，见 corrections/env-git-push.md）；单包结构（包名 dsh-video-design，源码在 `src/`，非多包 monorepo；`.dvd` 名即 dsh-Video-Design 缩写）+ doctrine（11 轴/12 卡/3 组合包）+ seeddance adapter + 7 工具 + 三块注入面（全文件驱动，代码零提示词）+ 工作区行为配置生效 + 6 rules/10 skills 航运资产 + `.mesync` 项目记忆随仓库走（敏感审计通过）；profile 挂载与实际场景功能测试待用户 dsh 环境（晚间开始）。