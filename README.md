# dsh-video-design

**dsh 视频创作插件**——把「拍摄手法」做成官方能力库，用自然语言驱动专业镜头语言，通过 seeddance 产出符合用户影视品味的视频；携 mesync 理念（认知/决策/品味/素材/纠错）越用越懂用户，从因果中学习。

> 状态：设计定稿 v2（本文档即完整设计）；MVP（单镜头）开发中。

## 理念

- **自然语言 → 专业镜头语言**：把「很燃」「主角登场」这类模糊需求，编译成结构化、可校验、可积累的镜头语言。绝不把用户的话直接喂生成 API。
- **手法即官方能力**：三阶层能力库（词汇轴 / 手法卡片 / 组合包），新手友好、可持续迭代。
- **记忆驱动**：wiki / tastes / decisions / material / corrections，选项化采集品味、共识门控沉淀素材、纠错记因果不记结果——「越用越省」（同样的坑不付第二次钱，第一版就更像你要的）。
- **选项化共同设计**：Agent 穷举多种专业拍法由用户选择，选择即品味信号。

## 官方推荐目录结构

```
video-workspace/                  ← 视频工作区根
├── README.md                     ← 工作区说明 + 故事索引（人读）
├── .dvd.config.json              ← 适配器 API 配置（多 adapter 按 name 对应；密钥建议 gitignore）
├── .dvd/                         ← 机制 + 工作区级记忆
│   ├── skills/                   ← 机制技能书（md，可编辑）
│   ├── rules/                    ← 判定与边界层（_workspace 契约 + 四块记忆判定 + _correction 纠错纪律）
│   ├── doctrine/                 ← 官方能力库参考副本（11 轴/12 卡/3 组合包正文，Agent 读）
│   ├── db/                       ← 工作区唯一 sqlite（story 索引 + decisions 决策链）
│   ├── tastes/                   ← 工作区级审美底色
│   └── config.json               ← 行为配置（预算/默认参数，非敏感）
├── story-A/                      ← 一个故事 = 一个目录
│   ├── README.md
│   ├── AGENTS.md                 ← 心法总纲（init 时生成，自动注入）
│   ├── .story/                   ← story 级记忆层（隐藏）
│   │   ├── overview.md           ← 故事速览（世界观/进度/约束摘要）
│   │   ├── wiki/                 ← 故事认知 + 项目沉淀手法
│   │   ├── tastes/               ← story 级审美（覆盖工作区底色）
│   │   ├── material/             ← 共识门控的人物/场景/道具档案
│   │   └── corrections/          ← 因果纠错
│   ├── EP001/
│   │   ├── shots/
│   │   │   ├── S001.json         ← 三份记录：shot / vendor_prompt / meta
│   │   │   └── S001.mp4
│   │   └── video.mp4             ← 该集合成成片（v2+）
│   └── EP002/
└── story-B/
```

- **`.dvd` = 机制 + 「跨故事所以在这里」**（审美底色/通用坑/配置）——名字即来自本插件包名 **dsh-Video-Design** 的缩写；**`.story` = 「这个故事的」**；**`EP00N/` = 创作资产本体**，story 目录第一公民，与隐藏记忆层同级。
- **内容落文件**（md/json/svg/mp4，可 git、可 diff、可拷走归档）；**索引落 db**（随时可从内容重建）。
- 品味双级：工作区底色 → story 覆盖；升维方向 story → 工作区。

## 核心链路（六层）

```
用户自然语言
   ▼
① 意图解析       想拍什么 / 什么情绪 / 输入具体度
   ▼
② 记忆检索       召回知识 + 注入品味 + 兜历史纠错
   ▼
③ transform      选项化逐层收敛 → 标准镜头语言 JSON
   ▼
④ adapter        标准 JSON → seeddance prompt + 参数
   ▼
⑤ 生成          异步任务 → video_task 轮询 → mp4 落盘
   ▼
⑥ 纠错学习      记错误因果 → corrections → 反向强化 ②
```

