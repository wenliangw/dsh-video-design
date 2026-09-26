# video-workspace

dsh-video-design 视频工作区（官方推荐结构）：

- `.dvd/` — 机制（skills/rules/db）+ 工作区级审美（tastes）+ 行为配置（config.json）+ 能力速览（capabilities.md）
- `.dvd.config.json` — 适配器 API 配置（多 adapter 按 name 对应；key 可留空走环境变量）
- `story-*/` — 每个故事一个目录：`.story/` 记忆层 + `EP00N/` 创作资产