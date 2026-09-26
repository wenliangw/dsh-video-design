# declared-behavior

## 文档/描述宣称了行为 → 必须检查实现是否真做了

本次全面审查抓到的都是这一类（假契约）：
- `video_view` 描述说看「素材档案/纠错清单」→ 实现没读这两个目录（已补）。
- README/总纲说 `.dvd/config.json` 控制预算/默认参数 → 代码只读插件 Config，工作区配置是死配置（已改为合并链：shot > 工作区 config > 插件默认）。
- `apiKeyEnv` 配置项存在 → 消息引用它，但 registry 实际走 `<NAME>_API_KEY`（已删该项，消息统一 SEEDANCE_API_KEY）。
- `_sync_decision.rule.md` 说 supersedes 要更新旧决策 outcome → db 只有 insert 没有 update（已补 updateDecisionOutcome 并在 video_remember 联动）。
- generate_shot 幂等拦截消息说「用 video_task 更新状态再重提」→ video_task 没有失败标记能力（已补 failed 终态）。
- `_seedance.skill.md` 画幅列表多于 11 域封闭轴（3:4/adaptive 会被校验拦）→ 已对齐轴集合并注明「先扩轴再用」。
- 费率声明 content_filter=false 1.1 倍 → 预算闸/预览都没计入（已计入可叠加系数）。

## 检查方法（防再犯）

- 工具描述、README、总纲/速览/心法里每一句「功能声明」，逐个在 src/ 里 grep 对应实现。
- 特别盯三类高发区：① 配置文件声明（用户改它 code 不读它）；② 规则/心法要求的状态流转（'X 会更新 Y' 是否真有 write 路径）；③ 错误消息指路（'可用 Z 解决' 时 Z 是否真的能）。
- 修完一条假契约 → 立即补对应单测（这次补了 db roundtrip / loadWorkspaceConfig / pruneLegacy / 骨架无 decisions）。