- ② 不是独立工序，是 ③ 的输入源：每一轮收敛、每次选项生成、每次改写都重新召回。
- **主 Agent 模型无关**：对话、编译、确认在 Agent 侧（靠注入心法 + skills），生成执行固化成工具合约（Node 侧）——任何模型可用。

## 三阶层官方能力库

- **层1 词汇轴（机器面）**：11 域 = 经典 8 轴内核（景别/机位角度/机位运动/构图/光线/色彩氛围/时间节奏/画幅，**封闭枚举严格校验**）+ 3 扩展域（声音配乐/VFX特效后期/人物动作表演，**开放成长枚举**，加词不动 schema）。
- **层2 手法卡片（第一公民）**：`名称 + 人话描述 + 轴值配方 + 情绪标签 + 示例 + provenance`。**迭代的单位是加卡**；provenance（官方/项目沉淀）为项目技法回迁官方留通道。
- **层3 组合包**：「紧绷悬疑开场 = 荷兰角 + 缓慢推近 + 冷色调」，新手入口。
- 载体：双面 md（front-matter 机器锚 + 正文 LLM 血肉），构建期导出 JSON Schema + spec lint 防漂移。
- 装载：**静态航运**（随插件包，首日可用）+ **项目生长**（`.story/wiki` 长项目特有知识）。

## 主工作闭环（上游创作链 + compile_shot 收敛协议）

```
① 粒度判定：整故事 / 单集 / 单镜头 —— 决定从哪一环进入
② 故事层（整故事时）：口述情节 _story 或 小说 _novel2story（事件为单位提取）
   → .story/story-structure.md（事件弧五段 + 分集计划）→ 用户确认
③ 剧本层（单集）：_screenplay 四拍 + beat 表 → EP00N/script.md → 用户确认
④ 拆镜层：_script2shot beat→shots + 每镜叙事目的/参考卡/11 域草案 → EP00N/plan.md → 用户确认
⑤ 逐镜编译环（单镜头从此进入）：
   具体度判定 → 记忆预筛（taste 高置信预填 + corrections 转约束）
   → 分层选项 ≤3 轮（感觉→手法→补缺，卡片抽样正交差异）
   → 确认卡（SVG 构图预览 + 11 域清单 + 素材登记区 + 约束区 + 成本预估）→ 出片
```

- 每轮选择 = 卡片级品味信号回流；确认卡勾选 = 素材共识落盘。
- **卡片库是转译词典**：剧本 beat 的情绪目标按 emotion_tags 检索手法卡，每个镜头都有叙事目的出身，不做炫技空镜。

## 提示词标准化与透明性

