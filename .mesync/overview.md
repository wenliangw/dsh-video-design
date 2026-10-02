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
- 插件找配置的锚点优先级：**环境变量 `SEEDANCE_WORKSPACE`（固定视频工作区，跨项目会话生效）> 会话工作区**（dsh 执行上下文 agent.id → `ctx.sessions.get(id).header.cwd`，即会话创建时的目录）**> `process.cwd()` 兜底**，全程 try/catch。

## 状态

- **v2 第一阶段已交付并推送**（`v2` 分支，commit 110d3b9）：工程最小核 + 红线测试，零运行时依赖。
- **配置锚点两级修复**（`v2`，待用户重启 dsh 生效）：①旧实现锚 `process.cwd()`（服务器进程启动目录），用户配置放在自己工作区（/home/7c/videos）就读不到——已改为「会话工作区优先」；②用户实测暴露更深问题：在别的项目会话（/home/7c/mesync）调用时，会话工作区≠视频工作区，向上路径仍碰不到配置——增加最高优先级锚点 `SEEDANCE_WORKSPACE`（固定视频工作区），回归测试 36 全绿。
- **下一步 = H0 生成器能力摸底实验**：纯提示词、无拍摄手法，同场景不同档位/参数格子逐个打，得到能力边界图。H0 之后才有 H1（句式效应 A/B）→ H2（跨镜像素链）等，每步一验证，验证不过不建上层。
- v1 完整归档于 `master`（四要素→基础面卡、prompt 建议值口径修正等历史均在 git 历史）；v1 的 wiki/modules 文档保留为历史参考，不再代表当前形态。
- 用户工作区 `/home/7c/videos` 归用户所有：插件开发**不修改其中任何文件**（密钥/配置属于用户私产）。