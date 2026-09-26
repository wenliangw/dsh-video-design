# 记忆模型总览 — 五块各管一件事

工作区级 `.dvd/` + 故事级 `.story/` 的记忆按「管什么事」分五块。**一条信息可同时属于多块：各记各的，不因「记了 A」跳过 B。**

| 块 | 回答什么 | 规则（判定/边界） | 心法（怎么做） |
|---|---|---|---|
| wiki | 故事是什么、什么定稿了 | `_sync_wiki.rule.md` | `_init_story.skill.md`（首次建档）/ `_sync_wiki.skill.md`（增量） |
| tastes | 用户偏好什么 | `_sync_taste.rule.md` | `_sync_taste.skill.md` |
| decisions | 为什么这么定、取舍了什么 | `_sync_decision.rule.md` | `_sync_decision.skill.md`（video_remember/video_recall） |
| material | 已共识的角色/场景/道具清单 | `_material.rule.md` | `_material.skill.md` |
| corrections | 踩过的坑怎么避 | `_correction.rule.md` | `_correction.skill.md` |

动手前先读规则（判定与边界）再读心法（步骤）。

## 原则

1. **惰性触发，不打断**：记忆读写融在创作流程里顺手完成，不打断对话、不长篇汇报。
2. **准确优先，宁可少记**：只记真实发生的事——不编世界观、不脑补偏好；不确定宁缺。
3. **记忆可演化**：品味会漂移、决策会被推翻、wiki 会演进——记录漂移/翻转本身就是记忆，不删历史。
4. **共识门控**：material 无确认不落盘；wiki 未确认进「待确认」区。

## 索引与内容分离

- wiki/tastes/material/corrections 内容落文件（md/json/svg，可 git、可 diff、可拷走）；story_registry 索引落工作区 db（可重建）。
- decisions 是例外：**全量落 db**（video_remember/video_recall），不落 .story——搬故事目录时用 video_recall 导出/迁移决策。