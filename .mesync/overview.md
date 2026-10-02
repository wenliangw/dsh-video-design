# 项目速览

## 项目简介

dsh-video-design 是运行在 DeepSeek Harness(dsh) 里的**视频创作插件**。v1（master 分支，已归档）一次性建成了 11 域/手法卡/编译环/确认卡/上游链/记忆五块——但视频创作与代码生成本质不同（主观审美、依赖提示词、结果不可控、迭代成本=真金白银+等待），用户裁定改为**分步验证**方法论，v2 完全重构：每层能力上线前必须先被一次真实成片实验证明。

v2 当前最小核（`v2` 分支）：**纯提示词试验台**——两个工具（`shot_gen` 提交生成 / `shot_task` 轮询取片），插件零内置模型事实、零内置 URL 事实（模型/API Key/完整请求地址 100% 用户配置），零转译零计价（提示词一字不改直达模型）。有红线测试静态扫描源码钉住「不出现网址/模型版本串」。

## 技术栈（v2 最小核）

| 领域 | 选型 |
|---|---|
| 宿主 | dsh（Cordis 插件体系） |
| 插件形态 | npm 包声明 `dsh.bundle`，挂 profile bundles |
| 工具面 | `dsh-tools` 注册（2 工具：shot_gen/shot_task） |
| 配置 | `.dvd.config.json`（apiKey/model/createUrl/queryUrl）+ 环境变量通道；无插件级配置项 |
| 运行时依赖 | **零**（仅 node 内置 + @deepseek-ai/* peer）；测试 vitest |
| 视频生成 | 用户配置的模型 API（异步任务 + 轮询 + 取片） |

## 模块索引（v2）

- `src/index.ts` — bundle 入口（name/inject/apply）
- `src/agent/tools.ts` — shot_gen（提交+实验记录）/ shot_task（轮询+取片+回填）
- `src/adapters/seedance/seedance.ts` — 最小调用闭环：buildBody/createGeneration/getTask/downloadVideo（URL 全来自参数）
- `src/adapters/seedance/contract.ts` — 响应语义词汇（任务状态词/HTTP 语义；v1 六个真实任务验证）
- `src/workspace/config.ts` — 用户配置装载（文件 > 环境变量；缺什么列什么）
- `test/redline.test.ts` — 红线守护：源码禁出现完整网址/模型版本串（用户指令机器化）

## 目录约定（重要）

- **插件源码仓库**：`/home/7c/dsh-video-design`（v2 分支）——这里只有代码与测试，**不放用户配置**。
- **用户视频工作区**：`/home/7c/videos`——用户的实验工作区，`.dvd.config.json`（v2 形态四字段）与 `experiments/` 都在这。
- 插件找配置的发现机制（**照搬 master 已验证实现**）：从 `process.cwd()` 向上找 `.dvd` 目录标记（只认目录）→ 命中目录即视频工作区根 → 读工作区根下的 `.dvd.config.json`（与 `.dvd/` 同级）→ 环境变量补齐。在视频工作区开会话时自然命中；不在工作区如实报缺，不猜任何备选路径。

## 状态

- **v2 第一阶段已交付并推送**（`v2` 分支，commit 110d3b9）：工程最小核 + 红线测试，零运行时依赖。
- **配置发现机制最终定案**（`v2`，commit 67f0aa7，待用户重启 dsh 生效）：读完 master 源码后回退到其已验证实现——`.dvd` 标记目录发现 + 工作区根读配置；撤掉自造两轮（会话工作区宿主链、SEEDANCE_WORKSPACE 环境变量）。教训入决策链：master 已验证的能力重建时必须先读源码移植，禁止猜测发明。真环境只读验证：`resolveConfig(/home/7c/videos)` 命中四字段齐。测试项目跑法 = 在 `/home/7c/videos` 开会话调用工具。
- **下一步 = H0 生成器能力摸底实验**：纯提示词、无拍摄手法，同场景不同档位/参数格子逐个打，得到能力边界图。H0 之后才有 H1（句式效应 A/B）→ H2（跨镜像素链）等，每步一验证，验证不过不建上层。
- v1 完整归档于 `master`（四要素→基础面卡、prompt 建议值口径修正等历史均在 git 历史）；v1 的 wiki/modules 文档保留为历史参考，不再代表当前形态。
- 用户工作区 `/home/7c/videos` 归用户所有：插件开发**不修改其中任何文件**（密钥/配置属于用户私产）。