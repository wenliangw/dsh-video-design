# agent-instructions

## 在插件仓库放名为 `AGENTS.md` 的模板文件 → 必须检查 harness 自动加载污染

- 改动任何位于仓库内、文件名为 `AGENTS.md` 的文件（尤其航运模板）→ dsh harness 会把它当作**指令自动加载**进当前 Agent 上下文，模板里「本目录是视频故事项目」这类内容会劫持/污染**插件开发 Agent** 的认知。
- 因此航运到故事项目的 AGENTS.md 模板必须以 `AGENT_TEMPLATE.md` 名义存放（名字即语义：Agent 的模板），只在 `ensureStorySkeleton` 落盘到**仓库外**的故事目录时才叫 `AGENTS.md`。
- 为什么会发生：dsh 自动发现机制不分「模板」还是「正主」，只认文件名；模板写给「故事创作 Agent」，加载进「开发 Agent」就是认知污染。