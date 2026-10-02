// agent/skills.ts —— 插件自带能力：一镜提示词编写心法（shot_gen 输入控制层）
//
// 归属：这是 dsh-video-design 插件本身的能力，不是代码开发记忆（.mesync 的事）。
// 通过宿主 @deepseek-ai/dsh-skill 的 ctx.skills.register 注册为运行时 skill——agent
// 首次请求前会从目录看到它，可用 skill 工具加载全文；用户也可 /video-shot-prompt 显式调用。
// 内容零内置事实：只有写作纪律，没有任何模型/URL/手法内容（红线测试扫本文件亦然）。

import type { Context } from '@deepseek-ai/cordis'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

export const PROMPT_SKILL_NAME = 'video-shot-prompt'

const SKILL_BODY = `# 一镜提示词编写心法（shot_gen 输入控制层）

本 skill 决定「发给 shot_gen 的每一段 prompt 怎么写」。它是 H0 能力摸底的前置层：
先把输入钉规范，边界图才有归因价值——成片失败时才能判断是「写出问题」还是「模型能力问题」。

## 为什么存在

v2 最小核的 shot_gen 不做任何转译：提示词一字不改直达模型——写 prompt 的质量就是模型的执行上限。
首个真实数据点 greet-r1 已暴露输入侧两路问题：

- prompt 人物只写「女大学生+双肩包」→ 成片「没有人物特点」（模型没素材可渲染）
- prompt 四拍动线全塞一句长句 → 难以判「掉拍发生在哪一拍」

## 一镜 prompt 四段式（顺序不许乱）

1. **场景常量**：时间 + 地点，只写事实。例：校园早晨，……
2. **人物定卡**：固定短语，四件特征缺一不可——发型 / 上装 / 下装 / 配饰。
   例：梳高马尾、穿米白色羽绒服和深蓝牛仔裤、背浅灰色双肩包的年轻女大学生
   已定卡的实验轴里，这段文字一字不改地嵌入每个 prompt（人是常量，变的是轴）。
3. **动作拍**：每拍独立一句。每句只放一个主动词，动词前加方式副词让执行不模糊：
   从校园大门外慢慢走进校园 ／ 停下脚步 ／ 微笑着挥了挥手。
   多拍拆成多个短句，一行一拍，好数。
4. **环境句**：只保留两三个词的现实描述（写实风格，自然光线）。到此为止。

## 禁写清单（出现即删）

- 拍摄手法词：景别（特写/中景/远景）、机位（俯拍/低机位/环绕）、运镜（推近/拉远/跟随）
  ——这是 v1 砍掉、v2 红线验证「纯提示词」的分界，不允许溜回来。
- 打光话术：电影感/柔光/黄金时刻/氛围感。
- 形容词堆砌：每个名词最多一个修饰，动词最多一个方式副词。
- 人物描述必须四件全，不给模型留自由发挥的空间。

## 事实与假设分开（本次实验的纪律）

- 事实（已由真实成片观察）：人物素材薄→没特点；已写明的动线可能掉拍（greet-r1，单次观察）。
- 假设（待验证，不写入 prompt 教条）：5s 内 ≤2 拍更稳——H0 动线轴逐档就是为了验证它。
- 写 prompt 时只应用「事实」，不把「假设」写成规则。

## 提交前自检（每格 prompt 发出去之前逐项勾）

- [ ] 四段式齐全，场景/人物/动作/环境各司其职
- [ ] 人物四件特征与定卡逐字一致（该轴是人常量时）
- [ ] 每拍一个主动词、一句一拍，拍的个数与格网表一致
- [ ] 无任何拍摄手法词/打光话术/形容词堆砌
- [ ] 只动该动的变量：换拍数只换拍数，其余全冻结
- [ ] 与 docs/h0-experiment.md 格网表的对应格 prompt 一致（格网 prompt 是冻结的源码，不允许临场重写）

## 与 H0 格网的关系

docs/h0-experiment.md 里的格网 prompt 已按本 skill 冻结。跑格子 = 原文照发 + 重复 3 次。
如果要改格网 prompt，先改文档再跑，绝不在工具调用时临场发挥——否则 3 次重复就不是同一格。`

/** 把「一镜提示词编写心法」注册进宿主 skill 目录（agent 可见、可加载） */
export function registerPromptSkill(ctx: Context): void {
  if (!ctx.skills) return // 宿主未挂 skill 注册表时静默跳过（最小核可降级不加载）
  const skill: SkillRegistration = {
    name: PROMPT_SKILL_NAME,
    description: '写视频生成提示词的纪律：四段式结构、每拍一动词、人物定卡、禁拍摄手法词、提交前自查——起草 shot_gen prompt 前必读。',
    whenToUse: '任何要向 shot_gen 提交提示词（起草、修改、逐格实验）之前，先加载并按它自查。',
    source: 'bundled',
    content: SKILL_BODY,
  }
  ctx.skills.register(skill)
}