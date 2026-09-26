# 架构：dsh-video 插件

## 1. 运行形态（宿主接缝）

形态是 **Cordis bundle**（npm 包声明 `dsh.bundle`，挂进 profile 分层加载）。会话注入三块（**全部文件驱动，代码不写死任何提示词**）：

1. **能力速览表**（常驻唯一块）：读 `.dvd/capabilities.md`（缺失回退航运母版 `CAPABILITIES.md`），内含 dvd 介绍 + 激活三态 + 一句话/主闭环/三阶层能力库/7 工具/记忆五块/出片契约/红线/分层心法目录，用户可编辑调整。
2. **AGENTS.md 心法总纲**：story 初始化时落盘到 story 根（母版 `AGENT_TEMPLATE.md`），会话内由插件读原文注入；缺失回退航运母版。
3. **Story Context 投影块**：每轮注入 wiki/tastes/decisions/material 摘要 + EP 进度 + 纠错索引（工作区底色在前，story 覆盖在后）。

工具面：`video_init`/`video_view`、`generate_shot`（校验+转译+计价+幂等出片）、`video_task`、`svg_render`、`video_remember`/`video_recall`。

## 2. 六层处理链路

```
用户自然语言
   ▼
① 意图解析          用户想拍什么 / 什么情绪 / 输入具体度
   ▼
② 记忆检索          召回知识 + 锁定一致性 + 注入品味 + 兜历史纠错
   ▼
③ transform（共同设计） 人话 ↔ 标准镜头语言，选项化逐层收敛
   ▼
④ adapter          标准 JSON → seeddance prompt + 参数
   ▼
⑤ 生成             异步任务 → 后台 job → mp4 落盘
   ▼
⑥ 纠错学习         记错误原因（因果）→ corrections → 反向强化 ②
```

依赖关系：② 不是独立工序，是 ③ 的输入源——每一轮收敛、每次选项生成、每次改写都重新召回。主 Agent 只负责 ①②③⑥（模型无关，靠注入心法），④⑤ 固化在工具合约里（Node 侧执行）。

## 3. 激活协议（意图触发三态）

video 是目的驱动的工作，不做纯文件检测。常驻注入的能力速览表（含激活协议）识别用户表意后：

- 态①：当面目录向上找不到 `.story`/`.dvd` → 询问是否用 dsh-video 创建视频工作区；确认才 init。
- 态②：向上找到 `.story` → 直接激活，不重复询问。
- 态③：表意模糊 → 澄清用途后决定。
- 用户未表意 → 永不主动出现。

## 4. 目录契约（官方推荐结构）

```
video-workspace/              ← 工作区根
├── README.md                 ← 工作区说明 + 故事索引
├── .dvd/                     ← 机制 + 工作区级记忆
│   ├── skills/ rules/ db/    ← 机制技能书 / 规则 / 唯一 sqlite（单库多 story）
│   ├── tastes/               ← 工作区级审美底色
│   └── config.json           ← adapter 选择、预算上限、默认参数（key 不进明文）
└── story-A/                  ← 一个故事 = 一个目录
    ├── README.md
    ├── .story/               ← story 级记忆层
    │   ├── overview.md  wiki/  material/  tastes/  corrections/  （decisions 不在 .story，全量在 .dvd/db）
    ├── EP001/
    │   ├── shots/S001.json + S001.mp4
    │   └── video.mp4
    └── EP002/
```

设计哲学：`.dvd` = 机制 + 「跨故事所以在这里」（审美底色/通用坑/配置）；`.story` = 「这个故事的」；`EP00N/` 是创作资产本体，story 目录第一公民，与隐藏记忆层同级。wiki/tastes/material/corrections 内容落文件（可 git、可拷走归档），story 索引与 decisions 全量落 db。

## 5. 主工作闭环（compile_shot）

七步：具体度判定（具体直编译/模糊选项化）→ 记忆预筛（品味预填 + 历史坑转约束）→ 分层选项 ≤3 轮（感觉层→手法层→补缺层，卡片抽样）→ 确认卡（头图 SVG 构图预览 + 11 域清单 + 素材登记区 + 约束区 + 成本预估）→ 指哪改哪（单域重选）→ 标准 JSON → seeddance 出片。

## 6. 记忆双级与升维

品味双级：工作区底色（`.dvd/tastes`）→ story 覆盖（`.story/tastes`）。升维方向 story → 工作区（不再有 user 全局层）。纠错同样两层：story 级（叙事语境坑）/ 工作区级（生成器通用坑，反复踩坑升级为生成器约束决策）。