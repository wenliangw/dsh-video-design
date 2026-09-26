---
key: sound
label: 声音与配乐
kind: open
values:
  - { id: none, zh: 无声（纯画面）, tags: [留白, 悬念] }
  - { id: ambient, zh: 环境音, tags: [沉浸, 真实] }
  - { id: piano, zh: 钢琴极简, tags: [治愈, 情绪] }
  - { id: epic-orchestra, zh: 史诗管弦, tags: [宏大, 登场] }
  - { id: tense-strings, zh: 紧张弦乐, tags: [悬疑, 推进] }
  - { id: electronic, zh: 电子节奏, tags: [燃, 酷, 运动] }
  - { id: diegetic, zh: 环境真实声（人声/脚步）, tags: [真实, 情感] }
---

# 声音与配乐

开放成长轴：新声音设计词条随时可加（加词不动 schema）。

- v1 现状（诚实）：本轴仅作**记谱**（进入标准层语义，供合成/v2 音频模型用）；generate_audio 尚未接线到 seeddance 请求（当前出片为无声成片）。
- 无声是高级留白，悬疑场景首选。
- 声音与节奏必须同频：fast + electronic、calm + piano。