- **两层标准化**：标准层固定子句顺序 `[时间窗] 主体 | 镜头[size]值 | 镜头[angle]值 | …`（可倒解析回 8 个封闭视觉轴；声音/画幅/表演走厂商层扩展）；厂商层由 adapter 转译为叙述流单一字符串（seeddance 只收单一 prompt，[官方文档](https://www.seeddance.io/zh/docs/createVideoGeneration)）。**结构是我们的话语，厂商收的是翻译稿。**
- **三份记录**：每 shot 落盘 `shot`（标准 JSON）/ `vendor_prompt`（厂商全文快照）/ `meta`（model、duration、quality、task_id、attempts[]）。
- **透明性**：生成前 dry-run 展示全文（免费）；生成后任意时刻可回查；`attempts[]` 记录重拍历史，纠错归因直接回看喂给模型的原文。
- **防重复提交**：官方明示「重复 POST 会创建第二个任务」→ 提交即写 task_id，未完成前同 shot 不重发。

## SVG 预览「一图两用」

- **三用途**：shot 构图预览图（确认卡头图，把 11 域 JSON 渲染成机位/构图示意——杀手用途）；material 设定卡配图；分镜故事板缩略图（v2）。
- **参照图**：用户上传素材图 → 主 Agent `read_image` 多模态解读 → 在其基础上优化出 SVG 稿 + card.md → 确认卡原图 vs SVG 对照 → 确认才入档案。参照原件归档 `material/<实体>/refs/`。
- **SVG→PNG 栅格化**：sharp 首选（备选 resvg）——本地图**仅供人确认**（确认卡/设定卡），不能直接喂 seeddance（官方只收公网 HTTPS URL）；需要做参考素材时先上传获得公网 URL，再走 reference_urls（上传通道 v2 接图床）。
- **诚实边界**：SVG 是规范化示意，不承诺照片级；照片级增强（文生图 → 首尾帧）归 v2。

## 激活与心法注入

- **意图触发三态**（内容并入能力速览表）：插件不做纯文件检测。速览表常驻注入，其中写明：无 `.story` → 询问是否创建视频工作区；已有 → 直接激活；表意模糊 → 澄清；用户未表意 → 不出现任何能力。
- **注入面三块，全部文件驱动**：① **能力速览表**（常驻；读 `.dvd/capabilities.md`，缺失回退航运母版 `CAPABILITIES.md`——dvd 介绍 + 激活三态 + 11 轴/手法卡/组合包/7 工具/记忆五块/出片契约/红线整合一张表，用户可自行编辑调整）→ ② 心法总纲（故事 `AGENTS.md` 原文，缺失回退航运母版 `AGENT_TEMPLATE.md`）→ ③ Story Context 投影（overview/品味/进度/素材/纠错/决策动态数据）。
- **提示词纪律**：插件代码**不写死任何注入提示词**——注入内容一律读文件（航运母版 / 工作区可编辑副本 / 故事文件）；用户改文件即改行为，不必改代码发版。
- **心法静动分层**：静态（能力库 + skills + 速览表/总纲航运母版，随包）保证首日可用；动态（wiki/tastes/decisions/material/corrections 投影）保证越用越像你。
- **skills 家族**：上游创作链（`_story` 口述情节→故事结构 / `_novel2story` 小说→故事结构 / `_screenplay` 故事→分集剧本 / `_script2shot` 剧本→拍片计划）· transform 组（`_compile` 逐镜收敛/确认卡、`_svg_preview` 绘制规范）· adapter 组（`_seedance` 转译句法、厂商最佳实践、计费表）· 记忆整理组（sync wiki/taste/decision/correction + `_init_story`）。
- **rules 家族**（判定与边界层，动手前先读）：`_workspace`（目录/配置契约）、`_sync_wiki` / `_sync_decision` / `_sync_taste` / `_material`（四块记忆的判定规范）、`_correction`（纠错纪律）。出片底线（幂等/dry-run/预算）不成 rule——已是代码硬闸 + 红线，避免三处重复漂移。

## API 调用与成本

- **调用形态**：主 Agent 沟通确认 → `generate_shot(标准JSON)` 工具执行 → adapter 内部转译（模型无需懂厂商细节）→ 异步任务（POST 即返回 task_id）→ `video_task` 轮询/取片（完成态成片 URL 在响应 `output.video_url`；失败态标记记录 failed）。（后台 job/完成通知为 v2。）
- **凭据与保密**：`.dvd.config.json`（工作区根）配置多 adapter，按 `adapters[].name` 对应；`apiKey` 留空则回退环境变量 `<NAME大写>_API_KEY`（seedance 兼容 `SEEDANCE_API_KEY`）。初始化时**默认把该文件写进工作区根 .gitignore**（若使用 git）——用户 API 信息不提交远端；用户自行移出 ignore 行 = 明确决定共享，插件不再加回。v1 客户端仅 seeddance——配了未实现的 adapter 会在生成时诚实报错。
- **成本六设计**：① 确认卡成本预估（模型×时长×画质×模式因子积分计价）；② 免费 dry-run；③ 预算硬闸（config.json 上限，超限工具拒绝）；④ `getCredits` 查真实余额；⑤ 同 shot 幂等防重复扣费（pending 拒重发 + 进程内互斥 + 记录损坏硬失败，attempts 留最近 5 次）；⑥ 单 shot 粒度出片 + 记忆 ROI。
- **错误面**：402 余额不足 / 429 限流 / 422 参数错 → 中文可读提示；提示词超长按子句边界砍尾部（保主体）；content_filter 仅显式 false 时携带（按官方 1.1 倍费率并在确认卡标明）。

## MVP 边界

**v1 做**：上游创作链（故事结构 → 分集剧本 → 拍片计划三层心法，两输入源：口述情节/小说）；单镜头生成（自然语言 → 镜头语言 → seeddance 出片）；三阶层能力库首批精样板（~15 卡 + 3–5 组合包）；11 域词汇；选项化 + 确认卡（SVG 预览 + 素材共识登记 + 成本预估）；提示词两层标准化 + 三份记录；纠错闭环；一个 adapter（seeddance）；本地 bundle 跑通。

**v2+ 暂缓**：多镜头连贯叙事 + 合成（plan 表结构已铺路）；material 一致性锁定（人物/场景跨镜头锁定）；照片级设定图（文生图 → 首尾帧）；品味自动升维；第二 adapter（小云雀）；项目技法回迁官方。

## 开发路线

1. ~~插件骨架（Cordis bundle + 注入面（全文件驱动）+ 工具面契约）~~ ✅ 已交付（`src/` 单包结构，包名 dsh-video-design）
2. ~~doctrine：11 域词汇 schema + 精样板卡片 + 组合包~~ ✅ 已交付（11 轴 + 12 卡 + 3 组合包，front-matter 机器锚 + 装载器校验；JSON Schema 导出留批次二）
3. ~~seeddance-adapter（转译/计价/错误映射）+ generate_shot 幂等实现~~ ✅ 已交付（占位计价表，决策 ID `83186e33`）
4. ~~story init / 激活三态 / 确认卡 + SVG 渲染 + 素材登记~~ ✅ 骨架已交付（video_init + 速览表三态 + svg_render；确认卡由 Agent 按 `_compile.skill.md` 组织）
5. 上游创作链 ✅ 心法已交付：`_story`（口述情节→故事结构）/ `_novel2story`（小说→故事结构，事件推进提取）/ `_screenplay`（故事结构→分集剧本）/ `_script2shot`（剧本→拍片计划）——两输入源汇合 `.story/story-structure.md`，产物 script.md/plan.md 落 EP00N；（实际创作验证待晚间功能测试）
5. 全链路验证：模糊需求 → 出片 → 纠错回流（单元/冒烟已过；profile 挂载 + 真实出片待用户 dsh 环境）

构建与测试：`npm i && npm run build && npm test`（40 单测全绿 + 构建内建模板复制与冒烟）。

## 本仓库结构（单包，非多包 monorepo）

```
dsh-video-design/
├── src/                        ← 插件源码
│   ├── agent/                  ← 注入面（速览表/总纲/Story Context，全部读文件）+ 7 工具面
│   ├── adapter/seeddance.ts    ← 两层转译/计价/幂等出片
│   ├── doctrine/               ← 能力库装载器（资产在 src/templates/doctrine/：11 轴/12 卡/3 组合包）
│   ├── templates/              ← 航运资产（doctrine + skills + rules + agents 母版 + story/workspace 种子）
│   ├── workspace/  db/         ← 骨架初始化 · 工作区 sqlite 记忆索引
│   └── config/  index.ts       ← 配置 schema · Cordis 入口
├── test/                       ← 单元测试（40 个）
├── cordis.patch.yml            ← bundle 清单（id/name 一致：dsh-video-design）
└── README.md                   ← 本设计文档
```