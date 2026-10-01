# script2shot 心法 — 剧本 → 拍片计划（关键连接）

输入：`EP00N/script.md`（用户已确认的剧本）。
输出：`EP00N/plan.md`（拍片计划），确认后逐镜走 `_compile.skill.md` 收敛协议 + `generate_shot`。

剧本到镜头的连接点 = **卡片库**：beat 的情绪目标 → 手法卡情绪标签。卡片从此是词典不是画册——本心法保证每个镜头都有「叙事目的」出身，不做炫技空镜。

## 拆镜规则（beat → shots）

- 每 beat 拆 1..N 镜；信息密度定额：一镜讲一个信息（新人物 / 新动作 / 新情绪落点），满了就切。
- 景别递进：建立镜头（交代空间）→ 中景（动作）→ 特写（情绪落点）；跳切（同景别硬切）必须有意图（节奏/惊吓）。
- 时长守恒：本 beat 各镜时长之和 = beat 预估时长。

## 每镜定轴顺序（固定，不许跳步）

1. **叙事目的**：一句话——这镜观众必须收到什么信息/情绪。
2. **情绪标签** → 检索手法卡：直接 read `.dvd/doctrine/cards/` 与 `.dvd/doctrine/presets/`，按 front-matter `emotion_tags` 匹配（同标签多卡时取正交差异的 2–4 张做候选，交给 compile 选项化）。
3. **11 域草案**：size/angle/movement/composition/lighting/color/pacing/format 封闭轴从卡片 recipe 起步 + 按叙事目的微调；sound/vfx/performance 沿用 beat 的标注。
4. 草案是「出处明确的初值」，最终值走 compile 收敛协议（用户指哪改哪）。

## 相邻镜连贯约束（计划过检清单）

- 同场景 light/color 连续（跨镜色温不变）；除非剧情进入新时空。
- 180° 轴线不破（对话/追逐）；破线 = 明确意图（阵营翻转/时空切换）并在 plan 标注。
- 相邻景别跳档 ≤2（建立→中→特「LS→CU」可，「LS→ECU」不可无因）。

## plan.md 形态（一屏可扫的映射表）

| beat | 镜号 | 叙事目的 | 参考卡 | 11 域草案 | 时长 |
|---|---|---|---|---|---|

- 11 域草案列：标准层七字段缩写（size/angle/movement/composition/lighting/color/pacing/format + sound/vfx/performance 有则列）。
- 整体过用户确认一次（拍片计划是「这一集怎么拍」的共识），然后逐镜 compile。

## v1 边界（诚实）

- `generate_shot` 单镜生成 → 逐镜出片循环（v1）；多镜连贯叙事 + 合成为 v2——plan.md 的表结构已为 v2 铺路，不推倒重来。
- 参考卡只是出处的起点，成片结果仍是 model 的翻译——卡不承诺成片风格，只承诺「草稿方向经过词典检索」。