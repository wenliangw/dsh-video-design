# video-workspace 层约定

- 命名：EP001/EP002（机器可排序）、shots 内 S001/S002…（镜头记录 JSON 与 mp4 同名并列）。
- **创作资产链（上游→出片）**：`.story/story-structure.md`（跨集：事件弧五段+分集计划，两个输入源的合流点）→ `EP00N/script.md`（本集四拍+beat 表，用户确认）→ `EP00N/plan.md`（主体词固定表+beat→shots 映射，用户确认）→ `EP00N/shots/`（单镜三份记录+mp4）。上一环未确认，下一环不动工。
- **结构与 wiki 双写边界**：story-structure.md 只存叙事位（欲望/缺陷/弧光/功能一句话）；外貌/关系/背景等设定面唯一归 `.story/wiki/`——两处字段不重复，结构首行指向 wiki。
- **断点续做**：跨会话恢复时以最近确认的落盘文件为准（story-structure/script/plan/shots 记录）；先 `video_view` 看全景，从最后确认的环继续，未确认草稿不算共识（以「待确认」区重议）。
- `.dvd/doctrine/` = 官方能力库参考副本（axes/cards/presets，Agent 读来选项化）；封闭轴硬校验走插件航运副本——改 `.dvd/doctrine` 里的卡片/轴值不影响 generate_shot 校验（要扩轴升插件版本）。
- 素材 disclosure：`.story/material/<类型>/<实体>/{card.md, card.svg, refs/}`；类型 candidate：characters / scenes / props。
- 资产不可重命名引用：已落盘 shot 的 index/episode 变更必须先 `video_remember` 记迁移决策再动文件。
- 配置分工：`.dvd.config.json`（工作区根）= 适配器凭证（多 adapter 按 `name` 对应，apiKey 可明文但**默认进工作区根 .gitignore**）；环境变量 `<NAME大写>_API_KEY` 兜底（文件留空时）；`.dvd/config.json` = 非敏感行为参数（预算/默认画质等）。
- **凭证保密红线**：`.dvd.config.json` 默认由初始化写入 .gitignore（若使用 git 管理）——**不得把用户 API 信息提交远端**；唯一的例外是用户自己把该行移出 ignore（= 明确决定共享），插件此后不得再加回。
- 新增 adapter 客户端 = 往注册表（代码）+ `.dvd.config.json` 各自加条目，缺一不可；未实现的 name 必须诚实报错，不得静默忽略。
- 工作区为索引唯一入口：跨工作区移动/复制故事目录后，需重新 `video_init` 注册并让索引重建（内容文件可随目录走，db 索引不随行）。